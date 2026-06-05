import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";
import { handleTentaclesCollectionRoute } from "../src/createApiServer/tentacleRoutes";

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

const makeCtx = (method: string, pathname: string, body = "") => {
  const { res, getStatus, getBody } = makeResponse();
  return {
    ctx: {
      request: makeRequest(method, body),
      response: res,
      requestUrl: new URL(`http://localhost${pathname}`),
      corsOrigin: null,
    } satisfies RouteHandlerContext,
    getStatus,
    getBody,
  };
};

const makeRuntime = () => ({
  listTentacles: vi.fn(() => [] as unknown[]),
  createTentacle: vi.fn((input: { name: string; description?: string; id?: string }) => ({
    tentacleId: input.id ?? input.name,
    name: input.name,
    description: input.description ?? "",
  })),
});

const makeDeps = (runtime = makeRuntime()): RouteHandlerDependencies =>
  ({ runtime }) as unknown as RouteHandlerDependencies;

describe("handleTentaclesCollectionRoute", () => {
  it("returns false for the per-tentacle git path (no collision)", async () => {
    const { ctx } = makeCtx("GET", "/api/tentacles/docs/git/status");
    expect(await handleTentaclesCollectionRoute(ctx, makeDeps())).toBe(false);
  });

  it("GET lists tentacles", async () => {
    const runtime = makeRuntime();
    runtime.listTentacles.mockReturnValueOnce([
      { tentacleId: "api", name: "API", description: "x" },
    ]);
    const { ctx, getStatus, getBody } = makeCtx("GET", "/api/tentacles");

    expect(await handleTentaclesCollectionRoute(ctx, makeDeps(runtime))).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getBody()).toHaveLength(1);
  });

  it("POST creates a tentacle and returns 201", async () => {
    const runtime = makeRuntime();
    const { ctx, getStatus, getBody } = makeCtx(
      "POST",
      "/api/tentacles",
      JSON.stringify({ name: "api-backend", description: "API runtime" }),
    );

    expect(await handleTentaclesCollectionRoute(ctx, makeDeps(runtime))).toBe(true);
    expect(getStatus()).toBe(201);
    expect(runtime.createTentacle).toHaveBeenCalledWith({
      name: "api-backend",
      description: "API runtime",
    });
    expect((getBody() as { tentacleId: string }).tentacleId).toBe("api-backend");
  });

  it("POST passes an explicit tentacleId through as id", async () => {
    const runtime = makeRuntime();
    const { ctx } = makeCtx(
      "POST",
      "/api/tentacles",
      JSON.stringify({ name: "X", tentacleId: "custom-1" }),
    );

    await handleTentaclesCollectionRoute(ctx, makeDeps(runtime));

    expect(runtime.createTentacle).toHaveBeenCalledWith({
      name: "X",
      description: "",
      id: "custom-1",
    });
  });

  it("POST returns 400 when name is missing", async () => {
    const { ctx, getStatus } = makeCtx(
      "POST",
      "/api/tentacles",
      JSON.stringify({ description: "no name" }),
    );

    await handleTentaclesCollectionRoute(ctx, makeDeps());

    expect(getStatus()).toBe(400);
  });

  it("rejects unsupported methods with 405", async () => {
    const { ctx, getStatus } = makeCtx("DELETE", "/api/tentacles");
    await handleTentaclesCollectionRoute(ctx, makeDeps());
    expect(getStatus()).toBe(405);
  });
});
