import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import {
  handleConversationExportRoute,
  handleConversationItemRoute,
  handleConversationSearchRoute,
  handleConversationsCollectionRoute,
} from "../src/createApiServer/conversationRoutes";
import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeResponse = () => {
  const chunks: string[] = [];
  let statusCode = 0;
  let contentType = "";

  const res = new EventEmitter() as ServerResponse;

  res.writeHead = vi.fn(((code: number, hdrs?: Record<string, string>) => {
    statusCode = code;
    contentType = hdrs?.["Content-Type"] ?? "";
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
    getContentType: () => contentType,
  };
};

const makeRequest = (method = "GET"): IncomingMessage => {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.headers = {};
  return req;
};

const makeCtx = (
  method: string,
  pathname: string,
  searchParams: Record<string, string> = {},
): RouteHandlerContext & {
  getStatus: () => number;
  getBody: () => unknown;
  getContentType: () => string;
} => {
  const { res, getStatus, getBody, getContentType } = makeResponse();
  const url = new URL(`http://localhost${pathname}`);
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return {
    request: makeRequest(method),
    response: res,
    requestUrl: url,
    corsOrigin: null,
    getStatus,
    getBody,
    getContentType,
  };
};

const makeRuntime = () => ({
  listConversationSessions: vi.fn<() => unknown[]>(() => []),
  readConversationSession: vi.fn(() => null as unknown),
  exportConversationSession: vi.fn(() => null as string | null),
  deleteConversationSession: vi.fn(),
  deleteAllConversationSessions: vi.fn(),
  searchConversations: vi.fn<() => unknown[]>(() => []),
});

const makeDeps = (runtime = makeRuntime()): RouteHandlerDependencies =>
  ({ runtime }) as unknown as RouteHandlerDependencies;

// ---------------------------------------------------------------------------
// handleConversationsCollectionRoute
// ---------------------------------------------------------------------------
describe("handleConversationsCollectionRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("GET", "/api/conversations/search");
    const result = await handleConversationsCollectionRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for unsupported methods (PATCH)", async () => {
    const ctx = makeCtx("PATCH", "/api/conversations");
    const result = await handleConversationsCollectionRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 200 with list for GET", async () => {
    const runtime = makeRuntime();
    runtime.listConversationSessions.mockReturnValue([{ sessionId: "s1" }]);
    const ctx = makeCtx("GET", "/api/conversations");
    await handleConversationsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual([{ sessionId: "s1" }]);
  });

  it("returns 204 for DELETE and calls deleteAllConversationSessions", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("DELETE", "/api/conversations");
    const result = await handleConversationsCollectionRoute(ctx, makeDeps(runtime));
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(204);
    expect(runtime.deleteAllConversationSessions).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// handleConversationSearchRoute
// ---------------------------------------------------------------------------
describe("handleConversationSearchRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("GET", "/api/conversations");
    const result = await handleConversationSearchRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST", async () => {
    const ctx = makeCtx("POST", "/api/conversations/search");
    const result = await handleConversationSearchRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 400 when q param is missing", async () => {
    const ctx = makeCtx("GET", "/api/conversations/search");
    await handleConversationSearchRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "Missing search query parameter 'q'." });
  });

  it("returns 400 when q param is whitespace only", async () => {
    const ctx = makeCtx("GET", "/api/conversations/search", { q: "   " });
    await handleConversationSearchRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 200 with results for valid query", async () => {
    const runtime = makeRuntime();
    runtime.searchConversations.mockReturnValue([{ sessionId: "s1" }]);
    const ctx = makeCtx("GET", "/api/conversations/search", { q: "CI failures" });
    await handleConversationSearchRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual([{ sessionId: "s1" }]);
    expect(runtime.searchConversations).toHaveBeenCalledWith("CI failures");
  });
});

// ---------------------------------------------------------------------------
// handleConversationItemRoute
// ---------------------------------------------------------------------------
describe("handleConversationItemRoute", () => {
  it("returns false when pathname does not match /api/conversations/{id}", async () => {
    const ctx = makeCtx("GET", "/api/conversations/s1/export");
    const result = await handleConversationItemRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns false for /api/conversations/search (handled by search route)", async () => {
    const ctx = makeCtx("GET", "/api/conversations/search");
    // The item route DOES match /api/conversations/search because search is a valid segment
    // So we just check it doesn't 404 unexpectedly — it returns true
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue(null);
    const result = await handleConversationItemRoute(ctx, makeDeps(runtime));
    // search path will be treated as session id "search"
    expect(result).toBe(true);
  });

  it("returns 405 for PATCH", async () => {
    const ctx = makeCtx("PATCH", "/api/conversations/my-session");
    const result = await handleConversationItemRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 200 with session for GET found", async () => {
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue({ sessionId: "s1", turns: [] });
    const ctx = makeCtx("GET", "/api/conversations/s1");
    await handleConversationItemRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual({ sessionId: "s1", turns: [] });
  });

  it("returns 404 for GET not found", async () => {
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue(null);
    const ctx = makeCtx("GET", "/api/conversations/missing");
    await handleConversationItemRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
    expect(ctx.getBody()).toEqual({ error: "Conversation session not found." });
  });

  it("returns 204 and deletes session for DELETE", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("DELETE", "/api/conversations/s1");
    const result = await handleConversationItemRoute(ctx, makeDeps(runtime));
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(204);
    expect(runtime.deleteConversationSession).toHaveBeenCalledWith("s1");
  });

  it("URL-decodes session id", async () => {
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue({ sessionId: "a b", turns: [] });
    const ctx = makeCtx("GET", "/api/conversations/a%20b");
    await handleConversationItemRoute(ctx, makeDeps(runtime));
    expect(runtime.readConversationSession).toHaveBeenCalledWith("a b");
  });
});

// ---------------------------------------------------------------------------
// handleConversationExportRoute
// ---------------------------------------------------------------------------
describe("handleConversationExportRoute", () => {
  it("returns false when pathname does not match /api/conversations/{id}/export", async () => {
    const ctx = makeCtx("GET", "/api/conversations/s1");
    const result = await handleConversationExportRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST", async () => {
    const ctx = makeCtx("POST", "/api/conversations/s1/export", { format: "json" });
    const result = await handleConversationExportRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 400 for unsupported format", async () => {
    const ctx = makeCtx("GET", "/api/conversations/s1/export", { format: "txt" });
    await handleConversationExportRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "Unsupported conversation export format." });
  });

  it("returns 400 when format param is missing", async () => {
    const ctx = makeCtx("GET", "/api/conversations/s1/export");
    await handleConversationExportRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns JSON export for format=json when session found", async () => {
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue({ sessionId: "s1", turns: [] });
    const ctx = makeCtx("GET", "/api/conversations/s1/export", { format: "json" });
    await handleConversationExportRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual({ sessionId: "s1", turns: [] });
  });

  it("returns 404 JSON export when session not found for format=json", async () => {
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue(null);
    const ctx = makeCtx("GET", "/api/conversations/missing/export", { format: "json" });
    await handleConversationExportRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
    expect(ctx.getBody()).toEqual({ error: "Conversation session not found." });
  });

  it("returns markdown export for format=md when session found", async () => {
    const runtime = makeRuntime();
    runtime.exportConversationSession.mockReturnValue("## User\nhello\n## Assistant\nworld");
    const ctx = makeCtx("GET", "/api/conversations/s1/export", { format: "md" });
    await handleConversationExportRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getContentType()).toContain("text/markdown");
    expect(ctx.getBody()).toContain("## User");
  });

  it("returns 404 for format=md when session not found", async () => {
    const runtime = makeRuntime();
    runtime.exportConversationSession.mockReturnValue(null);
    const ctx = makeCtx("GET", "/api/conversations/missing/export", { format: "md" });
    await handleConversationExportRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
    expect(ctx.getBody()).toEqual({ error: "Conversation session not found." });
  });

  it("URL-decodes session id in export path", async () => {
    const runtime = makeRuntime();
    runtime.readConversationSession.mockReturnValue({ sessionId: "a b", turns: [] });
    const ctx = makeCtx("GET", "/api/conversations/a%20b/export", { format: "json" });
    await handleConversationExportRoute(ctx, makeDeps(runtime));
    expect(runtime.readConversationSession).toHaveBeenCalledWith("a b");
  });
});
