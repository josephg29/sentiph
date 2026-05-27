import {
  applyUpdate,
  checkForUpdates,
  detectInstallation,
  scheduleSelfRestart,
} from "../updates";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

const CHECK_TIMEOUT_MS = 15_000;

export const handleUpdatesStatusRoute: ApiRouteHandler = async ({
  request,
  response,
  requestUrl,
  corsOrigin,
}) => {
  if (requestUrl.pathname !== "/api/updates/status") {
    return false;
  }
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const installation = detectInstallation();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const status = await checkForUpdates(installation, controller.signal);
    writeJson(
      response,
      200,
      {
        source: status.source,
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        updateAvailable: status.updateAvailable,
        details: status.details,
        error: status.error,
      },
      corsOrigin,
    );
  } finally {
    clearTimeout(timer);
  }
  return true;
};

export const handleUpdatesApplyRoute: ApiRouteHandler = async ({
  request,
  response,
  requestUrl,
  corsOrigin,
}) => {
  if (requestUrl.pathname !== "/api/updates/apply") {
    return false;
  }
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const installation = detectInstallation();
  const result = await applyUpdate(installation);
  writeJson(
    response,
    result.ok ? 200 : 500,
    {
      ok: result.ok,
      source: result.source,
      output: result.output,
      error: result.error,
    },
    corsOrigin,
  );
  return true;
};

export const handleUpdatesRestartRoute: ApiRouteHandler = async ({
  request,
  response,
  requestUrl,
  corsOrigin,
}) => {
  if (requestUrl.pathname !== "/api/updates/restart") {
    return false;
  }
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const installation = detectInstallation();
  writeJson(response, 202, { ok: true, restartingIn: 500 }, corsOrigin);
  // Flush response before exiting so the browser sees the 202.
  response.on("finish", () => scheduleSelfRestart(installation, 500));
  return true;
};
