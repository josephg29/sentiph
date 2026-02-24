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
        agentId: "tentacle-main-root",
        label: "tentacle-main-root",
        state: "live",
        tentacleId: "tentacle-main",
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
});
