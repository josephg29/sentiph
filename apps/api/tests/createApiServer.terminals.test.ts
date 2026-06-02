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

  it("returns 405 for unsupported methods on /api/ui-state", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/ui-state`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 413 when create tentacle body exceeds size limit", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "x".repeat(1024 * 1024 + 1),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body too large.",
    });
  });

  it("returns 413 when ui-state patch body exceeds size limit", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/ui-state`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        minimizedTerminalIds: ["terminal-1"],
        blob: "x".repeat(1024 * 1024 + 1),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body too large.",
    });
  });

  it("returns 400 for unsupported tentacle completion sound values", async () => {
    const baseUrl = await h.startServer();

    const response = await fetch(`${baseUrl}/api/ui-state`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        terminalCompletionSound: "laser-zap",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "terminalCompletionSound must be one of the supported sound identifiers.",
    });
  });

  it("restores ui state across API restarts using persisted registry", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);

    const firstBaseUrl = await h.startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${firstBaseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const patchResponse = await fetch(`${firstBaseUrl}/api/ui-state`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isAgentsSidebarVisible: false,
        sidebarWidth: 380,
        isActiveAgentsSectionExpanded: false,
        isRuntimeStatusStripVisible: false,
        isBottomTelemetryVisible: false,
        isCodexUsageVisible: false,
        isClaudeUsageVisible: false,
        isClaudeUsageSectionExpanded: false,
        isCodexUsageSectionExpanded: false,
        terminalCompletionSound: "double-beep",
        minimizedTerminalIds: ["terminal-1"],
        terminalWidths: {
          "terminal-1": 420,
        },
      }),
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toEqual({
      isAgentsSidebarVisible: false,
      sidebarWidth: 380,
      isActiveAgentsSectionExpanded: false,
      isRuntimeStatusStripVisible: false,
      isBottomTelemetryVisible: false,
      isCodexUsageVisible: false,
      isClaudeUsageVisible: false,
      isClaudeUsageSectionExpanded: false,
      isCodexUsageSectionExpanded: false,
      terminalCompletionSound: "double-beep",
      minimizedTerminalIds: ["terminal-1"],
      terminalWidths: {
        "terminal-1": 420,
      },
    });

    if (h.stopServer) {
      await h.stopServer();
      h.stopServer = null;
    }

    const secondBaseUrl = await h.startServer({
      workspaceCwd,
    });

    const getResponse = await fetch(`${secondBaseUrl}/api/ui-state`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({
      isAgentsSidebarVisible: false,
      sidebarWidth: 380,
      isActiveAgentsSectionExpanded: false,
      isRuntimeStatusStripVisible: false,
      isBottomTelemetryVisible: false,
      isCodexUsageVisible: false,
      isClaudeUsageVisible: false,
      isClaudeUsageSectionExpanded: false,
      isCodexUsageSectionExpanded: false,
      terminalCompletionSound: "double-beep",
      minimizedTerminalIds: ["terminal-1"],
      terminalWidths: {
        "terminal-1": 420,
      },
    });
  });

  it("creates new tentacles with unique incremental ids", async () => {
    const baseUrl = await h.startServer();

    const createFirstResponse = await fetch(`${baseUrl}/api/terminals`, {
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
        terminalId: "terminal-1",
        label: "terminal-1",
        state: "live",
        tentacleId: "terminal-1",
        tentacleName: "planner",
        workspaceMode: "shared",
      }),
    );

    const createSecondResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    expect(createSecondResponse.status).toBe(201);
    await expect(createSecondResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-2",
        label: "terminal-2",
        state: "live",
        tentacleId: "terminal-2",
        tentacleName: "Agent 1",
        workspaceMode: "shared",
      }),
    );

    const renameResponse = await fetch(`${baseUrl}/api/terminals/terminal-2`, {
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
        tentacleId: "terminal-2",
        tentacleName: "reviewer",
      }),
    );

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
          tentacleId: "terminal-1",
          tentacleName: "planner",
          workspaceMode: "shared",
        }),
        expect.objectContaining({
          terminalId: "terminal-2",
          tentacleId: "terminal-2",
          tentacleName: "reviewer",
          workspaceMode: "shared",
        }),
      ]),
    );
  });

  it("reuses the minimum available tentacle number after deletions", async () => {
    const baseUrl = await h.startServer();

    const createFirstResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createFirstResponse.status).toBe(201);

    const createSecondResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createSecondResponse.status).toBe(201);

    const deleteFirstResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteFirstResponse.status).toBe(204);

    const createThirdResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createThirdResponse.status).toBe(201);
    await expect(createThirdResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-1",
      }),
    );
  });

  it("ignores stale persisted nextTentacleNumber values and starts from the minimum available id", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const registryPath = join(workspaceCwd, ".sentiph", "state", "tentacles.json");
    mkdirSync(join(workspaceCwd, ".sentiph", "state"), { recursive: true });
    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          version: 2,
          nextTentacleNumber: 19,
          tentacles: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-1",
      }),
    );
  });

  it("skips tentacle ids that already have an existing worktree directory", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    mkdirSync(join(workspaceCwd, ".sentiph", "worktrees", "terminal-1"), {
      recursive: true,
    });

    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-2",
      }),
    );
  });

  it("persists tentacle metadata without runtime bootstrap flags", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner" }),
    });
    expect(createResponse.status).toBe(201);

    const registryDocument = await h.waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        tentacleId: string;
        workspaceMode: "shared" | "worktree";
      }>;
    }>(workspaceCwd, (document) =>
      document.terminals.some(
        (terminal) =>
          terminal.terminalId === "terminal-1" &&
          terminal.tentacleId === "terminal-1" &&
          terminal.workspaceMode === "shared",
      ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          workspaceMode: "shared",
        }),
      ]),
    );
  });

  it("marks auto-started prompted terminals as active immediately", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const baseUrl = await h.startServer({
      workspaceCwd,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "planner", initialPrompt: "Start working." }),
    });
    expect(createResponse.status).toBe(201);

    const snapshotsResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      headers: { Accept: "application/json" },
    });
    expect(snapshotsResponse.status).toBe(200);
    await expect(snapshotsResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          hasUserPrompt: true,
        }),
      ]),
    );
  });

  it("injects a default tentacle context prompt for tentacle terminals", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const tentacleDir = join(workspaceCwd, ".sentiph", "tentacles", "docs");
    const relativeTentacleDir = ".sentiph/tentacles/docs";
    const promptsDir = join(process.cwd(), "..", "..", "prompts");
    mkdirSync(tentacleDir, { recursive: true });
    writeFileSync(join(tentacleDir, "CONTEXT.md"), "# Docs\n\nDocumentation team.\n", "utf8");
    const baseUrl = await h.startServer({
      workspaceCwd,
      promptsDir,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tentacleId: "docs", workspaceMode: "shared" }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        terminalId: "terminal-1",
        tentacleId: "docs",
      }),
    );

    const registryDocument = await h.waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        initialInputDraft?: string;
      }>;
    }>(workspaceCwd, (document) =>
      document.terminals.some(
        (terminal) =>
          terminal.terminalId === "terminal-1" &&
          terminal.initialInputDraft ===
            `You are working on the Docs section. For tool-list items, context, and docs, check ${relativeTentacleDir}.`,
      ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          initialInputDraft: `You are working on the Docs section. For tool-list items, context, and docs, check ${relativeTentacleDir}.`,
        }),
      ]),
    );

    const snapshotsResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      headers: { Accept: "application/json" },
    });
    expect(snapshotsResponse.status).toBe(200);
    await expect(snapshotsResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          hasUserPrompt: false,
        }),
      ]),
    );
  });
});
