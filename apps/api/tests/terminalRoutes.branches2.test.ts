/**
 * Additional branch coverage for src/createApiServer/terminalRoutes.ts
 * Targets uncovered branches identified in the HTML coverage report.
 */
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";
import {
  handleTerminalActionRoute,
  handleTerminalInputRoute,
  handleTerminalItemRoute,
  handleTerminalsCollectionRoute,
} from "../src/createApiServer/terminalRoutes";
import { RuntimeInputError } from "../src/terminalRuntime";

// ---------------------------------------------------------------------------
// Helpers (same pattern as terminalRoutes.test.ts)
// ---------------------------------------------------------------------------
const makeResponse = () => {
  const chunks: string[] = [];
  let statusCode = 0;

  const res = new EventEmitter() as ServerResponse;

  res.writeHead = vi.fn(((code: number) => {
    statusCode = code;
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

const makeRequest = (method = "GET", body = ""): IncomingMessage => {
  const stream = body ? Readable.from([Buffer.from(body)]) : Readable.from([]);
  return Object.assign(stream, {
    method,
    headers: {} as IncomingMessage["headers"],
    url: "/",
  }) as unknown as IncomingMessage;
};

const makeCtx = (
  method: string,
  pathname: string,
  body = "",
): RouteHandlerContext & { getStatus: () => number; getBody: () => unknown } => {
  const { res, getStatus, getBody } = makeResponse();
  return {
    request: makeRequest(method, body),
    response: res,
    requestUrl: new URL(`http://localhost${pathname}`),
    corsOrigin: null,
    getStatus,
    getBody,
  };
};

const makeRuntime = () => ({
  listTerminalSnapshots: vi.fn(() => [] as unknown[]),
  createTerminal: vi.fn(() => ({
    terminalId: "terminal-1",
    tentacleId: "terminal-1",
    tentacleName: "Agent 1",
    workspaceMode: "shared",
    state: "live",
    label: "terminal-1",
    hasUserPrompt: false,
  })),
  getScrollback: vi.fn((_id: string) => null as string | null),
  renameTerminal: vi.fn((_id: string, _name: string) => null as unknown),
  deleteTerminal: vi.fn(),
  stopTerminal: vi.fn((_id: string) => null as unknown),
  killTerminal: vi.fn((_id: string) => null as unknown),
  writeInput: vi.fn((_id: string, _data: string) => false),
  pruneTerminals: vi.fn(() => [] as string[]),
});

const makeDeps = (runtime = makeRuntime()): RouteHandlerDependencies =>
  ({ runtime }) as unknown as RouteHandlerDependencies;

// ---------------------------------------------------------------------------
// handleTerminalsCollectionRoute — uncovered branches
// ---------------------------------------------------------------------------
describe("handleTerminalsCollectionRoute — branches2", () => {
  // model !== undefined branch: passes model through
  it("passes model to createTerminal when valid model provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ model: "sonnet" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ model: "sonnet" }),
    );
  });

  // effort !== undefined branch: passes effort through
  it("passes effort to createTerminal when valid effort provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ effort: "low" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(expect.objectContaining({ effort: "low" }));
  });

  // agentProvider !== undefined branch
  it("passes agentProvider to createTerminal when valid agentProvider provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ agentProvider: "claude-code" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ agentProvider: "claude-code" }),
    );
  });

  // nameOrigin !== undefined branch
  it("passes nameOrigin to createTerminal when valid nameOrigin provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ nameOrigin: "generated" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ nameOrigin: "generated" }),
    );
  });

  // color !== undefined branch
  it("passes color to createTerminal when valid color provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ color: "#ff0000" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ color: "#ff0000" }),
    );
  });

  // parentTerminalId branch: non-empty string
  it("passes parentTerminalId to createTerminal when provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx(
      "POST",
      "/api/terminals",
      JSON.stringify({ parentTerminalId: "terminal-1" }),
    );
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ parentTerminalId: "terminal-1" }),
    );
  });

  // autoRenamePromptContext branch
  it("passes autoRenamePromptContext to createTerminal when provided", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx(
      "POST",
      "/api/terminals",
      JSON.stringify({ autoRenamePromptContext: "debug CI failures" }),
    );
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ autoRenamePromptContext: "debug CI failures" }),
    );
  });

  // worktreeId valid (else-path: valid id does NOT get 400)
  it("passes valid worktreeId to createTerminal", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ worktreeId: "valid-worktree" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: "valid-worktree" }),
    );
  });

  // initialInputDraft valid (else-path when length <= MAX)
  it("passes valid initialInputDraft to createTerminal", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx(
      "POST",
      "/api/terminals",
      JSON.stringify({ initialInputDraft: "some draft text" }),
    );
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ initialInputDraft: "some draft text" }),
    );
  });

  // else path: non-RuntimeInputError rethrows
  it("re-throws non-RuntimeInputError from createTerminal", async () => {
    const runtime = makeRuntime();
    runtime.createTerminal.mockImplementation(() => {
      throw new Error("Unexpected internal error");
    });
    const ctx = makeCtx("POST", "/api/terminals");
    await expect(handleTerminalsCollectionRoute(ctx, makeDeps(runtime))).rejects.toThrow(
      "Unexpected internal error",
    );
  });

  // bodyReadResult.ok = false path (413 body too large triggers this too; here use a body that fails parsing — not needed since readJsonBodyOrWriteError handles it internally)
  // Actually we need to trigger the !bodyReadResult.ok branch by sending a body > 1MB
  // which is already tested in createApiServer.test.ts.
  // Instead, let's test the isGroupLeader=false path (not setting it)
  it("does not set isGroupLeader when flag is not true", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ isGroupLeader: false }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.not.objectContaining({ isGroupLeader: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleTerminalItemRoute — uncovered branches
// ---------------------------------------------------------------------------
describe("handleTerminalItemRoute — branches2", () => {
  // else path: non-RuntimeInputError on delete rethrows
  it("re-throws non-RuntimeInputError from deleteTerminal", async () => {
    const runtime = makeRuntime();
    runtime.deleteTerminal.mockImplementation(() => {
      throw new Error("Disk failure");
    });
    const ctx = makeCtx("DELETE", "/api/terminals/t1");
    await expect(handleTerminalItemRoute(ctx, makeDeps(runtime))).rejects.toThrow("Disk failure");
  });

  // !bodyReadResult.ok branch for PATCH — triggered by oversized body
  // We test that PATCH with no body at all still gets handled (empty body = empty object)
  it("returns 400 when PATCH body has null body (empty body)", async () => {
    const ctx = makeCtx("PATCH", "/api/terminals/t1", "");
    await handleTerminalItemRoute(ctx, makeDeps());
    // Empty body → name not provided
    expect(ctx.getStatus()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// handleTerminalInputRoute — uncovered branches
// ---------------------------------------------------------------------------
describe("handleTerminalInputRoute — branches2", () => {
  // !bodyReadResult.ok branch — body is too large (oversized)
  // Instead test that a null body payload (JSON null) gives 400
  it("returns 400 when body is JSON null (data field absent)", async () => {
    const ctx = makeCtx("POST", "/api/terminals/t1/input", "null");
    await handleTerminalInputRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "data is required" });
  });
});

// ---------------------------------------------------------------------------
// handleTerminalActionRoute — kill branch explicit
// ---------------------------------------------------------------------------
describe("handleTerminalActionRoute — branches2", () => {
  it("returns 404 when terminal not found for kill", async () => {
    const runtime = makeRuntime();
    runtime.killTerminal.mockReturnValue(null);
    const ctx = makeCtx("POST", "/api/terminals/missing/kill");
    await handleTerminalActionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
    expect(ctx.getBody()).toEqual({ error: "Terminal not found." });
  });
});
