import type { IncomingMessage } from "node:http";

import type { WebSocket } from "ws";

import type { TerminalServerMessage, TerminalSession } from "./types";

export const getTentacleId = (request: IncomingMessage) => {
  if (!request.url) {
    return null;
  }

  const url = new URL(request.url, "http://localhost");
  const match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/ws$/);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1] ?? "");
};

export const sendMessage = (client: WebSocket, message: TerminalServerMessage) => {
  if (client.readyState !== 1) {
    return;
  }

  client.send(JSON.stringify(message));
};

export const broadcastMessage = (session: TerminalSession, message: TerminalServerMessage) => {
  for (const client of session.clients) {
    sendMessage(client, message);
  }
};
