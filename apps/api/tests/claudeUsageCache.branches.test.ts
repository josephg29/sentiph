/**
 * tests/claudeUsageCache.branches.test.ts
 *
 * Covers uncovered branches in claudeUsageCache.ts:
 *  - resolveSnapshotPath: projectStateDir is undefined → returns null
 *  - normalizePersistedSnapshot: status !== "ok" → null
 *  - normalizePersistedSnapshot: source not in ["cli-pty","oauth-api"] → null
 *  - normalizePersistedSnapshot: fetchedAt null → null
 *  - persistOkSnapshot: snapshot.status !== "ok" → early return (no write)
 *  - persistOkSnapshot: snapshotPath is null (no projectStateDir) → no write
 *
 * Skipped-unreachable:
 *  - The `console.warn` path in persistOkSnapshot when writeFile throws is a
 *    real-I/O failure that would require an unwritable directory — difficult
 *    to reliably trigger; skip as environment-dependent.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cacheOkSnapshot,
  getCachedSnapshot,
  readPersistedOkSnapshot,
  setCachedSnapshot,
  setRefreshInFlight,
} from "../src/claudeUsageCache";
import type { ClaudeUsageSnapshot } from "../src/claudeUsageShared";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-cache-branches-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  setCachedSnapshot(null);
  setRefreshInFlight(null);
});

afterEach(() => {
  setCachedSnapshot(null);
  setRefreshInFlight(null);
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

const okSnapshot: ClaudeUsageSnapshot = {
  status: "ok",
  source: "oauth-api",
  fetchedAt: "2026-06-01T10:00:00.000Z",
  message: null,
  planType: null,
  primaryUsedPercent: 10,
  primaryResetAt: null,
  secondaryUsedPercent: 20,
  secondaryResetAt: null,
  sonnetUsedPercent: 5,
  sonnetResetAt: null,
  extraUsageCostUsed: null,
  extraUsageCostLimit: null,
};

// ---------------------------------------------------------------------------
// resolveSnapshotPath: undefined projectStateDir → readPersistedOkSnapshot returns null
// ---------------------------------------------------------------------------
describe("readPersistedOkSnapshot — no projectStateDir", () => {
  it("returns null when projectStateDir is undefined", async () => {
    const result = await readPersistedOkSnapshot(undefined);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readPersistedOkSnapshot: file doesn't exist → returns null
// ---------------------------------------------------------------------------
describe("readPersistedOkSnapshot — file missing", () => {
  it("returns null when snapshot file does not exist", async () => {
    const dir = makeTempDir();
    const result = await readPersistedOkSnapshot(dir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizePersistedSnapshot: various invalid shapes → null
// ---------------------------------------------------------------------------
describe("readPersistedOkSnapshot — invalid snapshot shapes", () => {
  it("returns null when persisted status is not 'ok'", async () => {
    const dir = makeTempDir();
    const stateDir = join(dir, "state");

    // Write invalid snapshot with wrong status
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, "claude-usage-snapshot.json"),
      JSON.stringify({
        status: "unavailable",
        source: "oauth-api",
        fetchedAt: "2026-06-01T10:00:00.000Z",
      }),
      "utf8",
    );

    const result = await readPersistedOkSnapshot(dir);
    expect(result).toBeNull();
  });

  it("returns null when source is not cli-pty or oauth-api", async () => {
    const dir = makeTempDir();
    const stateDir = join(dir, "state");

    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, "claude-usage-snapshot.json"),
      JSON.stringify({
        status: "ok",
        source: "unknown-source",
        fetchedAt: "2026-06-01T10:00:00.000Z",
      }),
      "utf8",
    );

    const result = await readPersistedOkSnapshot(dir);
    expect(result).toBeNull();
  });

  it("returns null when fetchedAt is missing", async () => {
    const dir = makeTempDir();
    const stateDir = join(dir, "state");

    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, "claude-usage-snapshot.json"),
      JSON.stringify({
        status: "ok",
        source: "cli-pty",
        fetchedAt: null,
      }),
      "utf8",
    );

    const result = await readPersistedOkSnapshot(dir);
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON in snapshot file", async () => {
    const dir = makeTempDir();
    const stateDir = join(dir, "state");

    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "claude-usage-snapshot.json"), "not valid json", "utf8");

    const result = await readPersistedOkSnapshot(dir);
    expect(result).toBeNull();
  });

  it("returns null for non-record value in snapshot file", async () => {
    const dir = makeTempDir();
    const stateDir = join(dir, "state");

    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, "claude-usage-snapshot.json"),
      JSON.stringify([1, 2, 3]),
      "utf8",
    );

    const result = await readPersistedOkSnapshot(dir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cacheOkSnapshot — does not write when projectStateDir is undefined
// ---------------------------------------------------------------------------
describe("cacheOkSnapshot — no projectStateDir", () => {
  it("caches in-memory but does not create any files when projectStateDir is undefined", async () => {
    const result = await cacheOkSnapshot(okSnapshot, undefined);
    expect(result).toBe(okSnapshot);
    const cached = getCachedSnapshot();
    expect(cached?.snapshot).toEqual(okSnapshot);
  });
});

// ---------------------------------------------------------------------------
// cacheOkSnapshot — writes to disk when projectStateDir provided
// ---------------------------------------------------------------------------
describe("cacheOkSnapshot — with projectStateDir", () => {
  it("persists ok snapshot to disk and returns snapshot", async () => {
    const dir = makeTempDir();
    const result = await cacheOkSnapshot(okSnapshot, dir);
    expect(result).toBe(okSnapshot);

    const snapshotPath = join(dir, "state", "claude-usage-snapshot.json");
    expect(existsSync(snapshotPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCachedOkSnapshot — returns null when no cache or non-ok
// ---------------------------------------------------------------------------
describe("getCachedOkSnapshot — edge cases", () => {
  it("returns null when cached snapshot status is not ok", async () => {
    const { getCachedOkSnapshot } = await import("../src/claudeUsageCache");

    const unavailableSnap: ClaudeUsageSnapshot = {
      ...okSnapshot,
      status: "unavailable",
    };
    setCachedSnapshot({ snapshot: unavailableSnap, fetchedAt: Date.now() });
    expect(getCachedOkSnapshot()).toBeNull();
  });

  it("returns snapshot when cached status is ok", async () => {
    const { getCachedOkSnapshot } = await import("../src/claudeUsageCache");

    setCachedSnapshot({ snapshot: okSnapshot, fetchedAt: Date.now() });
    expect(getCachedOkSnapshot()).toEqual(okSnapshot);
  });
});
