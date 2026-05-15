import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DeckAvailableSkill,
  DeckOctopusAppearance,
  DeckTentacleStatus,
  DeckTentacleSummary,
} from "@sentiph/core";

import { readAvailableClaudeSkills } from "../claudeSkills";

const VALID_STATUSES: ReadonlySet<string> = new Set(["idle", "active", "blocked", "needs-review"]);

// ─── Deck state (app metadata only) ─────────────────────────────────────────

type DeckTentacleState = {
  displayName: string;
  description: string;
  color: string | null;
  status: DeckTentacleStatus;
  octopus: DeckOctopusAppearance;
  scope: { paths: string[]; tags: string[] };
  suggestedSkills: string[];
};

type DeckStateDocument = {
  tentacles: Record<string, DeckTentacleState>;
};

const readDeckState = (projectStateDir: string): DeckStateDocument => {
  const filePath = join(projectStateDir, "state", "deck.json");
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    if (
      raw &&
      typeof raw === "object" &&
      typeof raw.tentacles === "object" &&
      raw.tentacles !== null
    ) {
      return raw as DeckStateDocument;
    }
  } catch {
    // missing or corrupt — return empty
  }
  return { tentacles: {} };
};

const writeDeckState = (projectStateDir: string, state: DeckStateDocument): void => {
  const filePath = join(projectStateDir, "state", "deck.json");
  const dir = join(projectStateDir, "state");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
};

const parseTentacleState = (raw: unknown, tentacleId: string): DeckTentacleState => {
  const defaults: DeckTentacleState = {
    displayName: tentacleId,
    description: "",
    color: null,
    status: "idle",
    octopus: { animation: null, expression: null, accessory: null, hairColor: null },
    scope: { paths: [], tags: [] },
    suggestedSkills: [],
  };

  if (raw === null || typeof raw !== "object") return defaults;
  const rec = raw as Record<string, unknown>;

  const displayName =
    typeof rec.displayName === "string" && rec.displayName.trim().length > 0
      ? rec.displayName.trim()
      : tentacleId;
  const description = typeof rec.description === "string" ? rec.description : "";
  const color =
    typeof rec.color === "string" && rec.color.trim().length > 0 ? rec.color.trim() : null;
  const status =
    typeof rec.status === "string" && VALID_STATUSES.has(rec.status)
      ? (rec.status as DeckTentacleStatus)
      : "idle";

  const octopus: DeckOctopusAppearance = {
    animation: null,
    expression: null,
    accessory: null,
    hairColor: null,
  };
  if (rec.octopus !== null && typeof rec.octopus === "object") {
    const o = rec.octopus as Record<string, unknown>;
    if (typeof o.animation === "string") octopus.animation = o.animation;
    if (typeof o.expression === "string") octopus.expression = o.expression;
    if (typeof o.accessory === "string") octopus.accessory = o.accessory;
    if (typeof o.hairColor === "string") octopus.hairColor = o.hairColor;
  }

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

  const suggestedSkills = Array.isArray(rec.suggestedSkills)
    ? rec.suggestedSkills.filter((s): s is string => typeof s === "string")
    : [];

  return { displayName, description, color, status, octopus, scope, suggestedSkills };
};

// ─── CONTEXT.md managed block helpers ───────────────────────────────────────

const SKILLS_START = "<!-- octogent:suggested-skills:start -->";
const SKILLS_END = "<!-- octogent:suggested-skills:end -->";

const buildSkillsBlock = (skills: string[]): string => {
  const lines = [
    SKILLS_START,
    "## Suggested Skills",
    "",
    "You can use these skills if you need to.",
    "",
    ...skills.map((s) => `- \`${s}\``),
    SKILLS_END,
    "",
  ];
  return lines.join("\n");
};

const updateContextMdSkills = (contextPath: string, skills: string[]): void => {
  const existing = existsSync(contextPath) ? readFileSync(contextPath, "utf8") : "";
  const startIdx = existing.indexOf(SKILLS_START);
  const endIdx = existing.indexOf(SKILLS_END);

  let base = existing;
  if (startIdx !== -1 && endIdx !== -1) {
    base = (existing.slice(0, startIdx) + existing.slice(endIdx + SKILLS_END.length)).trimEnd();
    if (base.length > 0) base += "\n";
  }

  const next = skills.length === 0 ? base : base + buildSkillsBlock(skills);
  writeFileSync(contextPath, next, "utf8");
};

export const readContextTitle = (contextPath: string): string | null => {
  if (!existsSync(contextPath)) return null;
  try {
    const content = readFileSync(contextPath, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^#\s+(.+)$/);
      if (match?.[1]) return match[1].trim();
    }
  } catch {
    // ignore
  }
  return null;
};

// ─── Todo parsing ────────────────────────────────────────────────────────────

export const parseTodoProgress = (
  content: string,
): { total: number; done: number; items: { text: string; done: boolean }[] } => {
  const items: { text: string; done: boolean }[] = [];
  for (const line of content.split("\n")) {
    const unchecked = line.match(/^-\s+\[\s*\]\s+(.+)$/);
    if (unchecked?.[1]) {
      items.push({ text: unchecked[1].trim(), done: false });
      continue;
    }
    const checked = line.match(/^-\s+\[[xX]\]\s+(.+)$/);
    if (checked?.[1]) {
      items.push({ text: checked[1].trim(), done: true });
    }
  }
  const done = items.filter((i) => i.done).length;
  return { total: items.length, done, items };
};

// ─── Read all tentacles ─────────────────────────────────────────────────────

export const readDeckTentacles = (
  _workspaceCwd: string,
  projectStateDir?: string,
  resolvedStateDir?: string,
): DeckTentacleSummary[] => {
  const stateDir = resolvedStateDir ?? projectStateDir ?? "";
  if (!stateDir) return [];

  const deckState = readDeckState(stateDir);

  return Object.entries(deckState.tentacles).map(([tentacleId, raw]) => {
    const state = parseTentacleState(raw, tentacleId);
    return {
      tentacleId,
      displayName: state.displayName,
      description: state.description,
      status: state.status,
      color: state.color,
      octopus: state.octopus,
      scope: state.scope,
      vaultFiles: [],
      todoTotal: 0,
      todoDone: 0,
      todoItems: [],
      suggestedSkills: state.suggestedSkills,
    };
  });
};

// ─── Read a vault file (no-op — no filesystem backing) ──────────────────────

export const readDeckVaultFile = (
  _workspaceCwd: string,
  _tentacleId: string,
  _fileName: string,
): string | null => null;

// ─── Todo operations (no-op — no filesystem backing) ─────────────────────────

export const toggleTodoItem = (
  _workspaceCwd: string,
  _tentacleId: string,
  _itemIndex: number,
  _done: boolean,
): { total: number; done: number; items: { text: string; done: boolean }[] } | null => null;

export const editTodoItem = (
  _workspaceCwd: string,
  _tentacleId: string,
  _itemIndex: number,
  _text: string,
): { total: number; done: number; items: { text: string; done: boolean }[] } | null => null;

export const addTodoItem = (
  _workspaceCwd: string,
  _tentacleId: string,
  _text: string,
): { total: number; done: number; items: { text: string; done: boolean }[] } | null => null;

export const deleteTodoItem = (
  _workspaceCwd: string,
  _tentacleId: string,
  _itemIndex: number,
): { total: number; done: number; items: { text: string; done: boolean }[] } | null => null;

// ─── Create a new tentacle ──────────────────────────────────────────────────

type CreateDeckTentacleInput = {
  name: string;
  description: string;
  color: string;
  octopus: DeckOctopusAppearance;
  suggestedSkills?: string[];
};

type CreateDeckTentacleResult =
  | { ok: true; tentacle: DeckTentacleSummary }
  | { ok: false; error: string };

export const createDeckTentacle = (
  _workspaceCwd: string,
  input: CreateDeckTentacleInput,
  projectStateDir?: string,
): CreateDeckTentacleResult => {
  if (!projectStateDir) {
    return { ok: false, error: "Project state directory is required" };
  }

  const name = input.name.trim();
  const tentacleId = name.length > 0 ? name : `tentacle-${Date.now()}`;
  const description = input.description.trim();
  const suggestedSkills = [...new Set((input.suggestedSkills ?? []).map((s) => s.trim()))]
    .filter((s) => s.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const deckState = readDeckState(projectStateDir);
  if (deckState.tentacles[tentacleId]) {
    return { ok: false, error: "A tentacle with this name already exists" };
  }

  deckState.tentacles[tentacleId] = {
    displayName: tentacleId,
    description,
    color: input.color,
    status: "idle",
    octopus: input.octopus,
    scope: { paths: [], tags: [] },
    suggestedSkills,
  };
  writeDeckState(projectStateDir, deckState);

  const tentacleDir = join(projectStateDir, "tentacles", tentacleId);
  if (!existsSync(tentacleDir)) mkdirSync(tentacleDir, { recursive: true });
  if (suggestedSkills.length > 0) {
    updateContextMdSkills(join(tentacleDir, "CONTEXT.md"), suggestedSkills);
  }

  return {
    ok: true,
    tentacle: {
      tentacleId,
      displayName: tentacleId,
      description,
      status: "idle",
      color: input.color,
      octopus: input.octopus,
      scope: { paths: [], tags: [] },
      vaultFiles: [],
      todoTotal: 0,
      todoDone: 0,
      todoItems: [],
      suggestedSkills,
    },
  };
};

export const listDeckAvailableSkills = (workspaceCwd: string): DeckAvailableSkill[] =>
  readAvailableClaudeSkills(workspaceCwd);

export const updateDeckTentacleSuggestedSkills = (
  _workspaceCwd: string,
  tentacleId: string,
  suggestedSkills: string[],
  projectStateDir?: string,
): DeckTentacleSummary | null => {
  if (!projectStateDir) return null;

  const deckState = readDeckState(projectStateDir);
  const existing = deckState.tentacles[tentacleId];
  if (!existing) return null;

  existing.suggestedSkills = suggestedSkills;
  writeDeckState(projectStateDir, deckState);

  const tentacleDir = join(projectStateDir, "tentacles", tentacleId);
  if (!existsSync(tentacleDir)) mkdirSync(tentacleDir, { recursive: true });
  updateContextMdSkills(join(tentacleDir, "CONTEXT.md"), suggestedSkills);

  return readDeckTentacles("", projectStateDir).find((t) => t.tentacleId === tentacleId) ?? null;
};

// ─── Delete a tentacle ──────────────────────────────────────────────────────

export const deleteDeckTentacle = (
  _workspaceCwd: string,
  tentacleId: string,
  projectStateDir?: string,
): { ok: true } | { ok: false; error: string } => {
  if (!projectStateDir) {
    return { ok: false, error: "Project state directory is required" };
  }

  const deckState = readDeckState(projectStateDir);
  if (!deckState.tentacles[tentacleId]) {
    return { ok: false, error: "Tentacle not found" };
  }

  delete deckState.tentacles[tentacleId];
  writeDeckState(projectStateDir, deckState);
  return { ok: true };
};
