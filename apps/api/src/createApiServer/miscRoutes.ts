import type { ApiRouteHandler } from "./routeHelpers";
import {
  readJsonBodyOrWriteError,
  writeJson,
  writeMethodNotAllowed,
} from "./routeHelpers";
import { parseUiStatePatch } from "./uiStateParsers";

export const handleUiStateRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/ui-state") {
    return false;
  }

  if (request.method === "GET") {
    const payload = runtime.readUiState();
    writeJson(response, 200, payload, corsOrigin);
    return true;
  }

  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const uiStatePatch = parseUiStatePatch(bodyReadResult.payload);
  if (uiStatePatch.error || !uiStatePatch.patch) {
    writeJson(
      response,
      400,
      { error: uiStatePatch.error ?? "Invalid UI state patch." },
      corsOrigin,
    );
    return true;
  }

  const payload = runtime.patchUiState(uiStatePatch.patch);
  writeJson(response, 200, payload, corsOrigin);
  return true;
};
