import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import {
  handleTentacleGitPullRequestRoute,
  handleTentacleGitRoute,
} from "../src/createApiServer/gitRoutes";
import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";
import { RuntimeInputError } from "../src/terminalRuntime";

// ---------------------------------------------------------------------------
// Helpers
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
    getBody: () => JSON.parse(chunks.join("")) as unknown,
  };
};

/**
 * Create a minimal IncomingMessage-like object backed by a Readable stream
 * so that readJsonBody's `for await (const chunk of request)` works correctly.
 */
const makeRequest = (method: string, body = ""): IncomingMessage => {
  const stream = body ? Readable.from([Buffer.from(body)]) : Readable.from([]);

  const req = Object.assign(stream, {
    method,
    headers: {} as IncomingMessage["headers"],
    url: "/",
  }) as unknown as IncomingMessage;

  return req;
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
  readTentacleGitStatus: vi.fn((_id: string) => null as unknown),
  commitTentacleWorktree: vi.fn((_id: string, _msg: string) => null as unknown),
  pushTentacleWorktree: vi.fn((_id: string) => null as unknown),
  syncTentacleWorktree: vi.fn((_id: string, _ref?: string) => null as unknown),
  readTentaclePullRequest: vi.fn((_id: string) => null as unknown),
  createTentaclePullRequest: vi.fn((_id: string, _opts: unknown) => null as unknown),
  mergeTentaclePullRequest: vi.fn((_id: string) => null as unknown),
});

const makeDeps = (runtime = makeRuntime()): RouteHandlerDependencies =>
  ({ runtime }) as unknown as RouteHandlerDependencies;

// ---------------------------------------------------------------------------
// handleTentacleGitRoute — status action
// ---------------------------------------------------------------------------
describe("handleTentacleGitRoute – status", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("GET", "/api/terminals/t1/git/status");
    const result = await handleTentacleGitRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST on status", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/status");
    const result = await handleTentacleGitRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 404 when tentacle not found for status", async () => {
    const runtime = makeRuntime();
    runtime.readTentacleGitStatus.mockReturnValue(null);
    const ctx = makeCtx("GET", "/api/tentacles/missing/git/status");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
    expect(ctx.getBody()).toEqual({ error: "Tentacle not found." });
  });

  it("returns 200 with status payload when tentacle found", async () => {
    const runtime = makeRuntime();
    runtime.readTentacleGitStatus.mockReturnValue({
      branchName: "feature/test",
      isDirty: false,
      aheadCount: 0,
    });
    const ctx = makeCtx("GET", "/api/tentacles/my-tentacle/git/status");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toMatchObject({ branchName: "feature/test" });
    expect(runtime.readTentacleGitStatus).toHaveBeenCalledWith("my-tentacle");
  });

  it("URL-decodes tentacleId in status", async () => {
    const runtime = makeRuntime();
    runtime.readTentacleGitStatus.mockReturnValue({ branchName: "main" });
    const ctx = makeCtx("GET", "/api/tentacles/my%20tentacle/git/status");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(runtime.readTentacleGitStatus).toHaveBeenCalledWith("my tentacle");
  });
});

// ---------------------------------------------------------------------------
// handleTentacleGitRoute — commit action
// ---------------------------------------------------------------------------
describe("handleTentacleGitRoute – commit", () => {
  it("returns 405 for GET on commit", async () => {
    const ctx = makeCtx("GET", "/api/tentacles/t1/git/commit");
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 400 for missing message in commit body", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/commit", JSON.stringify({}));
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for empty commit message", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/commit", JSON.stringify({ message: "   " }));
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for non-object body (parseTentacleCommitMessage)", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/commit", '"just a string"');
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 404 when tentacle not found for commit", async () => {
    const runtime = makeRuntime();
    runtime.commitTentacleWorktree.mockReturnValue(null);
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/missing/git/commit",
      JSON.stringify({ message: "my commit" }),
    );
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 on successful commit", async () => {
    const runtime = makeRuntime();
    runtime.commitTentacleWorktree.mockReturnValue({ branchName: "main", aheadCount: 1 });
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/t1/git/commit",
      JSON.stringify({ message: "add feature" }),
    );
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(runtime.commitTentacleWorktree).toHaveBeenCalledWith("t1", "add feature");
  });

  it("returns 409 when RuntimeInputError thrown on commit", async () => {
    const runtime = makeRuntime();
    runtime.commitTentacleWorktree.mockImplementation(() => {
      throw new RuntimeInputError("Nothing to commit");
    });
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/t1/git/commit",
      JSON.stringify({ message: "my commit" }),
    );
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(409);
    expect(ctx.getBody()).toEqual({ error: "Nothing to commit" });
  });
});

// ---------------------------------------------------------------------------
// handleTentacleGitRoute — push action
// ---------------------------------------------------------------------------
describe("handleTentacleGitRoute – push", () => {
  it("returns 405 for GET on push", async () => {
    const ctx = makeCtx("GET", "/api/tentacles/t1/git/push");
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 404 when tentacle not found for push", async () => {
    const runtime = makeRuntime();
    runtime.pushTentacleWorktree.mockReturnValue(null);
    const ctx = makeCtx("POST", "/api/tentacles/missing/git/push");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 on successful push", async () => {
    const runtime = makeRuntime();
    runtime.pushTentacleWorktree.mockReturnValue({ aheadCount: 0 });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/push");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(runtime.pushTentacleWorktree).toHaveBeenCalledWith("t1");
  });

  it("returns 409 when RuntimeInputError on push", async () => {
    const runtime = makeRuntime();
    runtime.pushTentacleWorktree.mockImplementation(() => {
      throw new RuntimeInputError("Push rejected");
    });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/push");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// handleTentacleGitRoute — sync action
// ---------------------------------------------------------------------------
describe("handleTentacleGitRoute – sync", () => {
  it("returns 405 for GET on sync", async () => {
    const ctx = makeCtx("GET", "/api/tentacles/t1/git/sync");
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 400 for invalid baseRef type", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/sync", JSON.stringify({ baseRef: 123 }));
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for empty baseRef", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/sync", JSON.stringify({ baseRef: "   " }));
    await handleTentacleGitRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 404 when tentacle not found for sync", async () => {
    const runtime = makeRuntime();
    runtime.syncTentacleWorktree.mockReturnValue(null);
    const ctx = makeCtx("POST", "/api/tentacles/missing/git/sync");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("syncs without baseRef when body is empty", async () => {
    const runtime = makeRuntime();
    runtime.syncTentacleWorktree.mockReturnValue({ behindCount: 0 });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/sync");
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(runtime.syncTentacleWorktree).toHaveBeenCalledWith("t1", undefined);
  });

  it("syncs with provided baseRef", async () => {
    const runtime = makeRuntime();
    runtime.syncTentacleWorktree.mockReturnValue({ behindCount: 0 });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/sync", JSON.stringify({ baseRef: "main" }));
    await handleTentacleGitRoute(ctx, makeDeps(runtime));
    expect(runtime.syncTentacleWorktree).toHaveBeenCalledWith("t1", "main");
  });
});

// ---------------------------------------------------------------------------
// handleTentacleGitPullRequestRoute — GET/POST on /pr
// ---------------------------------------------------------------------------
describe("handleTentacleGitPullRequestRoute – pr", () => {
  it("returns false when pathname does not match any PR pattern", async () => {
    const ctx = makeCtx("GET", "/api/tentacles/t1/git/status");
    const result = await handleTentacleGitPullRequestRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for PATCH on PR", async () => {
    const ctx = makeCtx("PATCH", "/api/tentacles/t1/git/pr");
    const result = await handleTentacleGitPullRequestRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 404 for GET when tentacle not found", async () => {
    const runtime = makeRuntime();
    runtime.readTentaclePullRequest.mockReturnValue(null);
    const ctx = makeCtx("GET", "/api/tentacles/missing/git/pr");
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 with PR data for GET", async () => {
    const runtime = makeRuntime();
    runtime.readTentaclePullRequest.mockReturnValue({
      number: 42,
      url: "https://github.com/pr/42",
    });
    const ctx = makeCtx("GET", "/api/tentacles/t1/git/pr");
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toMatchObject({ number: 42 });
  });

  it("returns 400 for POST with missing title", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/pr", JSON.stringify({ body: "desc" }));
    await handleTentacleGitPullRequestRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for POST with empty title", async () => {
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/pr", JSON.stringify({ title: "   " }));
    await handleTentacleGitPullRequestRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 400 for non-string PR body field", async () => {
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/t1/git/pr",
      JSON.stringify({ title: "My PR", body: 123 }),
    );
    await handleTentacleGitPullRequestRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(400);
  });

  it("returns 404 when tentacle not found for POST create PR", async () => {
    const runtime = makeRuntime();
    runtime.createTentaclePullRequest.mockReturnValue(null);
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/missing/git/pr",
      JSON.stringify({ title: "My PR" }),
    );
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 on successful PR creation", async () => {
    const runtime = makeRuntime();
    runtime.createTentaclePullRequest.mockReturnValue({ number: 5, url: "https://gh.com/5" });
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/t1/git/pr",
      JSON.stringify({ title: "Feature PR", body: "Some details" }),
    );
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toMatchObject({ number: 5 });
    expect(runtime.createTentaclePullRequest).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ title: "Feature PR", body: "Some details" }),
    );
  });

  it("returns 409 when RuntimeInputError on create PR", async () => {
    const runtime = makeRuntime();
    runtime.createTentaclePullRequest.mockImplementation(() => {
      throw new RuntimeInputError("PR already exists");
    });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/pr", JSON.stringify({ title: "My PR" }));
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(409);
  });

  it("creates PR without optional body field", async () => {
    const runtime = makeRuntime();
    runtime.createTentaclePullRequest.mockReturnValue({ number: 7 });
    const ctx = makeCtx(
      "POST",
      "/api/tentacles/t1/git/pr",
      JSON.stringify({ title: "Minimal PR" }),
    );
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    // body is empty string, so it should NOT be passed
    expect(runtime.createTentaclePullRequest).toHaveBeenCalledWith(
      "t1",
      expect.not.objectContaining({ body: expect.anything() }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleTentacleGitPullRequestRoute — POST on /pr/merge
// ---------------------------------------------------------------------------
describe("handleTentacleGitPullRequestRoute – pr/merge", () => {
  it("returns 405 for GET on pr/merge", async () => {
    const ctx = makeCtx("GET", "/api/tentacles/t1/git/pr/merge");
    await handleTentacleGitPullRequestRoute(ctx, makeDeps());
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 404 when tentacle not found for merge", async () => {
    const runtime = makeRuntime();
    runtime.mergeTentaclePullRequest.mockReturnValue(null);
    const ctx = makeCtx("POST", "/api/tentacles/missing/git/pr/merge");
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(404);
  });

  it("returns 200 on successful merge", async () => {
    const runtime = makeRuntime();
    runtime.mergeTentaclePullRequest.mockReturnValue({ state: "MERGED" });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/pr/merge");
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(200);
    expect(ctx.getBody()).toMatchObject({ state: "MERGED" });
  });

  it("returns 409 when RuntimeInputError on merge", async () => {
    const runtime = makeRuntime();
    runtime.mergeTentaclePullRequest.mockImplementation(() => {
      throw new RuntimeInputError("Merge conflict");
    });
    const ctx = makeCtx("POST", "/api/tentacles/t1/git/pr/merge");
    await handleTentacleGitPullRequestRoute(ctx, makeDeps(runtime));
    expect(ctx.getStatus()).toBe(409);
    expect(ctx.getBody()).toEqual({ error: "Merge conflict" });
  });
});
