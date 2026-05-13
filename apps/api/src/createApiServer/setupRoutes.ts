import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handleSetupRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
) => {
  if (requestUrl.pathname !== "/api/setup") {
    return false;
  }
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }
  writeJson(response, 200, { complete: true }, corsOrigin);
  return true;
};

export const handleSetupStepRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
) => {
  if (!requestUrl.pathname.startsWith("/api/setup/")) {
    return false;
  }
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }
  writeJson(response, 200, { ok: true }, corsOrigin);
  return true;
};
