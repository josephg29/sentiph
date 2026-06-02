import { parseBoundedInt, parseEnum, parseRequiredString } from "./queryParsers";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed, writeNoContent, writeText } from "./routeHelpers";

const CONVERSATION_SEARCH_PATH = "/api/conversations/search";
const CONVERSATION_ITEM_PATH_PATTERN = /^\/api\/conversations\/([^/]+)$/;
const CONVERSATION_EXPORT_PATH_PATTERN = /^\/api\/conversations\/([^/]+)\/export$/;

// Generous ceiling for a single page so a paginated client can't request an
// unbounded read window; the no-param path is unaffected and returns all rows.
const CONVERSATION_LIST_MAX_LIMIT = 500;

export const handleConversationsCollectionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/conversations") {
    return false;
  }

  if (request.method === "DELETE") {
    await runtime.deleteAllConversationSessions();
    writeNoContent(response, 204, corsOrigin);
    return true;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  // Pagination is OPTIONAL: only narrow the window when the client supplies a
  // limit or offset. Absent both, the full set is returned (legacy behavior the
  // web client relies on). The response shape stays a bare array either way.
  const hasLimit = requestUrl.searchParams.has("limit");
  const hasOffset = requestUrl.searchParams.has("offset");
  const listOptions =
    hasLimit || hasOffset
      ? {
          limit: parseBoundedInt(requestUrl.searchParams, "limit", {
            min: 0,
            max: CONVERSATION_LIST_MAX_LIMIT,
            default: CONVERSATION_LIST_MAX_LIMIT,
          }).value,
          offset: parseBoundedInt(requestUrl.searchParams, "offset", {
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
            default: 0,
          }).value,
        }
      : undefined;

  const payload = await runtime.listConversationSessions(listOptions);
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleConversationSearchRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== CONVERSATION_SEARCH_PATH) {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const { value: query, error } = parseRequiredString(
    requestUrl.searchParams,
    "q",
    "Missing search query parameter 'q'.",
  );
  if (error !== null || query === null) {
    writeJson(response, 400, { error: error ?? "Missing search query parameter 'q'." }, corsOrigin);
    return true;
  }

  const payload = await runtime.searchConversations(query);
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleConversationItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const match = requestUrl.pathname.match(CONVERSATION_ITEM_PATH_PATTERN);
  if (!match) {
    return false;
  }

  const sessionId = decodeURIComponent(match[1] ?? "");

  if (request.method === "DELETE") {
    await runtime.deleteConversationSession(sessionId);
    writeNoContent(response, 204, corsOrigin);
    return true;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const payload = await runtime.readConversationSession(sessionId);
  if (!payload) {
    writeJson(response, 404, { error: "Conversation session not found." }, corsOrigin);
    return true;
  }

  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleConversationExportRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const match = requestUrl.pathname.match(CONVERSATION_EXPORT_PATH_PATTERN);
  if (!match) {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const sessionId = decodeURIComponent(match[1] ?? "");
  const { value: format, error } = parseEnum(requestUrl.searchParams, "format", ["json", "md"], {
    invalidMessage: "Unsupported conversation export format.",
  });
  if (error !== null || format === null) {
    writeJson(
      response,
      400,
      { error: error ?? "Unsupported conversation export format." },
      corsOrigin,
    );
    return true;
  }

  if (format === "json") {
    const payload = await runtime.readConversationSession(sessionId);
    if (!payload) {
      writeJson(response, 404, { error: "Conversation session not found." }, corsOrigin);
      return true;
    }

    writeJson(response, 200, payload, corsOrigin);
    return true;
  }

  const payload = await runtime.exportConversationSession(sessionId, "md");
  if (payload === null) {
    writeJson(response, 404, { error: "Conversation session not found." }, corsOrigin);
    return true;
  }

  writeText(response, 200, payload, "text/markdown; charset=utf-8", corsOrigin);
  return true;
};
