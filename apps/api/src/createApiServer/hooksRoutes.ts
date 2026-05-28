import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const MAX_AUTO_RENAME_LENGTH = 100;

export const handleHookSessionStartRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { invalidateClaudeUsageCache },
) => {
  if (requestUrl.pathname !== "/api/hooks/session-start") {
    return false;
  }
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }
  invalidateClaudeUsageCache();
  writeJson(response, 200, { ok: true }, corsOrigin);
  return true;
};

export const handleHookUserPromptSubmitRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/hooks/user-prompt-submit") {
    return false;
  }
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const sessionId = requestUrl.searchParams.get("sentiph_session");

  const bodyResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyResult.ok) return true;

  if (sessionId) {
    const payload = bodyResult.payload as { prompt?: unknown } | null;
    const rawPrompt = payload && typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    if (rawPrompt) {
      const firstLine = rawPrompt.split("\n")[0] ?? rawPrompt;
      const truncated =
        firstLine.length > MAX_AUTO_RENAME_LENGTH
          ? firstLine.slice(0, MAX_AUTO_RENAME_LENGTH)
          : firstLine;
      runtime.renameTerminalBySessionAuto(sessionId, truncated);
    }
  }

  writeJson(response, 200, { ok: true }, corsOrigin);
  return true;
};
