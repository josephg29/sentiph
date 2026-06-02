import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import {
  handleMetricsAggregateRoute,
  handleMetricsEventsRoute,
  handleMetricsHeatmapRoute,
  handleMetricsSummariesRoute,
} from "../src/createApiServer/metricsRoutes";
import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";

// ---------------------------------------------------------------------------
// Helpers to create minimal mock request/response
// ---------------------------------------------------------------------------
const makeResponse = () => {
  const res = new EventEmitter() as ServerResponse;
  const chunks: string[] = [];
  let statusCode = 0;
  let headers: Record<string, string> = {};

  res.writeHead = vi.fn(((code: number, hdrs?: Record<string, string>) => {
    statusCode = code;
    headers = { ...headers, ...(hdrs ?? {}) };
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

const makeRequest = (method = "GET"): IncomingMessage => {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.headers = {};
  return req;
};

const makeContext = (
  method: string,
  pathname: string,
  searchParams: Record<string, string> = {},
): RouteHandlerContext => {
  const url = new URL(`http://localhost${pathname}`);
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const { res } = makeResponse();
  return {
    request: makeRequest(method),
    response: res,
    requestUrl: url,
    corsOrigin: null,
  };
};

// ---------------------------------------------------------------------------
// Minimal MetricsStore mock
// ---------------------------------------------------------------------------
const makeMetricsStore = () => ({
  readAggregate: vi.fn(() => ({ totalRuns: 5 })),
  readHeatmap: vi.fn((days: number) => ({ days, buckets: [] })),
  readTerminalSummaries: vi.fn<() => unknown[]>(() => []),
  readSummaryById: vi.fn((_id: string) => null as unknown),
  readEvents: vi.fn<(_id: string) => unknown[]>((_id: string) => []),
});

const makeDeps = (store = makeMetricsStore()): RouteHandlerDependencies =>
  ({
    metricsStore: store,
  }) as unknown as RouteHandlerDependencies;

// ---------------------------------------------------------------------------
// handleMetricsAggregateRoute
// ---------------------------------------------------------------------------
describe("handleMetricsAggregateRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeContext("GET", "/api/metrics/heatmap");
    const result = await handleMetricsAggregateRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST method", async () => {
    const { res, getStatus } = makeResponse();
    const url = new URL("http://localhost/api/metrics/aggregate");
    const ctx: RouteHandlerContext = {
      request: makeRequest("POST"),
      response: res,
      requestUrl: url,
      corsOrigin: null,
    };
    const result = await handleMetricsAggregateRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(getStatus()).toBe(405);
  });

  it("returns 200 with aggregate payload for GET", async () => {
    const store = makeMetricsStore();
    store.readAggregate.mockReturnValue({ totalRuns: 10 });
    const { res, getStatus, getBody } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/aggregate"),
      corsOrigin: null,
    };
    const result = await handleMetricsAggregateRoute(ctx, makeDeps(store));
    expect(result).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ totalRuns: 10 });
  });
});

// ---------------------------------------------------------------------------
// handleMetricsHeatmapRoute
// ---------------------------------------------------------------------------
describe("handleMetricsHeatmapRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeContext("GET", "/api/metrics/aggregate");
    const result = await handleMetricsHeatmapRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for DELETE method", async () => {
    const { res, getStatus } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("DELETE"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/heatmap"),
      corsOrigin: null,
    };
    const result = await handleMetricsHeatmapRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(getStatus()).toBe(405);
  });

  it("defaults to 7 days when no query param", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/heatmap"),
      corsOrigin: null,
    };
    await handleMetricsHeatmapRoute(ctx, makeDeps(store));
    expect(store.readHeatmap).toHaveBeenCalledWith(7);
  });

  it("parses days query param", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const url = new URL("http://localhost/api/metrics/heatmap?days=30");
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: url,
      corsOrigin: null,
    };
    await handleMetricsHeatmapRoute(ctx, makeDeps(store));
    expect(store.readHeatmap).toHaveBeenCalledWith(30);
  });

  it("clamps days to minimum of 1 (days=-5)", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const url = new URL("http://localhost/api/metrics/heatmap?days=-5");
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: url,
      corsOrigin: null,
    };
    await handleMetricsHeatmapRoute(ctx, makeDeps(store));
    expect(store.readHeatmap).toHaveBeenCalledWith(1);
  });

  it("clamps days to maximum of 90", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const url = new URL("http://localhost/api/metrics/heatmap?days=200");
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: url,
      corsOrigin: null,
    };
    await handleMetricsHeatmapRoute(ctx, makeDeps(store));
    expect(store.readHeatmap).toHaveBeenCalledWith(90);
  });

  it("defaults to 7 days for non-numeric days param", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const url = new URL("http://localhost/api/metrics/heatmap?days=abc");
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: url,
      corsOrigin: null,
    };
    await handleMetricsHeatmapRoute(ctx, makeDeps(store));
    expect(store.readHeatmap).toHaveBeenCalledWith(7);
  });

  it("returns 200 with payload", async () => {
    const store = makeMetricsStore();
    store.readHeatmap.mockReturnValue({ days: 7, buckets: [] });
    const { res, getStatus, getBody } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/heatmap"),
      corsOrigin: null,
    };
    await handleMetricsHeatmapRoute(ctx, makeDeps(store));
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ days: 7, buckets: [] });
  });
});

// ---------------------------------------------------------------------------
// handleMetricsSummariesRoute
// ---------------------------------------------------------------------------
describe("handleMetricsSummariesRoute", () => {
  it("returns false for non-matching pathname", async () => {
    const ctx = makeContext("GET", "/api/metrics/events/terminal-1");
    const result = await handleMetricsSummariesRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for POST on summaries", async () => {
    const { res, getStatus } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("POST"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/summaries"),
      corsOrigin: null,
    };
    const result = await handleMetricsSummariesRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(getStatus()).toBe(405);
  });

  it("returns list of summaries for GET /api/metrics/summaries", async () => {
    const store = makeMetricsStore();
    store.readTerminalSummaries.mockReturnValue([{ terminalId: "terminal-1" }]);
    const { res, getStatus, getBody } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/summaries"),
      corsOrigin: null,
    };
    await handleMetricsSummariesRoute(ctx, makeDeps(store));
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual([{ terminalId: "terminal-1" }]);
  });

  it("passes provider, tentacleId, since query params", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const url = new URL(
      "http://localhost/api/metrics/summaries?provider=claude-code&tentacleId=docs&since=2026-01-01",
    );
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: url,
      corsOrigin: null,
    };
    await handleMetricsSummariesRoute(ctx, makeDeps(store));
    expect(store.readTerminalSummaries).toHaveBeenCalledWith({
      provider: "claude-code",
      tentacleId: "docs",
      since: "2026-01-01",
    });
  });

  it("returns 200 with summary for GET /api/metrics/summaries/{id} found", async () => {
    const store = makeMetricsStore();
    store.readSummaryById.mockReturnValue({ terminalId: "terminal-1", runs: 3 });
    const { res, getStatus, getBody } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/summaries/terminal-1"),
      corsOrigin: null,
    };
    await handleMetricsSummariesRoute(ctx, makeDeps(store));
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ terminalId: "terminal-1", runs: 3 });
  });

  it("returns 404 with error for GET /api/metrics/summaries/{id} not found", async () => {
    const store = makeMetricsStore();
    store.readSummaryById.mockReturnValue(null);
    const { res, getStatus, getBody } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/summaries/missing-terminal"),
      corsOrigin: null,
    };
    await handleMetricsSummariesRoute(ctx, makeDeps(store));
    expect(getStatus()).toBe(404);
    expect(getBody()).toEqual({ error: "Not found" });
  });

  it("URL-decodes terminalId in path", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/summaries/terminal%2Fwith%2Fslashes"),
      corsOrigin: null,
    };
    await handleMetricsSummariesRoute(ctx, makeDeps(store));
    expect(store.readSummaryById).toHaveBeenCalledWith("terminal/with/slashes");
  });
});

// ---------------------------------------------------------------------------
// handleMetricsEventsRoute
// ---------------------------------------------------------------------------
describe("handleMetricsEventsRoute", () => {
  it("returns false when pattern does not match", async () => {
    const ctx = makeContext("GET", "/api/metrics/summaries");
    const result = await handleMetricsEventsRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns false for /api/metrics/events/ without terminal id", async () => {
    // Trailing slash with empty segment won't match the regex .+
    const ctx = makeContext("GET", "/api/metrics/events/");
    // The URL API normalizes so this resolves to /api/metrics/events/
    // which won't match /^\/api\/metrics\/events\/(.+)$/
    const result = await handleMetricsEventsRoute(ctx, makeDeps());
    expect(result).toBe(false);
  });

  it("returns 405 for DELETE on events", async () => {
    const { res, getStatus } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("DELETE"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/events/terminal-1"),
      corsOrigin: null,
    };
    const result = await handleMetricsEventsRoute(ctx, makeDeps());
    expect(result).toBe(true);
    expect(getStatus()).toBe(405);
  });

  it("returns 200 with events for GET", async () => {
    const store = makeMetricsStore();
    store.readEvents.mockReturnValue([{ type: "run_start" }]);
    const { res, getStatus, getBody } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/events/terminal-1"),
      corsOrigin: null,
    };
    await handleMetricsEventsRoute(ctx, makeDeps(store));
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual([{ type: "run_start" }]);
    expect(store.readEvents).toHaveBeenCalledWith("terminal-1");
  });

  it("URL-decodes terminalId in path", async () => {
    const store = makeMetricsStore();
    const { res } = makeResponse();
    const ctx: RouteHandlerContext = {
      request: makeRequest("GET"),
      response: res,
      requestUrl: new URL("http://localhost/api/metrics/events/my%20terminal"),
      corsOrigin: null,
    };
    await handleMetricsEventsRoute(ctx, makeDeps(store));
    expect(store.readEvents).toHaveBeenCalledWith("my terminal");
  });
});
