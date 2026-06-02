import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

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

  it("returns 400 when workspace mode is invalid", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "invalid-mode",
      }),
    });

    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toEqual({
      error: "Terminal workspace mode must be either 'shared' or 'worktree'.",
    });
  });

  it("returns 400 when tentacle name is empty after trimming", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: " " }),
    });

    expect(createResponse.status).toBe(400);

    const validCreateResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(validCreateResponse.status).toBe(201);

    const renameResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
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
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([]);

    const missingResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(missingResponse.status).toBe(204);
  });

  it("deletes descendant terminals when deleting a parent terminal", async () => {
    const baseUrl = await h.startServer();

    const createParentResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ terminalId: "parent-terminal" }),
    });
    expect(createParentResponse.status).toBe(201);

    const createChildResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminalId: "child-terminal",
        parentTerminalId: "parent-terminal",
      }),
    });
    expect(createChildResponse.status).toBe(201);

    const createGrandchildResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminalId: "grandchild-terminal",
        parentTerminalId: "child-terminal",
      }),
    });
    expect(createGrandchildResponse.status).toBe(201);

    const createSiblingResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ terminalId: "unrelated-terminal" }),
    });
    expect(createSiblingResponse.status).toBe(201);

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/parent-terminal`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({ terminalId: "unrelated-terminal" }),
    ]);
  });

  it("restores tentacles across API restarts using persisted registry", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);

    const firstBaseUrl = await h.startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${firstBaseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner" }),
    });
    expect(createResponse.status).toBe(201);

    if (h.stopServer) {
      await h.stopServer();
      h.stopServer = null;
    }

    const secondBaseUrl = await h.startServer({
      workspaceCwd,
    });

    const listResponse = await fetch(`${secondBaseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          tentacleName: "planner",
        }),
      ]),
    );
  });

  it("marks persisted running terminals as stale when the API starts without their session", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".sentiph", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".sentiph", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 3,
          terminals: [
            {
              terminalId: "terminal-1",
              tentacleId: "terminal-1",
              tentacleName: "planner",
              createdAt: "2026-04-09T10:00:00.000Z",
              workspaceMode: "shared",
              lifecycleState: "running",
              processId: 99999999,
              lifecycleUpdatedAt: "2026-04-09T10:01:00.000Z",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await h.startServer({ workspaceCwd });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        terminalId: "terminal-1",
        state: "stale",
        lifecycleState: "stale",
        lifecycleReason: "missing_process",
        processId: 99999999,
      }),
    ]);
  });

  it("stops and prunes stale terminal records through lifecycle endpoints", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".sentiph", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".sentiph", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 3,
          terminals: [
            {
              terminalId: "terminal-1",
              tentacleId: "terminal-1",
              tentacleName: "planner",
              createdAt: "2026-04-09T10:00:00.000Z",
              workspaceMode: "shared",
              lifecycleState: "running",
              processId: 99999999,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await h.startServer({ workspaceCwd });

    const stopResponse = await fetch(`${baseUrl}/api/terminals/terminal-1/stop`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(stopResponse.status).toBe(200);
    await expect(stopResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-1",
        lifecycleState: "stopped",
        lifecycleReason: "operator_stop",
      }),
    );

    const pruneResponse = await fetch(`${baseUrl}/api/terminals/prune`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(pruneResponse.status).toBe(200);
    await expect(pruneResponse.json()).resolves.toEqual({
      prunedTerminalIds: ["terminal-1"],
    });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([]);
  });

  it("returns 405 for non-POST on /api/terminals/:id/input", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminals/terminal-1/input`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    expect(response.status).toBe(405);
  });

  it("returns 400 for POST /api/terminals/:id/input with missing data field", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(createResponse.status).toBe(201);

    const response = await fetch(`${baseUrl}/api/terminals/terminal-1/input`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("returns 404 for POST /api/terminals/:id/input when terminal has no active session", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(createResponse.status).toBe(201);

    const response = await fetch(`${baseUrl}/api/terminals/terminal-1/input`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ data: "hello\n" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("returns 404 for POST /api/terminals/:id/input when terminal does not exist", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminals/nonexistent/input`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ data: "hello\n" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
