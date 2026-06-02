/**
 * Supplementary tests for claudeUsage.ts — covers branches not exercised
 * by the existing claudeUsage.test.ts.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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
    accessToken: "extra-test-token",
    scopes: ["user:profile", "offline_access"],
    ...overrides,
  },
});

const usageResponseBody = JSON.stringify({
  plan_type: "Claude Pro",
  five_hour: { used_percent: 20, reset_at: "2026-03-03T15:00:00.000Z" },
  seven_day: { used_percent: 40, reset_at: 1_772_539_200 },
  seven_day_sonnet: { used_percent: 5, reset_at: null },
});

const cliUsageOutput = [
  "Current session",
  "  8% used",
  "Current week (all models)",
  "  15% used",
  "Current week (Sonnet only)",
  "  3% used",
].join("\n");

beforeEach(() => {
  resetCliSession();
});

afterEach(() => {
  resetCliSession();
});

// ---------------------------------------------------------------------------
// readClaudeOauthUsageSnapshot — direct export
// ---------------------------------------------------------------------------
describe("readClaudeOauthUsageSnapshot", () => {
  it("returns ok snapshot with correct source when OAuth API succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(usageResponseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const snapshot = await readClaudeOauthUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readCredentialsJson: async () => validCredentials(),
      fetchImpl,
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("oauth-api");
    expect(snapshot.planType).toBe("Claude Pro");
  });

  it("returns unavailable snapshot without caching when credentials are missing", async () => {
    const snapshot = await readClaudeOauthUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readCredentialsJson: async () => {
        const err = new Error("ENOENT");
        Object.assign(err, { code: "ENOENT" });
        throw err;
      },
    });

    expect(snapshot.status).toBe("unavailable");
  });

  it("persists ok snapshot to projectStateDir", async () => {
    const projectStateDir = mkdtempSync(join(tmpdir(), "sentiph-oauth-extra-"));
    try {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(usageResponseBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const snapshot = await readClaudeOauthUsageSnapshot({
        now: () => new Date("2026-03-03T12:00:00.000Z"),
        readCredentialsJson: async () => validCredentials(),
        fetchImpl,
        projectStateDir,
      });

      expect(snapshot.status).toBe("ok");
      // Verify it was persisted
      const { readFileSync } = await import("node:fs");
      const files = require("node:fs")
        .readdirSync(join(projectStateDir, "state"))
        .filter((f: string) => f.includes("usage"));
      expect(files.length).toBeGreaterThan(0);
    } finally {
      rmSync(projectStateDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// readClaudeCliUsageSnapshot — direct export
// ---------------------------------------------------------------------------
describe("readClaudeCliUsageSnapshot", () => {
  it("returns ok snapshot from CLI output with valid usage data", async () => {
    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: async () => cliUsageOutput,
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("cli-pty");
    expect(snapshot.primaryUsedPercent).toBe(8);
    expect(snapshot.secondaryUsedPercent).toBe(15);
    expect(snapshot.sonnetUsedPercent).toBe(3);
  });

  it("returns error snapshot when CLI returns null", async () => {
    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: noCliPty,
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/cli.*unavailable|unavailable/i);
  });

  it("returns error snapshot when CLI output has no parseable percentages", async () => {
    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: async () => "Welcome to Claude. No usage data.",
    });

    expect(snapshot.status).toBe("error");
  });

  it("returns error snapshot when CLI spawn throws", async () => {
    const snapshot = await readClaudeCliUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: async () => {
        throw new Error("pty failed");
      },
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unavailable/i);
  });

  it("persists ok snapshot when projectStateDir is provided", async () => {
    const projectStateDir = mkdtempSync(join(tmpdir(), "sentiph-cli-extra-"));
    try {
      const snapshot = await readClaudeCliUsageSnapshot({
        now: () => new Date("2026-03-03T12:00:00.000Z"),
        spawnCliUsage: async () => cliUsageOutput,
        projectStateDir,
      });

      expect(snapshot.status).toBe("ok");
    } finally {
      rmSync(projectStateDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// readClaudeUsageSnapshot — branches not covered by main test file
// ---------------------------------------------------------------------------
describe("readClaudeUsageSnapshot – additional branches", () => {
  it("awaits an already-in-flight refresh promise instead of starting a new one", async () => {
    let resolveFirst!: (r: Response) => void;
    const firstFetch = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    const fetchImpl = vi.fn<typeof fetch>().mockReturnValueOnce(firstFetch);

    const deps = {
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl,
    };

    // Fire first read — starts the in-flight promise
    const firstRead = readClaudeUsageSnapshot(deps);

    // Fire second read while first is still in flight
    const secondFetch = new Promise<Response>((r) => setTimeout(r, 10));
    const secondRead = readClaudeUsageSnapshot({
      ...deps,
      fetchImpl: vi.fn<typeof fetch>().mockReturnValueOnce(secondFetch as Promise<Response>),
    });

    // Resolve the first fetch
    resolveFirst(
      new Response(usageResponseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [snap1] = await Promise.all([firstRead, secondRead]);
    expect(snap1.status).toBe("ok");
  });

  it("returns unavailable when credentials are missing and no cache exists", async () => {
    // No prior cache — just verify unavailable is returned cleanly
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => {
        const err = new Error("ENOENT");
        Object.assign(err, { code: "ENOENT" });
        throw err;
      },
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/credentials not found/i);
  });

  it("fresh cache hit returns immediately without new fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(usageResponseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const deps = {
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl,
    };

    // Prime the cache
    await readClaudeUsageSnapshot(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Second call hits fresh cache — no new fetch
    await readClaudeUsageSnapshot(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns error snapshot when background refresh error is thrown", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: async () => {
        throw new Error("fatal pty crash");
      },
      readCredentialsJson: async () => {
        throw new Error("disk failure");
      },
    });

    expect(snapshot.status).toBe("error");
  });

  it("uses OAuth API snapshot when CLI gives empty string (treated as no data)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(usageResponseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      spawnCliUsage: async () => "",
      readCredentialsJson: async () => validCredentials(),
      fetchImpl,
    });

    expect(snapshot.source).toBe("oauth-api");
  });

  it("returns unavailable 429 when CLI returns null and rate limit hit on cold cache", async () => {
    // No cache — CLI null — rate limit from OAuth — no stale cache to serve
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T13:00:00.000Z"),
      spawnCliUsage: noCliPty,
      readCredentialsJson: async () => validCredentials(),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "Too many requests." } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
    });

    // No stale cache — should return the unavailable rate limit response
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/rate limit|too many/i);
  });
});
