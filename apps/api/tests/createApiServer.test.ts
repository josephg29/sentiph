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

  const startServer = async () => {
    const apiServer = createApiServer({
      workspaceCwd: process.cwd(),
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

  it("creates new tentacles with unique incremental ids", async () => {
    const baseUrl = await startServer();

    const createFirstResponse = await fetch(`${baseUrl}/api/tentacles`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    expect(createFirstResponse.status).toBe(201);
    await expect(createFirstResponse.json()).resolves.toEqual(
      expect.objectContaining({
        agentId: "tentacle-2-root",
        label: "tentacle-2-root",
        state: "live",
        tentacleId: "tentacle-2",
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
      expect.objectContaining({ tentacleId: "tentacle-1" }),
      expect.objectContaining({ tentacleId: "tentacle-2" }),
      expect.objectContaining({ tentacleId: "tentacle-3" }),
    ]);
  });
});
