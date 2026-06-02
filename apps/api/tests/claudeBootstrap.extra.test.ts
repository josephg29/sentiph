/**
 * Supplementary tests for terminalRuntime/claudeBootstrap.ts — covers
 * remaining branches not exercised by claudeBootstrap.test.ts.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildBootstrapCommand, planClaudeBootstrap } from "../src/terminalRuntime/claudeBootstrap";
import type { PersistedTerminal } from "../src/terminalRuntime/types";

const makeTerminal = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
  agentProvider: "claude-code",
  ...overrides,
});

// ─── buildBootstrapCommand additional branches ─────────────────────────────────

describe("buildBootstrapCommand — additional branches", () => {
  it("group leader WITHOUT sentiphMcpConfigPath uses plain claude-code path", () => {
    // isGroupLeader=true but no sentiphMcpConfigPath → falls through to non-group-leader path
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "t1",
      isGroupLeader: true,
      // sentiphMcpConfigPath is omitted
      claudeBootstrapFlags: ["--session-id", "abc"],
    });
    // Should NOT contain --mcp-config
    expect(cmd).not.toContain("--mcp-config");
    expect(cmd).toContain("--session-id abc");
  });

  it("group leader with sentiphMcpConfigPath positions mcp-config before tail flags", () => {
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "t1",
      isGroupLeader: true,
      sentiphMcpConfigPath: "/tmp/mcp.json",
      claudeBootstrapFlags: ["--resume", "uuid"],
    });
    expect(cmd).toContain('--mcp-config "/tmp/mcp.json"');
    // The mcp-config should appear before the tail (--dangerously-skip-permissions)
    const mcpIdx = cmd.indexOf("--mcp-config");
    const tailIdx = cmd.indexOf("--dangerously-skip-permissions");
    expect(mcpIdx).toBeLessThan(tailIdx);
  });

  it("claude-code with undefined claudeBootstrapFlags uses empty array default", () => {
    // claudeBootstrapFlags is not provided → defaults to [] inside the function
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "t1",
      // claudeBootstrapFlags omitted
    });
    expect(typeof cmd).toBe("string");
    expect(cmd.length).toBeGreaterThan(0);
  });

  it("Sentiph terminal with only sentiphMcpConfigPath (no system prompt)", () => {
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "__sentiph__",
      sentiphMcpConfigPath: "/tmp/mcp.json",
    });
    expect(cmd).toContain("--mcp-config");
    expect(cmd).not.toContain("--append-system-prompt");
  });

  it("Sentiph terminal with only sentiphSystemPromptPath (no mcp config)", () => {
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "__sentiph__",
      sentiphSystemPromptPath: "/tmp/prompt.md",
    });
    expect(cmd).toContain("--append-system-prompt");
    expect(cmd).not.toContain("--mcp-config");
  });
});

// ─── planClaudeBootstrap additional branches ───────────────────────────────────

describe("planClaudeBootstrap — additional branches", () => {
  let tmpDir: string;
  let claudeConfigDir: string;
  let workspaceCwd: string;
  let originalClaudeConfigDir: string | undefined;

  beforeEach(() => {
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-bootstrap-extra-"));
    claudeConfigDir = join(tmpDir, "claude-config");
    workspaceCwd = join(tmpDir, "workspace");
    mkdirSync(workspaceCwd, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;
  });

  afterEach(() => {
    if (originalClaudeConfigDir === undefined) {
      // biome-ignore lint/performance/noDelete: restoring original env
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty flags when agentProvider is undefined (falls to default claude-code)", () => {
    // When agentProvider is undefined, DEFAULT_AGENT_PROVIDER is "claude-code"
    // A fresh terminal with no prior state generates a new UUID
    const base = makeTerminal();
    const { agentProvider: _dropped, ...terminalWithoutProvider } = base;
    const terminal = terminalWithoutProvider as typeof base;
    const plan = planClaudeBootstrap(terminal, workspaceCwd);
    // Default provider is claude-code → fresh UUID generated
    expect(plan.flags).toContain("--session-id");
  });

  it("withModel returns original flags unchanged when no model is set", () => {
    // When model is undefined, modelFlags is empty → withModel returns flags as-is
    const terminal = makeTerminal({ model: undefined });
    const plan = planClaudeBootstrap(terminal, workspaceCwd);
    // No --model flag
    expect(plan.flags).not.toContain("--model");
    expect(plan.flags[0]).toBe("--session-id");
  });

  it("generates session ID for 'registered' lifecycle state (not a prior session)", () => {
    const terminal = makeTerminal({ lifecycleState: "registered" });
    const plan = planClaudeBootstrap(terminal, workspaceCwd);
    // 'registered' is not in hadPriorSession list → fresh UUID
    expect(plan.flags[0]).toBe("--session-id");
    expect(plan.banner).toBeUndefined();
  });

  it("generates session ID for 'running' lifecycle state (not a prior session)", () => {
    const terminal = makeTerminal({ lifecycleState: "running" });
    const plan = planClaudeBootstrap(terminal, workspaceCwd);
    expect(plan.flags[0]).toBe("--session-id");
    expect(plan.banner).toBeUndefined();
  });
});
