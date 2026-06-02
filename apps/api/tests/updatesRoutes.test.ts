import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the updates module BEFORE importing route handlers
vi.mock("../src/updates", () => ({
  detectInstallation: vi.fn(() => ({
    source: "npm",
    packageRoot: "/pkg",
    currentVersion: "1.0.0",
  })),
  checkForUpdates: vi.fn(),
  applyUpdate: vi.fn(),
  scheduleSelfRestart: vi.fn(),
}));

import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";
import {
  handleUpdatesApplyRoute,
  handleUpdatesRestartRoute,
  handleUpdatesStatusRoute,
} from "../src/createApiServer/updatesRoutes";
import {
  applyUpdate,
  checkForUpdates,
  detectInstallation,
  scheduleSelfRestart,
} from "../src/updates";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const makeResponse = () => {
  const res = new EventEmitter() as ServerResponse;
  const chunks: string[] = [];
  let statusCode = 0;

  res.writeHead = vi.fn(((code: number) => {
    statusCode = code;
    return res;
  }) as typeof res.writeHead) as unknown as typeof res.writeHead;

  res.end = vi.fn(((data?: string) => {
    if (data) chunks.push(data);
    // Emit "finish" asynchronously so that any on("finish", ...) registered
    // after end() can still receive the event (matches how Node.js behaves).
    process.nextTick(() => res.emit("finish"));
    return res;
  }) as typeof res.end) as unknown as typeof res.end;

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => JSON.parse(chunks.join("")) as unknown,
  };
};

const makeRequest = (method = "GET"): IncomingMessage => {
  const stream = Readable.from([]);
  return Object.assign(stream, {
    method,
    headers: {} as IncomingMessage["headers"],
    url: "/",
  }) as unknown as IncomingMessage;
};

const makeCtx = (
  method: string,
  pathname: string,
): RouteHandlerContext & {
  res: ServerResponse;
  getStatus: () => number;
  getBody: () => unknown;
} => {
  const { res, getStatus, getBody } = makeResponse();
  return {
    request: makeRequest(method),
    response: res,
    requestUrl: new URL(`http://localhost${pathname}`),
    corsOrigin: null,
    res,
    getStatus,
    getBody,
  };
};

const deps = {} as unknown as RouteHandlerDependencies;

// ---------------------------------------------------------------------------
// handleUpdatesStatusRoute
// ---------------------------------------------------------------------------
describe("handleUpdatesStatusRoute", () => {
  beforeEach(() => {
    vi.mocked(detectInstallation).mockReturnValue({
      source: "npm",
      packageRoot: "/pkg",
      currentVersion: "1.0.0",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("GET", "/api/updates/apply");
    const result = await handleUpdatesStatusRoute(ctx, deps);
    expect(result).toBe(false);
  });

  it("returns 405 for POST method", async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      source: "npm",
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      updateAvailable: false,
      details: null,
      error: null,
    });
    const ctx = makeCtx("POST", "/api/updates/status");
    const result = await handleUpdatesStatusRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 200 with update status for GET", async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      source: "npm",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateAvailable: true,
      details: "New version available",
      error: null,
    });
    const ctx = makeCtx("GET", "/api/updates/status");
    const result = await handleUpdatesStatusRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(200);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.updateAvailable).toBe(true);
    expect(body.latestVersion).toBe("1.1.0");
    expect(body.currentVersion).toBe("1.0.0");
    expect(body.source).toBe("npm");
  });

  it("includes error field in response when check fails", async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      source: "npm",
      currentVersion: "1.0.0",
      latestVersion: null,
      updateAvailable: false,
      details: null,
      error: "Network timeout",
    });
    const ctx = makeCtx("GET", "/api/updates/status");
    await handleUpdatesStatusRoute(ctx, deps);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.error).toBe("Network timeout");
  });

  it("passes abort signal from timeout controller to checkForUpdates", async () => {
    vi.mocked(checkForUpdates).mockResolvedValue({
      source: "npm",
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      updateAvailable: false,
      details: null,
      error: null,
    });
    const ctx = makeCtx("GET", "/api/updates/status");
    await handleUpdatesStatusRoute(ctx, deps);
    expect(checkForUpdates).toHaveBeenCalledWith(
      expect.objectContaining({ source: "npm" }),
      expect.any(AbortSignal),
    );
  });
});

// ---------------------------------------------------------------------------
// handleUpdatesApplyRoute
// ---------------------------------------------------------------------------
describe("handleUpdatesApplyRoute", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("POST", "/api/updates/status");
    const result = await handleUpdatesApplyRoute(ctx, deps);
    expect(result).toBe(false);
  });

  it("returns 405 for GET method", async () => {
    const ctx = makeCtx("GET", "/api/updates/apply");
    const result = await handleUpdatesApplyRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 200 when update succeeds", async () => {
    vi.mocked(applyUpdate).mockResolvedValue({
      ok: true,
      source: "npm",
      output: "Updated to 1.1.0",
      error: null,
    });
    const ctx = makeCtx("POST", "/api/updates/apply");
    await handleUpdatesApplyRoute(ctx, deps);
    expect(ctx.getStatus()).toBe(200);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.output).toBe("Updated to 1.1.0");
  });

  it("returns 500 when update fails", async () => {
    vi.mocked(applyUpdate).mockResolvedValue({
      ok: false,
      source: "npm",
      output: "",
      error: "Permission denied",
    });
    const ctx = makeCtx("POST", "/api/updates/apply");
    await handleUpdatesApplyRoute(ctx, deps);
    expect(ctx.getStatus()).toBe(500);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Permission denied");
  });
});

// ---------------------------------------------------------------------------
// handleUpdatesRestartRoute
// ---------------------------------------------------------------------------
describe("handleUpdatesRestartRoute", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for non-matching pathname", async () => {
    const ctx = makeCtx("POST", "/api/updates/apply");
    const result = await handleUpdatesRestartRoute(ctx, deps);
    expect(result).toBe(false);
  });

  it("returns 405 for GET method", async () => {
    const ctx = makeCtx("GET", "/api/updates/restart");
    const result = await handleUpdatesRestartRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.getStatus()).toBe(405);
  });

  it("returns 202 with restartingIn for POST", async () => {
    const ctx = makeCtx("POST", "/api/updates/restart");
    await handleUpdatesRestartRoute(ctx, deps);
    expect(ctx.getStatus()).toBe(202);
    const body = ctx.getBody() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.restartingIn).toBe(500);
  });

  it("calls scheduleSelfRestart after response finish event", async () => {
    const { res, getStatus } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("POST"),
      response: res,
      requestUrl: new URL("http://localhost/api/updates/restart"),
      corsOrigin: null,
    };
    await handleUpdatesRestartRoute(ctx, deps);
    expect(getStatus()).toBe(202);
    // Let the nextTick flush so the finish event fires and scheduleSelfRestart is called
    await new Promise((resolve) => process.nextTick(resolve));
    expect(scheduleSelfRestart).toHaveBeenCalled();
  });
});
