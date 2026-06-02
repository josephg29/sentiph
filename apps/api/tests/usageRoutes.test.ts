/**
 * tests/usageRoutes.test.ts
 *
 * Unit tests for createApiServer/usageRoutes.ts
 * Covers handleCodexUsageRoute, handleClaudeUsageRoute,
 * handleUsageHeatmapRoute, and handleGithubSummaryRoute.
 */

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  handleClaudeUsageRoute,
  handleCodexUsageRoute,
  handleGithubSummaryRoute,
  handleUsageHeatmapRoute,
} from "../src/createApiServer/usageRoutes";

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

function makeResponse() {
  const res = new EventEmitter() as ServerResponse;
  res.writeHead = vi.fn() as unknown as typeof res.writeHead;
  res.end = vi.fn() as unknown as typeof res.end;
  return res;
}

function makeRequest(method = "GET", body = ""): IncomingMessage {
  const req = Readable.from([body]) as IncomingMessage;
  req.method = method;
  req.headers = {};
  return req;
}

function makeContext(pathname: string, method = "GET", search = "") {
  return {
    request: makeRequest(method),
    response: makeResponse(),
    requestUrl: new URL(`http://localhost${pathname}${search}`),
    corsOrigin: null as string | null,
  };
}

// Minimal stub dependencies — only add what each handler requires
const noop = async () => ({}) as never;
const noopSnapshot = async () =>
  ({ status: "ok", fetchedAt: new Date().toISOString(), source: "oauth-api" }) as never;

const baseDeps = {
  runtime: {} as never,
  workspaceCwd: "/tmp",
  projectStateDir: "/tmp/.sentiph",
  getApiBaseUrl: () => "http://127.0.0.1:8787",
  getApiPort: () => "8787",
  readClaudeUsageSnapshot: noopSnapshot,
  readClaudeOauthUsageSnapshot: noopSnapshot,
  readClaudeCliUsageSnapshot: noopSnapshot,
  readCodexUsageSnapshot: noopSnapshot,
  readGithubRepoSummary: noopSnapshot,
  scanUsageHeatmap: async (_scope: "all" | "project") => ({ heatmap: [] }) as never,
  invalidateClaudeUsageCache: () => undefined,
  metricsStore: {} as never,
};

// ---------------------------------------------------------------------------
// handleCodexUsageRoute
// ---------------------------------------------------------------------------
describe("handleCodexUsageRoute", () => {
  it("returns false when pathname does not match /api/codex/usage", async () => {
    const ctx = makeContext("/api/other");
    const result = await handleCodexUsageRoute(ctx, baseDeps);
    expect(result).toBe(false);
  });

  it("returns 405 for non-GET methods", async () => {
    const ctx = makeContext("/api/codex/usage", "POST");
    const result = await handleCodexUsageRoute(ctx, baseDeps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("calls readCodexUsageSnapshot and writes 200 for GET", async () => {
    const mockPayload = { tokens: 42 };
    const deps = {
      ...baseDeps,
      readCodexUsageSnapshot: vi.fn().mockResolvedValueOnce(mockPayload),
    };
    const ctx = makeContext("/api/codex/usage");
    const result = await handleCodexUsageRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(ctx.response.end).toHaveBeenCalledWith(JSON.stringify(mockPayload));
  });

  it("passes corsOrigin to writeJson", async () => {
    const ctx = makeContext("/api/codex/usage");
    ctx.corsOrigin = "https://example.com";
    const deps = {
      ...baseDeps,
      readCodexUsageSnapshot: vi.fn().mockResolvedValueOnce({}),
    };
    await handleCodexUsageRoute(ctx, deps);
    const headers = (ctx.response.writeHead as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as Record<string, string>;
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });
});

// ---------------------------------------------------------------------------
// handleClaudeUsageRoute
// ---------------------------------------------------------------------------
describe("handleClaudeUsageRoute", () => {
  it("returns false for unrelated pathnames", async () => {
    const ctx = makeContext("/api/other");
    const result = await handleClaudeUsageRoute(ctx, baseDeps);
    expect(result).toBe(false);
  });

  it("returns 405 for non-GET methods on /api/claude/usage", async () => {
    const ctx = makeContext("/api/claude/usage", "DELETE");
    const result = await handleClaudeUsageRoute(ctx, baseDeps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("calls readClaudeUsageSnapshot for /api/claude/usage", async () => {
    const payload = { status: "ok", source: "cli-pty" };
    const deps = {
      ...baseDeps,
      readClaudeUsageSnapshot: vi.fn().mockResolvedValueOnce(payload),
    };
    const ctx = makeContext("/api/claude/usage");
    await handleClaudeUsageRoute(ctx, deps);
    expect(deps.readClaudeUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(ctx.response.end).toHaveBeenCalledWith(JSON.stringify(payload));
  });

  it("calls readClaudeOauthUsageSnapshot for /api/claude/usage/oauth", async () => {
    const payload = { status: "ok", source: "oauth-api" };
    const deps = {
      ...baseDeps,
      readClaudeOauthUsageSnapshot: vi.fn().mockResolvedValueOnce(payload),
    };
    const ctx = makeContext("/api/claude/usage/oauth");
    await handleClaudeUsageRoute(ctx, deps);
    expect(deps.readClaudeOauthUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(ctx.response.end).toHaveBeenCalledWith(JSON.stringify(payload));
  });

  it("calls readClaudeCliUsageSnapshot for /api/claude/usage/cli", async () => {
    const payload = { status: "ok", source: "cli-pty" };
    const deps = {
      ...baseDeps,
      readClaudeCliUsageSnapshot: vi.fn().mockResolvedValueOnce(payload),
    };
    const ctx = makeContext("/api/claude/usage/cli");
    await handleClaudeUsageRoute(ctx, deps);
    expect(deps.readClaudeCliUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(ctx.response.end).toHaveBeenCalledWith(JSON.stringify(payload));
  });

  it("returns 405 for non-GET on /api/claude/usage/oauth", async () => {
    const ctx = makeContext("/api/claude/usage/oauth", "POST");
    await handleClaudeUsageRoute(ctx, baseDeps);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("returns 405 for non-GET on /api/claude/usage/cli", async () => {
    const ctx = makeContext("/api/claude/usage/cli", "PUT");
    await handleClaudeUsageRoute(ctx, baseDeps);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// handleUsageHeatmapRoute
// ---------------------------------------------------------------------------
describe("handleUsageHeatmapRoute", () => {
  it("returns false for unrelated pathnames", async () => {
    const ctx = makeContext("/api/other");
    const result = await handleUsageHeatmapRoute(ctx, baseDeps);
    expect(result).toBe(false);
  });

  it("returns 405 for non-GET", async () => {
    const ctx = makeContext("/api/analytics/usage-heatmap", "POST");
    const result = await handleUsageHeatmapRoute(ctx, baseDeps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("passes scope=all when query param is absent", async () => {
    const mockScan = vi.fn().mockResolvedValueOnce({ heatmap: [] });
    const deps = { ...baseDeps, scanUsageHeatmap: mockScan };
    const ctx = makeContext("/api/analytics/usage-heatmap");
    await handleUsageHeatmapRoute(ctx, deps);
    expect(mockScan).toHaveBeenCalledWith("all");
  });

  it("passes scope=project when query param is 'project'", async () => {
    const mockScan = vi.fn().mockResolvedValueOnce({ heatmap: [] });
    const deps = { ...baseDeps, scanUsageHeatmap: mockScan };
    const ctx = makeContext("/api/analytics/usage-heatmap", "GET", "?scope=project");
    await handleUsageHeatmapRoute(ctx, deps);
    expect(mockScan).toHaveBeenCalledWith("project");
  });

  it("passes scope=all for unrecognized scope value", async () => {
    const mockScan = vi.fn().mockResolvedValueOnce({ heatmap: [] });
    const deps = { ...baseDeps, scanUsageHeatmap: mockScan };
    const ctx = makeContext("/api/analytics/usage-heatmap", "GET", "?scope=team");
    await handleUsageHeatmapRoute(ctx, deps);
    expect(mockScan).toHaveBeenCalledWith("all");
  });

  it("writes 200 with heatmap payload", async () => {
    const payload = { heatmap: [{ hour: 0, count: 5 }] };
    const deps = {
      ...baseDeps,
      scanUsageHeatmap: vi.fn().mockResolvedValueOnce(payload),
    };
    const ctx = makeContext("/api/analytics/usage-heatmap");
    await handleUsageHeatmapRoute(ctx, deps);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(ctx.response.end).toHaveBeenCalledWith(JSON.stringify(payload));
  });
});

// ---------------------------------------------------------------------------
// handleGithubSummaryRoute
// ---------------------------------------------------------------------------
describe("handleGithubSummaryRoute", () => {
  it("returns false for unrelated pathnames", async () => {
    const ctx = makeContext("/api/other");
    const result = await handleGithubSummaryRoute(ctx, baseDeps);
    expect(result).toBe(false);
  });

  it("returns 405 for non-GET", async () => {
    const ctx = makeContext("/api/github/summary", "POST");
    const result = await handleGithubSummaryRoute(ctx, baseDeps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("calls readGithubRepoSummary and writes 200 for GET", async () => {
    const summary = { repoName: "sentiph", stars: 99 };
    const deps = {
      ...baseDeps,
      readGithubRepoSummary: vi.fn().mockResolvedValueOnce(summary),
    };
    const ctx = makeContext("/api/github/summary");
    const result = await handleGithubSummaryRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(ctx.response.end).toHaveBeenCalledWith(JSON.stringify(summary));
  });
});
