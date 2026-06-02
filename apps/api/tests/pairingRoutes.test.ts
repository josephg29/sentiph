import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";

import { createPairingRoutes } from "../src/createApiServer/pairingRoutes";
import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";
import { createPairingService } from "../src/pairing";

const makeResponse = () => {
  const chunks: string[] = [];
  let statusCode = 0;
  const res = new EventEmitter() as ServerResponse;
  res.writeHead = ((code: number) => {
    statusCode = code;
    return res;
  }) as unknown as typeof res.writeHead;
  res.end = ((data?: string) => {
    if (data) chunks.push(data);
    return res;
  }) as unknown as typeof res.end;
  return {
    res,
    getStatus: () => statusCode,
    getBody: () => {
      const raw = chunks.join("");
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return raw;
      }
    },
  };
};

const makeCtx = (
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
): RouteHandlerContext & { getStatus: () => number; getBody: () => unknown } => {
  const { res, getStatus, getBody } = makeResponse();
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.headers = headers;
  req.url = pathname;
  return {
    request: req,
    response: res,
    requestUrl: new URL(`http://localhost${pathname}`),
    corsOrigin: null,
    getStatus,
    getBody,
  };
};

const deps = {} as unknown as RouteHandlerDependencies;

const firstRoute = (routes: ReturnType<typeof createPairingRoutes>) => {
  const [route] = routes;
  if (!route) {
    throw new Error("expected a pairing route");
  }
  return route;
};

describe("createPairingRoutes", () => {
  it("returns false for non-matching pathname", async () => {
    const route = firstRoute(createPairingRoutes(createPairingService(), true));
    const ctx = makeCtx("GET", "/api/other");
    expect(await route(ctx, deps)).toBe(false);
  });

  it("returns 405 for non-GET methods", async () => {
    const route = firstRoute(createPairingRoutes(createPairingService(), true));
    const ctx = makeCtx("POST", "/api/pairing", { host: "localhost:8787" });
    expect(await route(ctx, deps)).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("reports requiresAuth=false in local-only mode and exposes the token to loopback", async () => {
    const service = createPairingService();
    const route = firstRoute(createPairingRoutes(service, false));
    const ctx = makeCtx("GET", "/api/pairing", { host: "127.0.0.1:8787" });
    await route(ctx, deps);
    expect(ctx.getStatus()).toBe(200);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.requiresAuth).toBe(false);
    expect(body.authenticated).toBe(true); // loopback is always authorized
    expect(body.token).toBe(service.getToken());
  });

  it("exposes the token to a loopback caller in remote mode", async () => {
    const service = createPairingService();
    const route = firstRoute(createPairingRoutes(service, true));
    const ctx = makeCtx("GET", "/api/pairing", { host: "localhost:8787" });
    await route(ctx, deps);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.requiresAuth).toBe(true);
    expect(body.token).toBe(service.getToken());
  });

  it("never returns the token to a non-loopback caller", async () => {
    const service = createPairingService();
    const route = firstRoute(createPairingRoutes(service, true));
    const ctx = makeCtx("GET", "/api/pairing", {
      host: "my-server.example:8787",
      authorization: `Bearer ${service.getToken()}`,
    });
    await route(ctx, deps);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.requiresAuth).toBe(true);
    expect(body.authenticated).toBe(true); // valid bearer token
    expect(body.token).toBeUndefined();
  });

  it("reports authenticated=false for a non-loopback caller without a valid token", async () => {
    const service = createPairingService();
    const route = firstRoute(createPairingRoutes(service, true));
    const ctx = makeCtx("GET", "/api/pairing", {
      host: "my-server.example:8787",
      authorization: "Bearer wrong-token",
    });
    await route(ctx, deps);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.authenticated).toBe(false);
    expect(body.token).toBeUndefined();
  });
});
