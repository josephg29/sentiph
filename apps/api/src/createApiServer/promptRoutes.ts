import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handlePromptItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
) => {
  if (!requestUrl.pathname.startsWith("/api/prompts/")) {
    return false;
  }
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }
  writeJson(response, 404, { error: "Not found" }, corsOrigin);
  return true;
};
