/**
 * tests/claudeUsage.extra2.branches.test.ts
 *
 * Covers remaining uncovered branches in claudeUsage.ts not hit by
 * claudeUsage.branches.test.ts or claudeUsage.test.ts:
 *
 *  - readClaudeUsageSnapshot: cached snapshot is fresh (CACHE_TTL_MS not elapsed)
 *    → returns cached snapshot with fetchedAt overridden (the `cached &&
 *    Date.now() - cached.fetchedAt < CACHE_TTL_MS` branch)
 *  - refreshClaudeUsageSnapshot: oauthReachedApi=true + no cachedOkSnapshot
 *    (message doesn't include "not found" / "missing" / "Re-run")
 *    → returns oauthSnapshot directly
 *  - readClaudeOauthUsageSnapshot: snapshot.status !== "ok" → returns snapshot as-is
 *  - readClaudeCliUsageSnapshot: spawnCliUsage returns null → logs and returns unavailable
 *
 * Skipped-unreachable:
 *  - `startBackgroundRefresh` catch path: refreshClaudeUsageSnapshot itself
 *    does not throw (only rejects, and the .catch is defensive); would require
 *    mocking the internal closure which is not exported.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readClaudeCliUsageSnapshot,
  readClaudeOauthUsageSnapshot,
  readClaudeUsageSnapshot,
  resetCliSession,
} from "../src/claudeUsage";
import {
  CACHE_TTL_MS,
  getCachedSnapshot,
  setCachedSnapshot,
  setRefreshInFlight,
} from "../src/claudeUsageCache";
import type { ClaudeUsageSnapshot } from "../src/claudeUsageShared";

const noCliPty = async () => null;

const validCredentials = (overrides: Record<string, unknown> = {}) => ({
  claudeAiOauth: {
    accessToken: "extra2-token",
    scopes: ["user:profile"],
    ...overrides,
  },
});

const okUsageBody = JSON.stringify({
  plan_type: "pro",
  five_hour: { used_percent: 20, reset_at: "2026-06-01T15:00:00.000Z" },
  seven_day: { used_percent: 40, reset_at: null },
  seven_day_sonnet: { used_percent: 10, reset_at: null },
});

beforeEach(() => {
  resetCliSession();
});

afterEach(() => {
  resetCliSession();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fresh cache hit — CACHE_TTL_MS not elapsed
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — fresh cache hit", () => {
  it("returns cached snapshot immediately without refreshing when cache is fresh", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(okUsageBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const deps = {
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: fetchMock,
    };

    // First call — populates cache
    const first = await readClaudeUsageSnapshot(deps);
    expect(first.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call — cache is fresh (fetchedAt is just now)
    const second = await readClaudeUsageSnapshot(deps);
    expect(second.status).toBe("ok");
    // Fetch should NOT have been called again
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fresh cache hit returns fetchedAt from the 'now' dep (not cached fetchedAt)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(okUsageBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // First call
    await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: fetchMock,
    });

    // Second call with a later "now" — fresh cache → fetchedAt should be the new now
    const laterNow = new Date("2026-06-01T10:01:00.000Z");
    const second = await readClaudeUsageSnapshot({
      now: () => laterNow,
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: fetchMock,
    });

    expect(second.fetchedAt).toBe(laterNow.toISOString());
  });
});

// ---------------------------------------------------------------------------
// readClaudeUsageSnapshot — getCachedSnapshot() non-null but stale TTL
// (the `if (!getCachedSnapshot())` false branch — skip readPersistedOkSnapshot)
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — stale cache skips disk read", () => {
  it("skips readPersistedOkSnapshot when in-memory cache exists but TTL is expired", async () => {
    // Set up a stale cache (fetchedAt = 0, well past TTL)
    const staleSnapshot: ClaudeUsageSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: new Date(Date.now() - CACHE_TTL_MS * 2).toISOString(),
      message: null,
      planType: "pro",
      primaryUsedPercent: 50,
      primaryResetAt: null,
      secondaryUsedPercent: 25,
      secondaryResetAt: null,
      sonnetUsedPercent: 10,
      sonnetResetAt: null,
      extraUsageCostUsed: null,
      extraUsageCostLimit: null,
    };

    // Set a stale in-memory cache (fetchedAt in the past but not 0)
    // fetchedAt < Date.now() - CACHE_TTL_MS → cache is stale
    setCachedSnapshot({ snapshot: staleSnapshot, fetchedAt: Date.now() - CACHE_TTL_MS - 1 });

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(okUsageBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // getCachedSnapshot() is non-null → skip `if (!getCachedSnapshot())` branch
    // cachedOkSnapshot is the stale ok snapshot → startBackgroundRefresh triggered
    // snapshot is returned from stale cache
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: fetchMock,
    });

    // The stale ok snapshot is returned immediately (startBackgroundRefresh triggers)
    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// oauthReachedApi=true + cachedOkSnapshot present → stale cache returned
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — oauthReachedApi + stale cache", () => {
  it("returns stale cache when oauthReachedApi=true and cachedOkSnapshot exists", async () => {
    // Prime cache first (in-memory)
    const primeSnapshot: ClaudeUsageSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-06-01T09:00:00.000Z",
      message: null,
      planType: "pro",
      primaryUsedPercent: 30,
      primaryResetAt: null,
      secondaryUsedPercent: 15,
      secondaryResetAt: null,
      sonnetUsedPercent: 5,
      sonnetResetAt: null,
      extraUsageCostUsed: null,
      extraUsageCostLimit: null,
    };

    // Set as stale (past TTL) so fresh check fails, but ok snapshot exists
    setCachedSnapshot({ snapshot: primeSnapshot, fetchedAt: Date.now() - CACHE_TTL_MS - 1 });

    // Now make fetch return a rate-limit error (oauthReachedApi=true)
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
    });

    // startBackgroundRefresh was called, which runs refreshClaudeUsageSnapshot
    // inside that: oauthReachedApi=true + cachedOkSnapshot present → returns stale cache
    // The outer readClaudeUsageSnapshot returns the stale ok snapshot
    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// readClaudeOauthUsageSnapshot — non-ok snapshot returned as-is
// ---------------------------------------------------------------------------
describe("readClaudeOauthUsageSnapshot — non-ok result", () => {
  it("returns unavailable snapshot directly when credentials are missing", async () => {
    const snapshot = await readClaudeOauthUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      readCredentialsJson: async () => {
        const err = new Error("ENOENT");
        Object.assign(err, { code: "ENOENT" });
        throw err;
      },
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/credentials not found/i);
  });

  it("returns ok snapshot (via cacheOkSnapshot) when credentials are valid", async () => {
    const snapshot = await readClaudeOauthUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: async () =>
        new Response(okUsageBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("oauth-api");
  });
});

// ---------------------------------------------------------------------------
// readClaudeCliUsageSnapshot — spawnCliUsage returns null
// ---------------------------------------------------------------------------
describe("readClaudeCliUsageSnapshot — spawnCliUsage returns null", () => {
  it("returns error snapshot when spawn returns null (binary not found)", async () => {
    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty, // always returns null
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unavailable/i);
  });
});

// ---------------------------------------------------------------------------
// readClaudeCliUsageSnapshot — spawnCliUsage returns output with real data
// ---------------------------------------------------------------------------
describe("readClaudeCliUsageSnapshot — spawnCliUsage returns parseable output", () => {
  it("returns ok snapshot when CLI output has parseable percentages", async () => {
    const cliOutput = [
      "Current session",
      "  5% used",
      "Current week (all models)",
      "  30% used",
      "Current week (Sonnet only)",
      "  15% used",
    ].join("\n");

    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: async () => cliOutput,
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("cli-pty");
    expect(snapshot.primaryUsedPercent).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// refreshClaudeUsageSnapshot — oauthReachedApi=true, no cachedOkSnapshot
// Covered via readClaudeUsageSnapshot when no prior cache
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot — oauthReachedApi no cache returns oauth snapshot", () => {
  it("returns the rate-limit oauth snapshot when no cache exists", async () => {
    // Clean state
    setCachedSnapshot(null);
    setRefreshInFlight(null);

    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              type: "rate_limit_error",
              message: "Rate limited. Please try again.",
            },
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        ),
    });

    // oauthReachedApi=true, no cachedOkSnapshot → return oauthSnapshot directly
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/rate limit/i);
  });
});
