import { mkdtempSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

import { setupServerHarness } from "./helpers/createApiServerHarness";

describe("createApiServer", () => {
  const h = setupServerHarness();

  afterEach(async () => {
    await h.teardown();
  });

  it("returns snapshots for GET /api/terminal-snapshots", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns session summaries for GET /api/conversations", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    h.writeConversationTranscript(workspaceCwd, "terminal-1", [
      {
        type: "session_start",
        eventId: "terminal-1:1",
        sessionId: "terminal-1",
        tentacleId: "terminal-1",
        timestamp: "2026-03-05T10:00:00.000Z",
      },
      {
        type: "session_end",
        eventId: "terminal-1:5",
        sessionId: "terminal-1",
        tentacleId: "terminal-1",
        reason: "pty_exit",
        exitCode: 0,
        signal: 0,
        timestamp: "2026-03-05T10:00:04.000Z",
      },
    ]);
    h.writeClaudeTurns(workspaceCwd, "terminal-1", [
      {
        turnId: "turn-1",
        role: "user",
        content: "build export",
        startedAt: "2026-03-05T10:00:01.000Z",
        endedAt: "2026-03-05T10:00:01.000Z",
      },
      {
        turnId: "turn-2",
        role: "assistant",
        content: "implemented",
        startedAt: "2026-03-05T10:00:02.000Z",
        endedAt: "2026-03-05T10:00:03.000Z",
      },
    ]);

    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const response = await fetch(`${baseUrl}/api/conversations`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        sessionId: "terminal-1",
        tentacleId: "terminal-1",
        startedAt: "2026-03-05T10:00:00.000Z",
        endedAt: "2026-03-05T10:00:04.000Z",
        lastEventAt: "2026-03-05T10:00:04.000Z",
        eventCount: 2,
        turnCount: 2,
        userTurnCount: 1,
        assistantTurnCount: 1,
        firstUserTurnPreview: "build export",
        lastUserTurnPreview: "build export",
        lastAssistantTurnPreview: "implemented",
      },
    ]);
  });

  it("returns assembled conversation details and export payloads", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    h.writeConversationTranscript(workspaceCwd, "terminal-2-agent-1", [
      {
        type: "session_start",
        eventId: "terminal-2-agent-1:1",
        sessionId: "terminal-2-agent-1",
        tentacleId: "terminal-2",
        timestamp: "2026-03-05T11:00:00.000Z",
      },
    ]);
    h.writeClaudeTurns(workspaceCwd, "terminal-2-agent-1", [
      {
        turnId: "turn-1",
        role: "user",
        content: "summarize",
        startedAt: "2026-03-05T11:00:01.000Z",
        endedAt: "2026-03-05T11:00:01.000Z",
      },
      {
        turnId: "turn-2",
        role: "assistant",
        content: "summary ready",
        startedAt: "2026-03-05T11:00:02.000Z",
        endedAt: "2026-03-05T11:00:03.000Z",
      },
    ]);

    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const detailResponse = await fetch(`${baseUrl}/api/conversations/terminal-2-agent-1`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      sessionId: "terminal-2-agent-1",
      turnCount: 2,
      turns: [
        {
          role: "user",
          content: "summarize",
        },
        {
          role: "assistant",
          content: "summary ready",
        },
      ],
    });

    const jsonExportResponse = await fetch(
      `${baseUrl}/api/conversations/terminal-2-agent-1/export?format=json`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
    expect(jsonExportResponse.status).toBe(200);
    await expect(jsonExportResponse.json()).resolves.toMatchObject({
      sessionId: "terminal-2-agent-1",
      turnCount: 2,
    });

    const markdownExportResponse = await fetch(
      `${baseUrl}/api/conversations/terminal-2-agent-1/export?format=md`,
      {
        method: "GET",
      },
    );
    expect(markdownExportResponse.status).toBe(200);
    expect(markdownExportResponse.headers.get("content-type")).toContain("text/markdown");
    const markdownBody = await markdownExportResponse.text();
    expect(markdownBody).toContain("## User");
    expect(markdownBody).toContain("summarize");
    expect(markdownBody).toContain("## Assistant");
    expect(markdownBody).toContain("summary ready");
  });

  it("returns 400 for unsupported conversation export format", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    h.writeConversationTranscript(workspaceCwd, "terminal-3-agent-1", [
      {
        type: "session_start",
        eventId: "terminal-3-agent-1:1",
        sessionId: "terminal-3-agent-1",
        tentacleId: "terminal-3",
        timestamp: "2026-03-05T12:00:00.000Z",
      },
    ]);

    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const response = await fetch(
      `${baseUrl}/api/conversations/terminal-3-agent-1/export?format=txt`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported conversation export format.",
    });
  });

  it("rejects non-local browser origins for HTTP endpoints", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: "https://attacker.example",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Origin not allowed.",
    });
  });

  it("allows loopback browser origins and reflects CORS origin", async () => {
    const baseUrl = await h.startServer();
    const origin = "http://localhost:5173";

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: origin,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("rejects non-local CORS preflight requests", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(response.status).toBe(403);
  });

  it("rejects websocket upgrades from non-local origins", async () => {
    const baseUrl = await h.startServer();
    const wsUrl = new URL(`${h.toWebSocketBaseUrl(baseUrl)}/api/terminals/terminal-1/ws`);

    const opened = await new Promise<boolean>((resolve) => {
      const socket = createConnection({
        host: wsUrl.hostname,
        port: Number.parseInt(wsUrl.port, 10),
      });
      let settled = false;
      let responseHead = "";

      const finish = (didOpen: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(didOpen);
      };

      socket.on("connect", () => {
        socket.write(
          `GET ${wsUrl.pathname} HTTP/1.1\r\nHost: ${wsUrl.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nOrigin: https://attacker.example\r\n\r\n`,
        );
      });
      socket.on("data", (chunk) => {
        responseHead += chunk.toString("utf8");
        if (responseHead.includes("101 Switching Protocols")) {
          finish(true);
        }
      });
      socket.on("error", () => finish(false));
      socket.on("close", () => finish(false));
      setTimeout(() => finish(false), 1_000);
    });

    expect(opened).toBe(false);
  });

  it("returns 405 for unsupported methods on /api/terminal-snapshots", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("sanitizes unexpected internal errors from API responses", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminals/%E0%A4%A`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
