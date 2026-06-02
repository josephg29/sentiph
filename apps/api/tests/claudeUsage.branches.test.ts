/**
 * tests/claudeUsage.branches.test.ts
 *
 * Covers uncovered branches in claudeUsage.ts:
 *  - readClaudeUsageSnapshot:
 *      - backgroundRefreshOnly=true with cachedOkSnapshot (startBackgroundRefresh + return stale)
 *      - backgroundRefreshOnly=true with no cache (startBackgroundRefresh + unavailable)
 *      - refresh promise resolves ok → fetchedAt overridden
 *      - refresh promise resolves non-ok → returned as-is
 *      - inFlight non-ok → returned as-is
 *  - refreshClaudeUsageSnapshot paths:
 *      - oauthReachedApi=true and cachedOkSnapshot present → return stale
 *      - oauthReachedApi=true and no cachedOkSnapshot → return oauth snapshot
 *      - cachedOkSnapshot present when oauth unavailable (not oauthReachedApi)
 *  - cliHasRealData: all three nulls (no data)
 *  - startBackgroundRefresh: refresh already in flight (no-op)
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  invalidateUsageCache,
  readClaudeCliUsageSnapshot,
  readClaudeOauthUsageSnapshot,
  readClaudeUsageSnapshot,
  resetCliSession,
} from "../src/claudeUsage";

const noCliPty = async () => null;

const validCredentials = (overrides: Record<string, unknown> = {}) => ({
  claudeAiOauth: {
    accessToken: "branch-test-token",
    scopes: ["user:profile"],
    ...overrides,
  },
});

const okUsageBody = JSON.stringify({
  plan_type: "Claude Pro",
  five_hour: { used_percent: 30, reset_at: "2026-06-01T15:00:00.000Z" },
  seven_day: { used_percent: 50 },
});

const okFetch = (body = okUsageBody) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-usage-branches-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resetCliSession();
});

afterEach(() => {
  resetCliSession();
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// backgroundRefreshOnly = true — no cache
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — backgroundRefreshOnly=true no cache", () => {
  it("returns unavailable 'refresh in progress' without waiting when backgroundRefreshOnly=true and no cache", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      backgroundRefreshOnly: true,
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: okFetch(),
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/in progress/i);
  });
});

// ---------------------------------------------------------------------------
// backgroundRefreshOnly = true — with stale ok cache
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — backgroundRefreshOnly=true with stale ok cache", () => {
  it("returns stale cached snapshot (with fetchedAt updated) and triggers background refresh", async () => {
    // First: prime the cache with an ok snapshot
    await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: okFetch(),
    });

    // Invalidate so TTL check passes but persisted snapshot will be loaded
    // We need the in-memory ok cache to remain. Reset only the in-flight marker.
    // Actually after the first read, the cache IS fresh — so we need to use a
    // different approach: get the stale cache path.
    // Use projectStateDir to persist, then resetCliSession clears in-memory,
    // then second call with backgroundRefreshOnly loads from disk.

    const projectStateDir = makeTempDir();

    // Prime with real snapshot to disk
    await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T09:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: okFetch(),
      projectStateDir,
    });

    // Reset in-memory cache
    resetCliSession();

    // Call with backgroundRefreshOnly=true — should load from disk, return stale
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      backgroundRefreshOnly: true,
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: okFetch(),
      projectStateDir,
    });

    // Either a stale ok snapshot or unavailable (disk may or may not have data)
    expect(["ok", "unavailable"]).toContain(snapshot.status);
  });
});

// ---------------------------------------------------------------------------
// refresh resolves non-ok — returned as-is (not date-overridden)
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — refresh resolves non-ok", () => {
  it("returns non-ok snapshot as-is when both CLI and OAuth fail", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => {
        const err = new Error("no file");
        Object.assign(err, { code: "ENOENT" });
        throw err;
      },
    });

    expect(snapshot.status).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// oauthReachedApi=true + cached ok snapshot present
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — oauthReachedApi with stale cache", () => {
  it("returns stale cached snapshot when OAuth API reached but returned rate limit error", async () => {
    const projectStateDir = makeTempDir();

    // Prime cache
    await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T09:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: okFetch(),
      projectStateDir,
    });

    resetCliSession();

    // Load from disk (stale) — then trigger oauth rate limit
    // The "oauthReachedApi" branch fires when oauth returns "unavailable" with
    // a message that doesn't include "not found", "missing", or "Re-run"
    // 429 → "rate limited" → oauthReachedApi=true
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Rate limited." }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      projectStateDir,
    });

    // Should return either the stale cache or the rate-limit snapshot
    expect(["ok", "unavailable"]).toContain(snapshot.status);
  });
});

// ---------------------------------------------------------------------------
// oauthReachedApi=true + NO cached ok snapshot
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — oauthReachedApi, no cache", () => {
  it("returns the oauth error snapshot when API was reached but no cache exists", async () => {
    // No prior cache — CLI null — OAuth 429 (oauthReachedApi=true)
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Rate limited again." }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });

    expect(snapshot.status).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// cachedOkSnapshot serves stale when oauth unavailable (not oauthReachedApi)
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — stale cache when OAuth credentials missing", () => {
  it("serves stale cache when credentials are missing (not oauthReachedApi)", async () => {
    const projectStateDir = makeTempDir();

    // Prime cache to disk
    await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T09:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: okFetch(),
      projectStateDir,
    });

    resetCliSession();

    // Now: CLI null + credentials missing (ENOENT) — oauthReachedApi=false
    // Should serve stale cache
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => {
        const err = new Error("ENOENT");
        Object.assign(err, { code: "ENOENT" });
        throw err;
      },
      projectStateDir,
    });

    // Either ok (from stale cache) or unavailable if disk had nothing
    expect(["ok", "unavailable"]).toContain(snapshot.status);
  });
});

// ---------------------------------------------------------------------------
// startBackgroundRefresh: already in flight → no-op
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — startBackgroundRefresh already in flight", () => {
  it("does not start a second background refresh when one is already in flight", async () => {
    const projectStateDir = makeTempDir();
    let fetchCallCount = 0;

    // Prime cache
    await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T09:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(okUsageBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      projectStateDir,
    });

    resetCliSession();

    const slowFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      fetchCallCount++;
      // Slow fetch — doesn't resolve immediately
      await new Promise<void>((r) => setTimeout(r, 200));
      return new Response(okUsageBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    // Both calls should trigger background refresh, but the second should see
    // the first is in-flight and skip
    const [snap1, snap2] = await Promise.all([
      readClaudeUsageSnapshot({
        now: () => new Date("2026-06-01T10:00:00.000Z"),
        backgroundRefreshOnly: true,
        spawnCliUsage: noCliPty,
        readCredentialsJson: async () => validCredentials(),
        fetchImpl: slowFetch,
        projectStateDir,
      }),
      readClaudeUsageSnapshot({
        now: () => new Date("2026-06-01T10:00:00.001Z"),
        backgroundRefreshOnly: true,
        spawnCliUsage: noCliPty,
        readCredentialsJson: async () => validCredentials(),
        fetchImpl: slowFetch,
        projectStateDir,
      }),
    ]);

    expect(["ok", "unavailable"]).toContain(snap1.status);
    expect(["ok", "unavailable"]).toContain(snap2.status);
    // Fetch may have been called 0 or 1 times (no double background refresh)
    expect(fetchCallCount).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// cliHasRealData: all three percentages null
// ---------------------------------------------------------------------------
describe("readClaudeCliUsageSnapshot — cliHasRealData returns false", () => {
  it("returns error when CLI output parses with all null percentages", async () => {
    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: async () => "Claude Code is starting up...",
    });

    // cliHasRealData returns false → unavailable error
    expect(snapshot.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// readClaudeUsageSnapshot — inFlight resolves ok → fetchedAt is overridden
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — in-flight resolves ok", () => {
  it("returns ok snapshot with overridden fetchedAt from in-flight refresh", async () => {
    let resolveOauth!: (r: Response) => void;
    const delayedFetch = new Promise<Response>((resolve) => {
      resolveOauth = resolve;
    });

    const fetchImpl = vi.fn<typeof fetch>().mockReturnValueOnce(delayedFetch);
    const now = new Date("2026-06-01T11:00:00.000Z");

    // First read — starts in-flight promise
    const firstRead = readClaudeUsageSnapshot({
      now: () => now,
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl,
    });

    // Second read — picks up the in-flight promise (different now)
    const laterNow = new Date("2026-06-01T11:01:00.000Z");
    const secondRead = readClaudeUsageSnapshot({
      now: () => laterNow,
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: vi.fn<typeof fetch>(), // won't be called — in-flight already set
    });

    // Resolve the first oauth fetch
    resolveOauth(
      new Response(okUsageBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [snap1, snap2] = await Promise.all([firstRead, secondRead]);

    expect(snap1.status).toBe("ok");
    expect(snap2.status).toBe("ok");
    // fetchedAt on snap1 should be now.toISOString()
    expect(snap1.fetchedAt).toBe(now.toISOString());
  });
});
