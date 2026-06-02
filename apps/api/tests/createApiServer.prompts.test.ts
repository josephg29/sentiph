import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  it("refreshes builtin prompts from promptsDir on server start", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    const projectStateDir = mkdtempSync(join(tmpdir(), "sentiph-state-test-"));
    const promptsDir = mkdtempSync(join(tmpdir(), "sentiph-prompts-test-"));
    h.temporaryDirectories.push(workspaceCwd, projectStateDir, promptsDir);

    mkdirSync(join(projectStateDir, "prompts", "core"), { recursive: true });
    writeFileSync(
      join(projectStateDir, "prompts", "core", "swarm-parent.md"),
      "stale prompt with {{workerBranches}}\n",
      "utf8",
    );
    writeFileSync(
      join(promptsDir, "swarm-parent.md"),
      "fresh prompt with {{workerSpawnCommands}}\n",
      "utf8",
    );

    const baseUrl = await h.startServer({
      workspaceCwd,
      projectStateDir,
      promptsDir,
    });

    const response = await fetch(`${baseUrl}/api/prompts/swarm-parent`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "swarm-parent",
      source: "builtin",
      content: "fresh prompt with {{workerSpawnCommands}}",
    });
  });

  it("reads builtin prompts from the live promptsDir after server start", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    const projectStateDir = mkdtempSync(join(tmpdir(), "sentiph-state-test-"));
    const promptsDir = mkdtempSync(join(tmpdir(), "sentiph-prompts-test-"));
    h.temporaryDirectories.push(workspaceCwd, projectStateDir, promptsDir);

    writeFileSync(join(promptsDir, "tentacle-update-tentacle.md"), "version one\n", "utf8");

    const baseUrl = await h.startServer({
      workspaceCwd,
      projectStateDir,
      promptsDir,
    });

    writeFileSync(join(promptsDir, "tentacle-update-tentacle.md"), "version two\n", "utf8");

    const response = await fetch(`${baseUrl}/api/prompts/tentacle-update-tentacle`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "tentacle-update-tentacle",
      source: "builtin",
      content: "version two",
    });
  });

  it("writes sentiph MCP config on first run before stateDir exists", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);

    // stateDir (.sentiph) does NOT exist yet when the server starts
    const stateDir = join(workspaceCwd, ".sentiph");
    expect(existsSync(stateDir)).toBe(false);

    await h.startServer({ workspaceCwd });

    const configPath = join(stateDir, "sentiph-mcp-config.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      mcpServers: { sentiph: { command: string; env: Record<string, string> } };
    };
    expect(config.mcpServers.sentiph.command).toBeTruthy();
    expect(config.mcpServers.sentiph.env.SENTIPH_API_ORIGIN).toBeTruthy();
  });

  it("writes sentiph system prompt on first run with shell-safe content", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);

    const stateDir = join(workspaceCwd, ".sentiph");
    expect(existsSync(stateDir)).toBe(false);

    await h.startServer({ workspaceCwd });

    const promptPath = join(stateDir, "sentiph-system-prompt.md");
    expect(existsSync(promptPath)).toBe(true);

    const prompt = readFileSync(promptPath, "utf8");
    expect(prompt.length).toBeGreaterThan(0);
    // Bootstrap loads this file via shell substitution inside double quotes,
    // so the content must avoid bash's four double-quoted special characters.
    expect(prompt).not.toMatch(/[$`"\\]/);
    // Sanity-check the orchestration guidance is actually present.
    expect(prompt).toMatch(/Sentiph/);
    expect(prompt).toMatch(/Claude Code/);
  });
});
