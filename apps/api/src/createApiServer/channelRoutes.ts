import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const CHANNEL_MESSAGES_PATH_PATTERN = /^\/api\/channels\/([^/]+)\/messages$/;

/**
 * GET  /api/channels/:terminalId/messages  - list queued + delivered messages
 * POST /api/channels/:terminalId/messages  - send a message to a terminal channel
 *
 * See docs/reference/api.md and docs/guides/inter-agent-messaging.md.
 */
export const handleChannelMessagesRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const match = requestUrl.pathname.match(CHANNEL_MESSAGES_PATH_PATTERN);
  if (!match) {
    return false;
  }

  const terminalId = decodeURIComponent(match[1] ?? "");

  if (request.method === "GET") {
    writeJson(response, 200, runtime.listChannelMessages(terminalId), corsOrigin);
    return true;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const body = bodyReadResult.payload as Record<string, unknown> | null;
  const content = body && typeof body.content === "string" ? body.content : "";
  const fromTerminalId =
    body && typeof body.fromTerminalId === "string" ? body.fromTerminalId.trim() : "";

  if (!content.trim()) {
    writeJson(response, 400, { error: "content is required" }, corsOrigin);
    return true;
  }
  if (!fromTerminalId) {
    writeJson(response, 400, { error: "fromTerminalId is required" }, corsOrigin);
    return true;
  }

  const message = runtime.sendChannelMessage({ fromTerminalId, toTerminalId: terminalId, content });
  if (!message) {
    writeJson(response, 404, { error: "Target terminal not found." }, corsOrigin);
    return true;
  }

  writeJson(response, 201, message, corsOrigin);
  return true;
};
