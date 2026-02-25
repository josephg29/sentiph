import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "../src/createApiServer";

describe("createApiServer", () => {
  let stopServer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }
  });

  const startServer = async (
    options: Partial<Parameters<typeof createApiServer>[0]> = {},
  ) => {
    const apiServer = createApiServer({
      workspaceCwd: process.cwd(),
      ...options,
    });
    const address = await apiServer.start(0, "127.0.0.1");
    stopServer = () => apiServer.stop();
    return `http://${address.host}:${address.port}`;
  };

  it("returns in-memory snapshots for GET /api/agent-snapshots", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/agent-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        agentId: "tentacle-1-root",
        label: "tentacle-1-root",
        state: "live",
        tentacleId: "tentacle-1",
        tentacleName: "tentacle-1",
      }),
    ]);
  });

  it("returns 405 for unsupported methods on /api/agent-snapshots", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/agent-snapshots`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns codex usage snapshot for GET /api/codex/usage", async () => {
    const codexSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-02-25T12:00:00.000Z",
      planType: "pro",
      primaryUsedPercent: 12,
      secondaryUsedPercent: 28,
      creditsBalance: 88.5,
      creditsUnlimited: false,
    } as const;

    const baseUrl = await startServer({
      readCodexUsageSnapshot: async () => codexSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/codex/usage`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(codexSnapshot);
  });

  it("returns 405 for unsupported methods on /api/codex/usage", async () => {
    const baseUrl = await startServer({
      readCodexUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-02-25T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/codex/usage`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("creates new tentacles with unique incremental ids", async () => {
    const baseUrl = await startServer();

    const createFirstResponse = await fetch(`${baseUrl}/api/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner" }),
    });

    expect(createFirstResponse.status).toBe(201);
    await expect(createFirstResponse.json()).resolves.toEqual(
      expect.objectContaining({
        agentId: "tentacle-2-root",
        label: "tentacle-2-root",
        state: "live",
        tentacleId: "tentacle-2",
        tentacleName: "planner",
      }),
    );

    const createSecondResponse = await fetch(`${baseUrl}/api/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    expect(createSecondResponse.status).toBe(201);
    await expect(createSecondResponse.json()).resolves.toEqual(
      expect.objectContaining({
        agentId: "tentacle-3-root",
        label: "tentacle-3-root",
        state: "live",
        tentacleId: "tentacle-3",
        tentacleName: "tentacle-3",
      }),
    );

    const renameResponse = await fetch(`${baseUrl}/api/tentacles/tentacle-3`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "reviewer" }),
    });

    expect(renameResponse.status).toBe(200);
    await expect(renameResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "tentacle-3",
        tentacleName: "reviewer",
      }),
    );

    const listResponse = await fetch(`${baseUrl}/api/agent-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({ tentacleId: "tentacle-1", tentacleName: "tentacle-1" }),
      expect.objectContaining({ tentacleId: "tentacle-2", tentacleName: "planner" }),
      expect.objectContaining({ tentacleId: "tentacle-3", tentacleName: "reviewer" }),
    ]);
  });

  it("returns 400 when tentacle name is empty after trimming", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: " " }),
    });

    expect(createResponse.status).toBe(400);

    const renameResponse = await fetch(`${baseUrl}/api/tentacles/tentacle-1`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: " " }),
    });

    expect(renameResponse.status).toBe(400);
  });

  it("deletes a tentacle and removes it from snapshots", async () => {
    const baseUrl = await startServer();

    const createResponse = await fetch(`${baseUrl}/api/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const deleteResponse = await fetch(`${baseUrl}/api/tentacles/tentacle-2`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetch(`${baseUrl}/api/agent-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({ tentacleId: "tentacle-1" }),
    ]);

    const missingResponse = await fetch(`${baseUrl}/api/tentacles/tentacle-2`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(missingResponse.status).toBe(404);
  });
});
