import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleMetricsAggregateRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { metricsStore },
) => {
  if (requestUrl.pathname !== "/api/metrics/aggregate") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const payload = metricsStore.readAggregate();
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleMetricsHeatmapRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { metricsStore },
) => {
  if (requestUrl.pathname !== "/api/metrics/heatmap") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const rawDays = requestUrl.searchParams.get("days");
  const days = rawDays ? Math.max(1, Math.min(90, Number.parseInt(rawDays, 10) || 7)) : 7;
  const payload = metricsStore.readHeatmap(days);
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleMetricsSummariesRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { metricsStore },
) => {
  if (!requestUrl.pathname.startsWith("/api/metrics/summaries")) {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const pathParts = requestUrl.pathname.split("/");
  // /api/metrics/summaries/{terminalId}
  const terminalId = pathParts[4] ? decodeURIComponent(pathParts[4]) : undefined;

  if (terminalId) {
    const summary = metricsStore.readSummaryById(terminalId);
    writeJson(response, summary ? 200 : 404, summary ?? { error: "Not found" }, corsOrigin);
    return true;
  }

  const opts: Parameters<typeof metricsStore.readSummaries>[0] = {};
  const provider = requestUrl.searchParams.get("provider");
  const tentacleId = requestUrl.searchParams.get("tentacleId");
  const since = requestUrl.searchParams.get("since");
  if (provider) opts.provider = provider;
  if (tentacleId) opts.tentacleId = tentacleId;
  if (since) opts.since = since;
  const payload = metricsStore.readSummaries(opts);
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleMetricsEventsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { metricsStore },
) => {
  const match = requestUrl.pathname.match(/^\/api\/metrics\/events\/(.+)$/);
  if (!match) {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(match[1] ?? "");
  const payload = metricsStore.readEvents(terminalId);
  writeJson(response, 200, payload, corsOrigin);
  return true;
};
