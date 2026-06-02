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

  it("POST /api/hooks/user-prompt-submit auto-renames generated default terminal names", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?sentiph_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI failures" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const secondHookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?sentiph_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Something else later" }),
      },
    );
    expect(secondHookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
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
          tentacleName: "Investigate flaky CI failures",
        }),
      ]),
    );
  });

  it("POST /api/hooks/user-prompt-submit preserves explicit terminal names", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "reviewer" }),
    });
    expect(createResponse.status).toBe(201);

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?sentiph_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI failures" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
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
          tentacleName: "reviewer",
        }),
      ]),
    );
  });

  it("infers generated terminal names from older registry entries", async () => {
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
              tentacleName: "Sentiph Terminal 1",
              createdAt: "2026-04-10T10:00:00.000Z",
              workspaceMode: "shared",
            },
          ],
          uiState: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await h.startServer({ workspaceCwd });

    const hookResponse = await fetch(
      `${baseUrl}/api/hooks/user-prompt-submit?sentiph_session=terminal-1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Investigate flaky CI failures" }),
      },
    );
    expect(hookResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
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
          tentacleName: "Investigate flaky CI failures",
        }),
      ]),
    );
  });
});
