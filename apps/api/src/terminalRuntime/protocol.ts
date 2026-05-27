import type { IncomingMessage } from "node:http";

import type { WebSocket } from "ws";

import type { TerminalServerMessage, TerminalSession } from "./types";

/**
 * Extracts the terminal ID from a WebSocket upgrade request URL.
 * Matches the path pattern `/api/terminals/:id/ws` and percent-decodes the ID.
 * Returns null if the URL is absent, malformed, or doesn't match the pattern.
 */
export const getTerminalId = (request: IncomingMessage) => {
  if (!request.url) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(request.url, "http://localhost");
  } catch {
    return null;
  }

  const match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/ws$/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
};

/**
 * Serializes `message` to JSON and sends it on `client`, but only when the socket is
 * in the OPEN state (readyState === 1). Silently drops the send if the socket is
 * connecting, closing, or closed to avoid "WebSocket is not open" errors.
 */
export const sendMessage = (client: WebSocket, message: TerminalServerMessage) => {
  if (client.readyState !== 1) {
    return;
  }

  client.send(JSON.stringify(message));
};

/**
 * Delivers `message` to all connected WebSocket clients AND all registered directListeners.
 * Direct listeners are used by the API server itself to process terminal output server-side
 * (e.g. for code-intel event extraction) without going through a WebSocket round-trip.
 */
export const broadcastMessage = (session: TerminalSession, message: TerminalServerMessage) => {
  for (const client of session.clients) {
    sendMessage(client, message);
  }
  for (const listener of session.directListeners) {
    listener(message);
  }
};
