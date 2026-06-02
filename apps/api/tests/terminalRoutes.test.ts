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
  handleTerminalPruneRoute,
  handleTerminalScrollbackRoute,
  handleTerminalSnapshotsRoute,
  handleTerminalsCollectionRoute,
} from "../src/createApiServer/terminalRoutes";
import { RuntimeInputError } from "../src/terminalRuntime";

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
): RouteHandlerContext & {
  getStatus: () => number;
  getBody: () => unknown;
  getContentType: () => string;
} => {
  const { res, getStatus, getBody, getContentType } = makeResponse();
  return {
    request: makeRequest(method, body),
    response: res,
    requestUrl: new URL(`http://localhost${pathname}`),
    corsOrigin: null,
    getStatus,
    getBody,
    getContentType,
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
// handleTerminalSnapshotsRoute
// ---------------------------------------------------------------------------
describe("handleTerminalSnapshotsRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("GET", "/api/terminals");
    const result = await handleTerminalSnapshotsRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST", async () => {
    const ctx = makeCtx("POST", "/api/terminal-snapshots");
    const result = await handleTerminalSnapshotsRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 200 with snapshots for GET", async () => {
    const runtime = makeRuntime();
    runtime.listTerminalSnapshots.mockReturnValue([{ terminalId: "terminal-1" }]);
    const ctx = makeCtx("GET", "/api/terminal-snapshots");
    await handleTerminalSnapshotsRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual([{ terminalId: "terminal-1" }]);
  });
});

// ---------------------------------------------------------------------------
// handleTerminalsCollectionRoute
// ---------------------------------------------------------------------------
describe("handleTerminalsCollectionRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("POST", "/api/terminal-snapshots");
    const result = await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for GET", async () => {
    const ctx = makeCtx("GET", "/api/terminals");
    const result = await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 201 with snapshot for POST (no body)", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals");
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.terminalId).toBe("terminal-1");
  });

  it("returns 400 for invalid name type", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ name: 42 }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "Terminal name must be a string." });
  });

  it("returns 400 for empty terminal name", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ name: "" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "Terminal name cannot be empty." });
  });

  it("returns 400 for invalid workspaceMode", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ workspaceMode: "isolated" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for invalid agentProvider", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ agentProvider: "openai" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for invalid color", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ color: "not-a-hex" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for invalid model", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ model: "gpt-4" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for invalid effort", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ effort: "extreme" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for invalid nameOrigin", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ nameOrigin: "custom" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for invalid tentacleId format", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ tentacleId: "has spaces!" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.error).toContain("tentacleId");
  });

  it("returns 400 for invalid worktreeId format", async () => {
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ worktreeId: "invalid id!" }));
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.error).toContain("worktreeId");
  });

  it("returns 400 when initialPrompt exceeds max length", async () => {
    const ctx = makeCtx(
      "POST",
      "/api/terminals",
      JSON.stringify({ initialPrompt: "x".repeat(65_537) }),
    );
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "initialPrompt exceeds maximum allowed length." });
  });

  it("returns 400 when initialInputDraft exceeds max length", async () => {
    const ctx = makeCtx(
      "POST",
      "/api/terminals",
      JSON.stringify({ initialInputDraft: "x".repeat(65_537) }),
    );
    await handleTerminalsCollectionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "initialInputDraft exceeds maximum allowed length." });
  });

  it("passes initialPrompt in response payload", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx(
      "POST",
      "/api/terminals",
      JSON.stringify({ initialPrompt: "Start working." }),
    );
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(201);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.initialPrompt).toBe("Start working.");
  });

  it("returns 400 when RuntimeInputError thrown", async () => {
    const runtime = makeRuntime();
    runtime.createTerminal.mockImplementation(() => {
      throw new RuntimeInputError("Terminal limit reached");
    });
    const ctx = makeCtx("POST", "/api/terminals");
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "Terminal limit reached" });
  });

  it("sets isGroupLeader when flag is true", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("POST", "/api/terminals", JSON.stringify({ isGroupLeader: true }));
    await handleTerminalsCollectionRoute(ctx, makeDeps(runtime));
    expect(runtime.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ isGroupLeader: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleTerminalScrollbackRoute
// ---------------------------------------------------------------------------
describe("handleTerminalScrollbackRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("GET", "/api/terminals/t1/input");
    const result = await handleTerminalScrollbackRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST", async () => {
    const ctx = makeCtx("POST", "/api/terminals/t1/scrollback");
    await handleTerminalScrollbackRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 404 when terminal not found", async () => {
    const runtime = makeRuntime();
    runtime.getScrollback.mockReturnValue(null);
    const ctx = makeCtx("GET", "/api/terminals/missing/scrollback");
    await handleTerminalScrollbackRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 with scrollback text for GET", async () => {
    const runtime = makeRuntime();
    runtime.getScrollback.mockReturnValue("some output text");
    const ctx = makeCtx("GET", "/api/terminals/t1/scrollback");
    await handleTerminalScrollbackRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getContentType()).toContain("text/plain");
    expect(ctx.getBody()).toBe("some output text");
  });
});

// ---------------------------------------------------------------------------
// handleTerminalItemRoute — PATCH and DELETE
// ---------------------------------------------------------------------------
describe("handleTerminalItemRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("PATCH", "/api/terminals/t1/scrollback");
    const result = await handleTerminalItemRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for GET", async () => {
    const ctx = makeCtx("GET", "/api/terminals/t1");
    await handleTerminalItemRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 204 for DELETE", async () => {
    const runtime = makeRuntime();
    const ctx = makeCtx("DELETE", "/api/terminals/t1");
    const result = await handleTerminalItemRoute(ctx, makeDeps(runtime));
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(204);
    expect(runtime.deleteTerminal).toHaveBeenCalledWith("t1");
  });

  it("returns 409 when RuntimeInputError on delete", async () => {
    const runtime = makeRuntime();
    runtime.deleteTerminal.mockImplementation(() => {
      throw new RuntimeInputError("Terminal is busy");
    });
    const ctx = makeCtx("DELETE", "/api/terminals/t1");
    await handleTerminalItemRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(409);
    expect(ctx.getBody()).toEqual({ error: "Terminal is busy" });
  });

  it("returns 400 for PATCH without name", async () => {
    const ctx = makeCtx("PATCH", "/api/terminals/t1", JSON.stringify({}));
    await handleTerminalItemRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "Terminal name is required." });
  });

  it("returns 400 for PATCH with invalid name type", async () => {
    const ctx = makeCtx("PATCH", "/api/terminals/t1", JSON.stringify({ name: 42 }));
    await handleTerminalItemRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 404 when terminal not found for PATCH rename", async () => {
    const runtime = makeRuntime();
    runtime.renameTerminal.mockReturnValue(null);
    const ctx = makeCtx("PATCH", "/api/terminals/missing", JSON.stringify({ name: "new-name" }));
    await handleTerminalItemRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 with snapshot on successful rename", async () => {
    const runtime = makeRuntime();
    runtime.renameTerminal.mockReturnValue({ tentacleId: "t1", tentacleName: "new-name" });
    const ctx = makeCtx("PATCH", "/api/terminals/t1", JSON.stringify({ name: "new-name" }));
    await handleTerminalItemRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(runtime.renameTerminal).toHaveBeenCalledWith("t1", "new-name");
  });
});

// ---------------------------------------------------------------------------
// handleTerminalActionRoute — stop/kill
// ---------------------------------------------------------------------------
describe("handleTerminalActionRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("POST", "/api/terminals/t1/input");
    const result = await handleTerminalActionRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for GET on stop", async () => {
    const ctx = makeCtx("GET", "/api/terminals/t1/stop");
    await handleTerminalActionRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 404 when terminal not found for stop", async () => {
    const runtime = makeRuntime();
    runtime.stopTerminal.mockReturnValue(null);
    const ctx = makeCtx("POST", "/api/terminals/missing/stop");
    await handleTerminalActionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 on successful stop", async () => {
    const runtime = makeRuntime();
    runtime.stopTerminal.mockReturnValue({ terminalId: "t1", state: "stopped" });
    const ctx = makeCtx("POST", "/api/terminals/t1/stop");
    await handleTerminalActionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(runtime.stopTerminal).toHaveBeenCalledWith("t1");
  });

  it("returns 200 on successful kill", async () => {
    const runtime = makeRuntime();
    runtime.killTerminal.mockReturnValue({ terminalId: "t1", state: "killed" });
    const ctx = makeCtx("POST", "/api/terminals/t1/kill");
    await handleTerminalActionRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(runtime.killTerminal).toHaveBeenCalledWith("t1");
  });
});

// ---------------------------------------------------------------------------
// handleTerminalInputRoute
// ---------------------------------------------------------------------------
describe("handleTerminalInputRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("POST", "/api/terminals/t1/scrollback");
    const result = await handleTerminalInputRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for GET", async () => {
    const ctx = makeCtx("GET", "/api/terminals/t1/input");
    await handleTerminalInputRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 400 when data field is missing", async () => {
    const ctx = makeCtx("POST", "/api/terminals/t1/input", JSON.stringify({}));
    await handleTerminalInputRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
    expect(ctx.getBody()).toEqual({ error: "data is required" });
  });

  it("returns 400 when data field is whitespace only", async () => {
    const ctx = makeCtx("POST", "/api/terminals/t1/input", JSON.stringify({ data: "   " }));
    await handleTerminalInputRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 404 when terminal not active", async () => {
    const runtime = makeRuntime();
    runtime.writeInput.mockReturnValue(false);
    const ctx = makeCtx(
      "POST",
      "/api/terminals/missing/input",
      JSON.stringify({ data: "hello\n" }),
    );
    await handleTerminalInputRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 on successful input write", async () => {
    const runtime = makeRuntime();
    runtime.writeInput.mockReturnValue(true);
    const ctx = makeCtx("POST", "/api/terminals/t1/input", JSON.stringify({ data: "hello\n" }));
    await handleTerminalInputRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual({ ok: true });
    expect(runtime.writeInput).toHaveBeenCalledWith("t1", "hello\n");
  });
});

// ---------------------------------------------------------------------------
// handleTerminalPruneRoute
// ---------------------------------------------------------------------------
describe("handleTerminalPruneRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("POST", "/api/terminals");
    const result = await handleTerminalPruneRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for GET", async () => {
    const ctx = makeCtx("GET", "/api/terminals/prune");
    await handleTerminalPruneRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 200 with pruned ids on POST", async () => {
    const runtime = makeRuntime();
    runtime.pruneTerminals.mockReturnValue(["terminal-2", "terminal-3"]);
    const ctx = makeCtx("POST", "/api/terminals/prune");
    await handleTerminalPruneRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toEqual({ prunedTerminalIds: ["terminal-2", "terminal-3"] });
  });

  it("returns 200 with empty list when nothing pruned", async () => {
    const runtime = makeRuntime();
    runtime.pruneTerminals.mockReturnValue([]);
    const ctx = makeCtx("POST", "/api/terminals/prune");
    await handleTerminalPruneRoute(ctx, makeDeps(runtime));
    expect(ctx.getBody()).toEqual({ prunedTerminalIds: [] });
  });
});
