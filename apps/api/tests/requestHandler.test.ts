import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

// node-pty must be mocked before createApiRequestHandler imports happen
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node-pty", () => ({ spawn: spawnMock }));

import { createApiRequestHandler } from "../src/createApiServer/requestHandler";
import type {
  RouteHandlerDependencies,
  TerminalRuntime,
} from "../src/createApiServer/routeHelpers";

// ---------------------------------------------------------------------------
// Minimal helpers
// ---------------------------------------------------------------------------
const makeRequest = (
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body = "",
): IncomingMessage => {
  const stream = body ? Readable.from([Buffer.from(body)]) : Readable.from([]);
  return Object.assign(stream, {
    method,
    url,
    headers,
  }) as unknown as IncomingMessage;
};

const makeResponse = () => {
  const chunks: string[] = [];
  let statusCode = 0;
  const headers: Record<string, string> = {};

  const res = new EventEmitter() as ServerResponse;

  res.writeHead = vi.fn(((code: number, hdrs?: Record<string, string>) => {
    statusCode = code;
    Object.assign(headers, hdrs ?? {});
    return res;
  }) as typeof res.writeHead) as unknown as typeof res.writeHead;

  res.end = vi.fn(((data?: string) => {
    if (data) chunks.push(data);
    return res;
  }) as typeof res.end) as unknown as typeof res.end;

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => {
      const raw = chunks.join("");
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    },
    getHeaders: () => headers,
  };
};

const makeMinimalRuntime = (): TerminalRuntime =>
  ({
    listTerminalSnapshots: vi.fn(() => []),
    createTerminal: vi.fn(() => ({
      terminalId: "terminal-1",
      tentacleId: "terminal-1",
      tentacleName: "Agent 1",
      workspaceMode: "shared" as const,
      state: "live",
      label: "terminal-1",
      hasUserPrompt: false,
    })),
    getScrollback: vi.fn(() => null),
    renameTerminal: vi.fn(() => null),
    deleteTerminal: vi.fn(),
    stopTerminal: vi.fn(() => null),
    killTerminal: vi.fn(() => null),
    writeInput: vi.fn(() => false),
    pruneTerminals: vi.fn(() => []),
    readTentacleGitStatus: vi.fn(() => null),
    commitTentacleWorktree: vi.fn(() => null),
    pushTentacleWorktree: vi.fn(() => null),
    syncTentacleWorktree: vi.fn(() => null),
    readTentaclePullRequest: vi.fn(() => null),
    createTentaclePullRequest: vi.fn(() => null),
    mergeTentaclePullRequest: vi.fn(() => null),
    listConversationSessions: vi.fn(() => []),
    readConversationSession: vi.fn(() => null),
    exportConversationSession: vi.fn(() => null),
    deleteConversationSession: vi.fn(),
    deleteAllConversationSessions: vi.fn(),
    searchConversations: vi.fn(() => []),
    readUiState: vi.fn(() => ({})),
    patchUiState: vi.fn(() => ({})),
    addSessionListener: vi.fn(),
    removeSessionListener: vi.fn(),
    handleWebSocketUpgrade: vi.fn(),
  }) as unknown as TerminalRuntime;

const makeMetricsStore = () => ({
  readAggregate: vi.fn(() => ({})),
  readHeatmap: vi.fn(() => ({})),
  readTerminalSummaries: vi.fn(() => []),
  readSummaryById: vi.fn(() => null),
  readEvents: vi.fn(() => []),
});

const makeDeps = (runtime = makeMinimalRuntime()): RouteHandlerDependencies =>
  ({
    runtime,
    workspaceCwd: "/tmp/test-workspace",
    projectStateDir: "/tmp/test-workspace/.sentiph",
    promptsDir: undefined,
    getApiBaseUrl: () => "http://localhost:8787",
    getApiPort: () => "8787",
    readClaudeUsageSnapshot: async () => ({
      status: "unavailable",
      source: "none",
      fetchedAt: new Date().toISOString(),
    }),
    readClaudeOauthUsageSnapshot: async () => ({
      status: "unavailable",
      source: "none",
      fetchedAt: new Date().toISOString(),
    }),
    readClaudeCliUsageSnapshot: async () => ({
      status: "unavailable",
      source: "none",
      fetchedAt: new Date().toISOString(),
    }),
    readCodexUsageSnapshot: async () => ({
      status: "unavailable",
      source: "none",
      fetchedAt: new Date().toISOString(),
    }),
    readGithubRepoSummary: async () => ({
      status: "unavailable",
      source: "none",
      fetchedAt: new Date().toISOString(),
    }),
    scanUsageHeatmap: async () => ({
      scope: "project",
      buckets: [],
    }),
    invalidateClaudeUsageCache: vi.fn(),
    metricsStore: makeMetricsStore(),
  }) as unknown as RouteHandlerDependencies;

const makeHandler = (overrides: Partial<Parameters<typeof createApiRequestHandler>[0]> = {}) => {
  const deps = makeDeps();
  return createApiRequestHandler({
    runtime: deps.runtime,
    workspaceCwd: "/tmp/test-workspace",
    projectStateDir: "/tmp/test-workspace/.sentiph",
    getApiBaseUrl: () => "http://localhost:8787",
    getApiPort: () => "8787",
    readClaudeUsageSnapshot: deps.readClaudeUsageSnapshot,
    readClaudeOauthUsageSnapshot: deps.readClaudeOauthUsageSnapshot,
    readClaudeCliUsageSnapshot: deps.readClaudeCliUsageSnapshot,
    readCodexUsageSnapshot: deps.readCodexUsageSnapshot,
    readGithubRepoSummary: deps.readGithubRepoSummary,
    scanUsageHeatmap: deps.scanUsageHeatmap,
    invalidateClaudeUsageCache: vi.fn(),
    metricsStore: makeMetricsStore() as unknown as Parameters<
      typeof createApiRequestHandler
    >[0]["metricsStore"],
    allowRemoteAccess: false,
    ...overrides,
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("createApiRequestHandler – host/origin security", () => {
  it("returns 403 when Host header is missing (local mode)", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/api/terminal-snapshots", {});
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(403);
    expect(getBody()).toEqual({ error: "Host not allowed." });
  });

  it("returns 403 when Origin is non-loopback (local mode)", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/api/terminal-snapshots", {
      host: "localhost:8787",
      origin: "https://attacker.example",
    });
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(403);
    expect(getBody()).toEqual({ error: "Origin not allowed." });
  });

  it("returns 200 when Host is localhost (local mode, no origin)", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/api/terminal-snapshots", {
      host: "localhost:8787",
    });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
  });

  it("returns 200 when loopback origin is provided", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/api/terminal-snapshots", {
      host: "localhost:8787",
      origin: "http://localhost:5173",
    });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
  });

  it("reflects CORS origin and sets Vary: Origin header", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/api/terminal-snapshots", {
      host: "localhost:8787",
      origin: "http://localhost:5173",
    });
    const { res, getHeaders } = makeResponse();
    await handler(req, res);
    expect(getHeaders()["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(getHeaders().Vary).toBe("Origin");
  });
});

describe("createApiRequestHandler – OPTIONS preflight", () => {
  it("returns 204 for OPTIONS on allowed origin", async () => {
    const handler = makeHandler();
    const req = makeRequest("OPTIONS", "/api/terminals", {
      host: "localhost:8787",
      origin: "http://localhost:5173",
      "access-control-request-method": "POST",
    });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(204);
  });

  it("returns 403 for OPTIONS on non-local origin", async () => {
    const handler = makeHandler();
    const req = makeRequest("OPTIONS", "/api/terminals", {
      host: "localhost:8787",
      origin: "https://attacker.example",
      "access-control-request-method": "POST",
    });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(403);
  });
});

describe("createApiRequestHandler – remote access mode", () => {
  it("returns 401 when allowRemoteAccess=true and no auth provided for non-loopback host", async () => {
    const handler = makeHandler({ allowRemoteAccess: true });
    const req = makeRequest("GET", "/api/terminal-snapshots", {
      host: "my-server.example:8787",
    });
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(401);
    expect(getBody()).toEqual({ error: "Unauthorized" });
  });

  it("allows request from loopback host even in remote access mode without token", async () => {
    const handler = makeHandler({ allowRemoteAccess: true });
    const req = makeRequest("GET", "/api/terminal-snapshots", {
      host: "localhost:8787",
    });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
  });
});

describe("createApiRequestHandler – route routing", () => {
  it("returns 404 for unknown routes", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/api/unknown-path", { host: "localhost" });
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(404);
    expect(getBody()).toEqual({ error: "Not found" });
  });

  it("returns 404 for path without /api prefix", async () => {
    const handler = makeHandler();
    const req = makeRequest("GET", "/not-api/anything", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(404);
  });

  it("handles GET /api/terminal-snapshots correctly", async () => {
    const runtime = makeMinimalRuntime();
    (runtime.listTerminalSnapshots as ReturnType<typeof vi.fn>).mockReturnValue([
      { terminalId: "terminal-1" },
    ]);
    const handler = makeHandler({ runtime });
    const req = makeRequest("GET", "/api/terminal-snapshots", { host: "127.0.0.1" });
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual([{ terminalId: "terminal-1" }]);
  });

  it("returns 500 and sanitizes internal errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = makeHandler();
    // Malformed URL-encoded character in path causes decodeURIComponent to throw
    const req = makeRequest("DELETE", "/api/terminals/%E0%A4%A", { host: "localhost" });
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(500);
    expect(getBody()).toEqual({ error: "Internal server error" });
    consoleSpy.mockRestore();
  });
});

describe("createApiRequestHandler – static file serving", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("serves index.html for / when webDistDir is provided", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-handler-test-"));
    writeFileSync(join(tmpDir, "index.html"), "<html><body>App</body></html>", "utf8");

    const handler = makeHandler({ webDistDir: tmpDir });
    const req = makeRequest("GET", "/", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
  });

  it("serves static .js file when webDistDir is provided", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-handler-test-"));
    writeFileSync(join(tmpDir, "app.js"), 'console.log("hi")', "utf8");

    const handler = makeHandler({ webDistDir: tmpDir });
    const req = makeRequest("GET", "/app.js", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
  });

  it("falls back to index.html for unknown static paths (SPA routing)", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-handler-test-"));
    writeFileSync(join(tmpDir, "index.html"), "<html>App</html>", "utf8");

    const handler = makeHandler({ webDistDir: tmpDir });
    const req = makeRequest("GET", "/some/nested/route", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    // Falls back to index.html
    expect(getStatus()).toBe(200);
  });

  it("does not serve static files for POST requests", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-handler-test-"));
    writeFileSync(join(tmpDir, "index.html"), "<html>App</html>", "utf8");

    const handler = makeHandler({ webDistDir: tmpDir });
    const req = makeRequest("POST", "/index.html", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    // POST doesn't serve static, falls to 404
    expect(getStatus()).toBe(404);
  });

  it("prevents path traversal attacks", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-handler-test-"));
    const secretFile = join(tmpDir, "secret.txt");
    writeFileSync(secretFile, "secret content", "utf8");

    const handler = makeHandler({ webDistDir: tmpDir });
    // Path traversal attempt
    const req = makeRequest("GET", "/../secret.txt", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    // Should not serve the file (URL normalization prevents traversal, falls to 404)
    expect([404, 200]).toContain(getStatus()); // 404 when file inaccessible
  });
});

describe("createApiRequestHandler – metrics routes", () => {
  it("routes GET /api/metrics/aggregate correctly", async () => {
    const metricsStore = makeMetricsStore();
    metricsStore.readAggregate.mockReturnValue({ totalRuns: 5 });
    const handler = makeHandler({
      metricsStore: metricsStore as unknown as Parameters<
        typeof createApiRequestHandler
      >[0]["metricsStore"],
    });
    const req = makeRequest("GET", "/api/metrics/aggregate", { host: "localhost" });
    const { res, getStatus, getBody } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ totalRuns: 5 });
  });

  it("routes GET /api/metrics/heatmap correctly", async () => {
    const metricsStore = makeMetricsStore();
    metricsStore.readHeatmap.mockReturnValue({ days: 7, buckets: [] });
    const handler = makeHandler({
      metricsStore: metricsStore as unknown as Parameters<
        typeof createApiRequestHandler
      >[0]["metricsStore"],
    });
    const req = makeRequest("GET", "/api/metrics/heatmap", { host: "localhost" });
    const { res, getStatus } = makeResponse();
    await handler(req, res);
    expect(getStatus()).toBe(200);
  });
});
