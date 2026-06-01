import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { asNumber, asRecord } from "@sentiph/core";
import { type ClaudeUsageSnapshot, asTrimmedString } from "./claudeUsageShared";

export const CACHE_TTL_MS = 300_000;
const CLAUDE_USAGE_SNAPSHOT_FILENAME = "claude-usage-snapshot.json";

let cachedSnapshot: { snapshot: ClaudeUsageSnapshot; fetchedAt: number } | null = null;
let refreshInFlight: Promise<ClaudeUsageSnapshot> | null = null;

export const getCachedSnapshot = (): { snapshot: ClaudeUsageSnapshot; fetchedAt: number } | null =>
  cachedSnapshot;

export const setCachedSnapshot = (
  value: { snapshot: ClaudeUsageSnapshot; fetchedAt: number } | null,
): void => {
  cachedSnapshot = value;
};

export const getRefreshInFlight = (): Promise<ClaudeUsageSnapshot> | null => refreshInFlight;

export const setRefreshInFlight = (value: Promise<ClaudeUsageSnapshot> | null): void => {
  refreshInFlight = value;
};

export const getCachedOkSnapshot = (): ClaudeUsageSnapshot | null =>
  cachedSnapshot?.snapshot.status === "ok" ? cachedSnapshot.snapshot : null;

const resolveSnapshotPath = (projectStateDir: string | undefined): string | null =>
  projectStateDir ? join(projectStateDir, "state", CLAUDE_USAGE_SNAPSHOT_FILENAME) : null;

const normalizePersistedSnapshot = (value: unknown): ClaudeUsageSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = asTrimmedString(record.status);
  const source = asTrimmedString(record.source);
  const fetchedAt = asTrimmedString(record.fetchedAt);
  if (status !== "ok" || (source !== "cli-pty" && source !== "oauth-api") || fetchedAt === null) {
    return null;
  }

  return {
    status,
    source,
    fetchedAt,
    message: asTrimmedString(record.message),
    planType: asTrimmedString(record.planType),
    primaryUsedPercent: asNumber(record.primaryUsedPercent),
    primaryResetAt: asTrimmedString(record.primaryResetAt),
    secondaryUsedPercent: asNumber(record.secondaryUsedPercent),
    secondaryResetAt: asTrimmedString(record.secondaryResetAt),
    sonnetUsedPercent: asNumber(record.sonnetUsedPercent),
    sonnetResetAt: asTrimmedString(record.sonnetResetAt),
    extraUsageCostUsed: asNumber(record.extraUsageCostUsed),
    extraUsageCostLimit: asNumber(record.extraUsageCostLimit),
  };
};

export const readPersistedOkSnapshot = async (
  projectStateDir: string | undefined,
): Promise<ClaudeUsageSnapshot | null> => {
  const snapshotPath = resolveSnapshotPath(projectStateDir);
  if (!snapshotPath) {
    return null;
  }

  try {
    const raw = await readFile(snapshotPath, "utf8");
    return normalizePersistedSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

const persistOkSnapshot = async (
  snapshot: ClaudeUsageSnapshot,
  projectStateDir: string | undefined,
): Promise<void> => {
  if (snapshot.status !== "ok") {
    return;
  }

  const snapshotPath = resolveSnapshotPath(projectStateDir);
  if (!snapshotPath) {
    return;
  }

  try {
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");
  } catch (error) {
    console.warn(
      `[claude-usage] unable to persist snapshot: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const cacheOkSnapshot = async (
  snapshot: ClaudeUsageSnapshot,
  projectStateDir: string | undefined,
): Promise<ClaudeUsageSnapshot> => {
  cachedSnapshot = { snapshot, fetchedAt: Date.now() };
  await persistOkSnapshot(snapshot, projectStateDir);
  return snapshot;
};
