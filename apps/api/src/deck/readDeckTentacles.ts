import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { DeckTentacleStatus, DeckTentacleSummary } from "@octogent/core";

const TENTACLES_DIR = ".octogent/tentacles";

const VALID_STATUSES: ReadonlySet<string> = new Set(["idle", "active", "blocked", "needs-review"]);

type TentacleManifest = {
  tentacleId: string;
  displayName: string;
  description: string;
  status: DeckTentacleStatus;
  color: string | null;
  scope: { paths: string[]; tags: string[] };
};

const parseTentacleManifest = (raw: unknown, folderId: string): TentacleManifest | null => {
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const displayName = typeof rec.displayName === "string" ? rec.displayName.trim() : folderId;
  const description = typeof rec.description === "string" ? rec.description.trim() : "";
  const status =
    typeof rec.status === "string" && VALID_STATUSES.has(rec.status)
      ? (rec.status as DeckTentacleStatus)
      : "idle";
  const color =
    typeof rec.color === "string" && rec.color.trim().length > 0 ? rec.color.trim() : null;

  const scope = { paths: [] as string[], tags: [] as string[] };
  if (rec.scope !== null && typeof rec.scope === "object") {
    const s = rec.scope as Record<string, unknown>;
    if (Array.isArray(s.paths)) {
      scope.paths = s.paths.filter((p): p is string => typeof p === "string");
    }
    if (Array.isArray(s.tags)) {
      scope.tags = s.tags.filter((t): t is string => typeof t === "string");
    }
  }

  return {
    tentacleId: folderId,
    displayName,
    description,
    status,
    color,
    scope,
  };
};

const parseTodoProgress = (
  content: string,
): { total: number; done: number; items: { text: string; done: boolean }[] } => {
  const lines = content.split("\n");
  let total = 0;
  let done = 0;
  const items: { text: string; done: boolean }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const checkedMatch = trimmed.match(/^- \[x\]\s+(.+)/i);
    const uncheckedMatch = trimmed.match(/^- \[ \]\s+(.+)/);

    if (checkedMatch) {
      total++;
      done++;
      items.push({ text: checkedMatch[1] as string, done: true });
    } else if (uncheckedMatch) {
      total++;
      items.push({ text: uncheckedMatch[1] as string, done: false });
    }
  }

  return { total, done, items };
};

export const readDeckTentacles = (workspaceCwd: string): DeckTentacleSummary[] => {
  const tentaclesRoot = join(workspaceCwd, TENTACLES_DIR);
  if (!existsSync(tentaclesRoot)) return [];

  let entries: string[];
  try {
    entries = readdirSync(tentaclesRoot);
  } catch {
    return [];
  }

  const results: DeckTentacleSummary[] = [];

  for (const entry of entries) {
    const entryPath = join(tentaclesRoot, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const manifestPath = join(entryPath, "tentacle.json");
    if (!existsSync(manifestPath)) continue;

    let manifest: TentacleManifest | null;
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      manifest = parseTentacleManifest(raw, entry);
    } catch {
      continue;
    }
    if (!manifest) continue;

    // List vault files
    const vaultDir = join(entryPath, "vault");
    let vaultFiles: string[] = [];
    if (existsSync(vaultDir)) {
      try {
        vaultFiles = readdirSync(vaultDir)
          .filter((f) => f.endsWith(".md"))
          .sort((a, b) => {
            // main.md first, todo.md second, rest alphabetical
            if (a === "main.md") return -1;
            if (b === "main.md") return 1;
            if (a === "todo.md") return -1;
            if (b === "todo.md") return 1;
            return a.localeCompare(b);
          });
      } catch {
        // skip unreadable vault dirs
      }
    }

    // Parse todo.md for progress
    let todoTotal = 0;
    let todoDone = 0;
    let todoItems: { text: string; done: boolean }[] = [];
    const todoPath = join(vaultDir, "todo.md");
    if (existsSync(todoPath)) {
      try {
        const todoContent = readFileSync(todoPath, "utf-8");
        const progress = parseTodoProgress(todoContent);
        todoTotal = progress.total;
        todoDone = progress.done;
        todoItems = progress.items;
      } catch {
        // skip unreadable todo
      }
    }

    results.push({
      tentacleId: manifest.tentacleId,
      displayName: manifest.displayName,
      description: manifest.description,
      status: manifest.status,
      color: manifest.color,
      scope: manifest.scope,
      vaultFiles,
      todoTotal,
      todoDone,
      todoItems,
    });
  }

  return results;
};

export const readDeckVaultFile = (
  workspaceCwd: string,
  tentacleId: string,
  fileName: string,
): string | null => {
  // Prevent path traversal
  if (tentacleId.includes("..") || tentacleId.includes("/")) return null;
  if (fileName.includes("..") || fileName.includes("/")) return null;

  const filePath = join(workspaceCwd, TENTACLES_DIR, tentacleId, "vault", fileName);

  if (!existsSync(filePath)) return null;

  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
};
