import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export type UsageHeatmapDay = {
  date: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  sessions: number;
};

export type UsageHeatmapResponse = {
  days: UsageHeatmapDay[];
  scope: "all" | "project";
  projectSlug: string | null;
};

type AssistantEvent = {
  type: string;
  timestamp: string;
  sessionId: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
};

const isAssistantEvent = (value: unknown): value is AssistantEvent => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.type === "assistant" && typeof record.timestamp === "string";
};

const toDateKey = (timestamp: string): string | null => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
};

const scanJsonlFile = async (
  filePath: string,
  buckets: Map<string, { tokens: UsageHeatmapDay; sessions: Set<string> }>,
): Promise<void> => {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!isAssistantEvent(parsed)) continue;

    const dateKey = toDateKey(parsed.timestamp);
    if (!dateKey) continue;

    const usage = parsed.message?.usage;
    if (!usage) continue;

    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    if (totalTokens === 0) continue;

    let bucket = buckets.get(dateKey);
    if (!bucket) {
      bucket = {
        tokens: {
          date: dateKey,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          sessions: 0,
        },
        sessions: new Set(),
      };
      buckets.set(dateKey, bucket);
    }

    bucket.tokens.totalTokens += totalTokens;
    bucket.tokens.inputTokens += inputTokens;
    bucket.tokens.outputTokens += outputTokens;
    bucket.tokens.cacheReadTokens += cacheReadTokens;
    bucket.tokens.cacheCreationTokens += cacheCreationTokens;

    if (parsed.sessionId) {
      bucket.sessions.add(parsed.sessionId);
    }
  }
};

const scanProjectDirectory = async (
  projectDir: string,
  buckets: Map<string, { tokens: UsageHeatmapDay; sessions: Set<string> }>,
): Promise<void> => {
  let entries: string[];
  try {
    entries = await readdir(projectDir);
  } catch {
    return;
  }

  const jsonlFiles = entries.filter((entry) => entry.endsWith(".jsonl"));
  await Promise.all(jsonlFiles.map((file) => scanJsonlFile(join(projectDir, file), buckets)));
};

const projectSlugFromCwd = (cwd: string): string => cwd.replace(/\//g, "-");

let cachedResult: { response: UsageHeatmapResponse; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 120_000;

export const scanClaudeUsageHeatmap = async (
  scope: "all" | "project",
  workspaceCwd: string,
): Promise<UsageHeatmapResponse> => {
  const projectSlug = scope === "project" ? projectSlugFromCwd(workspaceCwd) : null;

  const cacheKey = `${scope}:${projectSlug ?? "all"}`;
  if (
    cachedResult &&
    Date.now() - cachedResult.fetchedAt < CACHE_TTL_MS &&
    `${cachedResult.response.scope}:${cachedResult.response.projectSlug ?? "all"}` === cacheKey
  ) {
    return cachedResult.response;
  }

  const buckets = new Map<string, { tokens: UsageHeatmapDay; sessions: Set<string> }>();

  if (scope === "project" && projectSlug) {
    await scanProjectDirectory(join(CLAUDE_PROJECTS_DIR, projectSlug), buckets);
  } else {
    let projectDirs: string[];
    try {
      projectDirs = await readdir(CLAUDE_PROJECTS_DIR);
    } catch {
      projectDirs = [];
    }
    await Promise.all(
      projectDirs.map((dir) => scanProjectDirectory(join(CLAUDE_PROJECTS_DIR, dir), buckets)),
    );
  }

  const days = Array.from(buckets.values())
    .map(({ tokens, sessions }) => ({
      ...tokens,
      sessions: sessions.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const response: UsageHeatmapResponse = { days, scope, projectSlug };
  cachedResult = { response, fetchedAt: Date.now() };
  return response;
};
