/**
 * tests/hooksRoutes.test.ts
 *
 * Targets uncovered branches in src/createApiServer/hooksRoutes.ts:
 *  - handleHookSessionStartRoute: pathname mismatch → false, non-POST → 405
 *  - handleHookUserPromptSubmitRoute: pathname mismatch → false, non-POST → 405
 *  - handleHookUserPromptSubmitRoute: no sentiph_session → skip rename
 *  - handleHookUserPromptSubmitRoute: body parse error → bodyResult.ok=false
 *  - handleHookUserPromptSubmitRoute: payload.prompt is not string → rawPrompt=""
 *  - handleHookUserPromptSubmitRoute: rawPrompt is empty string → no rename
 *  - handleHookUserPromptSubmitRoute: multiline prompt → only firstLine used
 *  - handleHookUserPromptSubmitRoute: prompt > MAX_AUTO_RENAME_LENGTH → truncated
 *  - handleHookUserPromptSubmitRoute: prompt exactly at MAX_AUTO_RENAME_LENGTH → not truncated
 *  - handleHookUserPromptSubmitRoute: null payload → no rename
 */

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import {
  handleHookSessionStartRoute,
  handleHookUserPromptSubmitRoute,
} from "../src/createApiServer/hooksRoutes";
import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
  TerminalRuntime,
} from "../src/createApiServer/routeHelpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRequest = (
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body = "",
): IncomingMessage => {
  const stream = body ? Readable.from([Buffer.from(body)]) : Readable.from([]);
  return Object.assign(stream, { method, url, headers }) as unknown as IncomingMessage;
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
  };
};

const makeContext = (
  method: string,
  pathname: string,
  search = "",
  body = "",
): RouteHandlerContext => {
  const url = `${pathname}${search}`;
  const req = makeRequest(method, url, {}, body);
  const { res } = makeResponse();
  const requestUrl = new URL(`http://localhost${url}`);
  return { request: req, response: res, requestUrl, corsOrigin: null };
};

const makeContextWithSharedResponse = (
  method: string,
  pathname: string,
  search = "",
  body = "",
) => {
  const url = `${pathname}${search}`;
  const req = makeRequest(method, url, {}, body);
  const { res, getStatus, getBody } = makeResponse();
  const requestUrl = new URL(`http://localhost${url}`);
  return {
    context: { request: req, response: res, requestUrl, corsOrigin: null } as RouteHandlerContext,
    getStatus,
    getBody,
  };
};

const makeMockRuntime = () => ({
  renameTerminalBySessionAuto: vi.fn(),
});

const makeDeps = (runtime?: Partial<TerminalRuntime>): RouteHandlerDependencies =>
  ({
    runtime: { renameTerminalBySessionAuto: vi.fn(), ...runtime } as unknown as TerminalRuntime,
    workspaceCwd: "/tmp",
    projectStateDir: "/tmp/.sentiph",
    getApiBaseUrl: () => "http://localhost:8787",
    getApiPort: () => "8787",
    invalidateClaudeUsageCache: vi.fn(),
    readClaudeUsageSnapshot: vi.fn(),
    readClaudeOauthUsageSnapshot: vi.fn(),
    readClaudeCliUsageSnapshot: vi.fn(),
    readCodexUsageSnapshot: vi.fn(),
    readGithubRepoSummary: vi.fn(),
    scanUsageHeatmap: vi.fn(),
    metricsStore: {} as RouteHandlerDependencies["metricsStore"],
  }) as unknown as RouteHandlerDependencies;

// ---------------------------------------------------------------------------
// handleHookSessionStartRoute
// ---------------------------------------------------------------------------

describe("handleHookSessionStartRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const { context, getStatus } = makeContextWithSharedResponse("POST", "/api/hooks/other");
    const result = await handleHookSessionStartRoute(context, makeDeps());
    expect(result).toBe(false);
    expect(getStatus()).toBe(0); // nothing written
  });

  it("returns 405 for non-POST methods on matching pathname", async () => {
    const { context, getStatus, getBody } = makeContextWithSharedResponse(
      "GET",
      "/api/hooks/session-start",
    );
    const result = await handleHookSessionStartRoute(context, makeDeps());
    expect(result).toBe(true);
    expect(getStatus()).toBe(405);
    expect(getBody()).toEqual({ error: "Method not allowed" });
  });

  it("returns 200 and calls invalidateClaudeUsageCache for POST", async () => {
    const invalidate = vi.fn();
    const { context, getStatus, getBody } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/session-start",
    );
    const result = await handleHookSessionStartRoute(
      context,
      makeDeps({ renameTerminalBySessionAuto: vi.fn() } as Partial<TerminalRuntime>),
    );
    expect(result).toBe(true);
    expect(getStatus()).toBe(200);
  });

  it("calls invalidateClaudeUsageCache on POST", async () => {
    const invalidate = vi.fn();
    const { context } = makeContextWithSharedResponse("POST", "/api/hooks/session-start");
    const deps = makeDeps();
    (
      deps as unknown as { invalidateClaudeUsageCache: typeof invalidate }
    ).invalidateClaudeUsageCache = invalidate;
    await handleHookSessionStartRoute(context, deps);
    expect(invalidate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// handleHookUserPromptSubmitRoute
// ---------------------------------------------------------------------------

describe("handleHookUserPromptSubmitRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const { context, getStatus } = makeContextWithSharedResponse("POST", "/api/hooks/other");
    const result = await handleHookUserPromptSubmitRoute(context, makeDeps());
    expect(result).toBe(false);
    expect(getStatus()).toBe(0);
  });

  it("returns 405 for non-POST methods", async () => {
    const { context, getStatus } = makeContextWithSharedResponse(
      "GET",
      "/api/hooks/user-prompt-submit",
    );
    const result = await handleHookUserPromptSubmitRoute(context, makeDeps());
    expect(result).toBe(true);
    expect(getStatus()).toBe(405);
  });

  it("returns 200 and does NOT rename when no sentiph_session query param", async () => {
    const runtime = makeMockRuntime();
    const { context, getStatus } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "",
      JSON.stringify({ prompt: "Do something" }),
    );
    const result = await handleHookUserPromptSubmitRoute(
      context,
      makeDeps(runtime as Partial<TerminalRuntime>),
    );
    expect(result).toBe(true);
    expect(getStatus()).toBe(200);
    expect(runtime.renameTerminalBySessionAuto).not.toHaveBeenCalled();
  });

  it("returns 200 and does NOT rename when prompt is empty string", async () => {
    const runtime = makeMockRuntime();
    const { context, getStatus } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-1",
      JSON.stringify({ prompt: "   " }),
    );
    const result = await handleHookUserPromptSubmitRoute(
      context,
      makeDeps(runtime as Partial<TerminalRuntime>),
    );
    expect(result).toBe(true);
    expect(getStatus()).toBe(200);
    expect(runtime.renameTerminalBySessionAuto).not.toHaveBeenCalled();
  });

  it("does NOT rename when prompt field is not a string", async () => {
    const runtime = makeMockRuntime();
    const { context, getStatus } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-2",
      JSON.stringify({ prompt: 12345 }),
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    expect(getStatus()).toBe(200);
    expect(runtime.renameTerminalBySessionAuto).not.toHaveBeenCalled();
  });

  it("does NOT rename when body payload is null", async () => {
    const runtime = makeMockRuntime();
    const { context, getStatus } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-3",
      "null",
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    expect(getStatus()).toBe(200);
    expect(runtime.renameTerminalBySessionAuto).not.toHaveBeenCalled();
  });

  it("renames with only first line of a multiline prompt", async () => {
    const runtime = makeMockRuntime();
    const { context } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-4",
      JSON.stringify({ prompt: "First line\nSecond line\nThird line" }),
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    expect(runtime.renameTerminalBySessionAuto).toHaveBeenCalledWith("sess-4", "First line");
  });

  it("truncates prompt longer than MAX_AUTO_RENAME_LENGTH (100 chars)", async () => {
    const runtime = makeMockRuntime();
    const longPrompt = "A".repeat(150);
    const { context } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-5",
      JSON.stringify({ prompt: longPrompt }),
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    expect(runtime.renameTerminalBySessionAuto).toHaveBeenCalledWith("sess-5", "A".repeat(100));
  });

  it("does NOT truncate prompt exactly at MAX_AUTO_RENAME_LENGTH (100 chars)", async () => {
    const runtime = makeMockRuntime();
    const exactPrompt = "B".repeat(100);
    const { context } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-6",
      JSON.stringify({ prompt: exactPrompt }),
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    expect(runtime.renameTerminalBySessionAuto).toHaveBeenCalledWith("sess-6", exactPrompt);
  });

  it("does NOT truncate prompt shorter than MAX_AUTO_RENAME_LENGTH", async () => {
    const runtime = makeMockRuntime();
    const shortPrompt = "C".repeat(50);
    const { context } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-7",
      JSON.stringify({ prompt: shortPrompt }),
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    expect(runtime.renameTerminalBySessionAuto).toHaveBeenCalledWith("sess-7", shortPrompt);
  });

  it("returns true early when body read fails (bodyResult.ok=false)", async () => {
    const runtime = makeMockRuntime();

    // Simulate invalid JSON body
    const { context, getStatus } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-8",
      "this is not json",
    );
    const result = await handleHookUserPromptSubmitRoute(
      context,
      makeDeps(runtime as Partial<TerminalRuntime>),
    );
    expect(result).toBe(true);
    // 400 for bad JSON
    expect(getStatus()).toBe(400);
    expect(runtime.renameTerminalBySessionAuto).not.toHaveBeenCalled();
  });

  it("renames normally when prompt has trailing whitespace on first line", async () => {
    const runtime = makeMockRuntime();
    const { context } = makeContextWithSharedResponse(
      "POST",
      "/api/hooks/user-prompt-submit",
      "?sentiph_session=sess-9",
      JSON.stringify({ prompt: "  Fix the bug  " }),
    );
    await handleHookUserPromptSubmitRoute(context, makeDeps(runtime as Partial<TerminalRuntime>));
    // trim() on rawPrompt → "Fix the bug"; firstLine is the same
    expect(runtime.renameTerminalBySessionAuto).toHaveBeenCalledWith("sess-9", "Fix the bug");
  });
});
