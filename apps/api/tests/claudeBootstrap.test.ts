/**
 * Tests for terminalRuntime/claudeBootstrap.ts
 * Covers buildBootstrapCommand and planClaudeBootstrap.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildBootstrapCommand, planClaudeBootstrap } from "../src/terminalRuntime/claudeBootstrap";
import type { PersistedTerminal } from "../src/terminalRuntime/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeTerminal = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
  agentProvider: "claude-code",
  ...overrides,
});

// ─── buildBootstrapCommand ────────────────────────────────────────────────────

describe("buildBootstrapCommand", () => {
  describe("Sentiph terminal (tentacleId === '__sentiph__')", () => {
    it("returns bare claude command with no flags when neither path is provided", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "__sentiph__",
      });
      // The base bootstrap command is "claude --dangerously-skip-permissions"
      expect(cmd).toBe("claude --dangerously-skip-permissions");
    });

    it("includes --mcp-config flag when sentiphMcpConfigPath is provided", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "__sentiph__",
        sentiphMcpConfigPath: "/tmp/mcp.json",
      });
      expect(cmd).toContain('--mcp-config "/tmp/mcp.json"');
    });

    it("includes --append-system-prompt flag when sentiphSystemPromptPath is provided", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "__sentiph__",
        sentiphSystemPromptPath: "/tmp/prompt.md",
      });
      expect(cmd).toContain("--append-system-prompt");
      expect(cmd).toContain("/tmp/prompt.md");
    });

    it("includes both flags when both paths are provided", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "__sentiph__",
        sentiphMcpConfigPath: "/tmp/mcp.json",
        sentiphSystemPromptPath: "/tmp/prompt.md",
      });
      expect(cmd).toContain("--mcp-config");
      expect(cmd).toContain("--append-system-prompt");
    });
  });

  describe("claude-code provider (non-Sentiph)", () => {
    it("returns base command with resume flags when claudeBootstrapFlags provided", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "t1",
        claudeBootstrapFlags: ["--session-id", "abc-123"],
      });
      expect(cmd).toContain("--session-id abc-123");
    });

    it("returns base command with no extra tokens when claudeBootstrapFlags is empty", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "t1",
        claudeBootstrapFlags: [],
      });
      // Should still be valid — just the base command
      expect(cmd.length).toBeGreaterThan(0);
    });

    it("injects --mcp-config when isGroupLeader=true and sentiphMcpConfigPath is set", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "t1",
        isGroupLeader: true,
        sentiphMcpConfigPath: "/tmp/mcp.json",
        claudeBootstrapFlags: ["--resume", "uuid-here"],
      });
      expect(cmd).toContain('--mcp-config "/tmp/mcp.json"');
      expect(cmd).toContain("--resume");
    });

    it("does NOT inject --mcp-config for non-group-leader even with sentiphMcpConfigPath", () => {
      const cmd = buildBootstrapCommand({
        provider: "claude-code",
        tentacleId: "t1",
        isGroupLeader: false,
        sentiphMcpConfigPath: "/tmp/mcp.json",
      });
      expect(cmd).not.toContain("--mcp-config");
    });
  });

  describe("non-claude-code providers", () => {
    it("returns codex command for codex provider", () => {
      const cmd = buildBootstrapCommand({
        provider: "codex",
        tentacleId: "t1",
      });
      expect(cmd).toBe("codex");
    });
  });
});

// ─── planClaudeBootstrap ──────────────────────────────────────────────────────

describe("planClaudeBootstrap", () => {
  let tmpDir: string;
  let claudeConfigDir: string;
  let workspaceCwd: string;
  let originalClaudeConfigDir: string | undefined;

  beforeEach(() => {
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-bootstrap-test-"));
    claudeConfigDir = join(tmpDir, "claude-config");
    workspaceCwd = join(tmpDir, "workspace");
    mkdirSync(workspaceCwd, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;
  });

  afterEach(() => {
    if (originalClaudeConfigDir === undefined) {
      // biome-ignore lint/performance/noDelete: restoring the original env requires removing the key
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeFakeSessionFile = (sessionId: string) => {
    // Mirror Claude CLI's project-directory encoding (path separators and the
    // Windows drive-letter colon become dashes) so the fake file lands where
    // the source looks for it on every platform.
    const projectDirName = workspaceCwd.replace(/[/\\:]/g, "-");
    const projectDir = join(claudeConfigDir, "projects", projectDirName);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, `${sessionId}.jsonl`), "{}\n", "utf8");
  };

  describe("when terminalRecord is undefined", () => {
    it("returns empty flags", () => {
      const plan = planClaudeBootstrap(undefined, workspaceCwd);
      expect(plan.flags).toEqual([]);
      expect(plan.banner).toBeUndefined();
      expect(plan.sessionIdToPersist).toBeUndefined();
    });
  });

  describe("when tentacleId is the Sentiph special ID", () => {
    it("returns empty flags", () => {
      const terminal = makeTerminal({ tentacleId: "__sentiph__" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags).toEqual([]);
    });
  });

  describe("when provider is not claude-code", () => {
    it("returns empty flags for codex provider", () => {
      const terminal = makeTerminal({ agentProvider: "codex" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags).toEqual([]);
    });
  });

  describe("fresh terminal (no prior lifecycle state, no stored UUID)", () => {
    it("generates --session-id with a UUID and persists it", () => {
      const terminal = makeTerminal();
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--session-id");
      expect(plan.flags[1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(plan.sessionIdToPersist).toBe(plan.flags[1]);
      expect(plan.banner).toBeUndefined();
    });

    it("prepends model flags when a model is configured", () => {
      const terminal = makeTerminal({ model: "opus" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--model");
      expect(plan.flags[1]).toMatch(/opus/);
      expect(plan.flags[2]).toBe("--session-id");
    });

    it("prepends haiku model flag correctly", () => {
      const terminal = makeTerminal({ model: "haiku" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--model");
      expect(plan.flags[1]).toMatch(/haiku/);
    });

    it("prepends sonnet model flag correctly", () => {
      const terminal = makeTerminal({ model: "sonnet" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--model");
      expect(plan.flags[1]).toMatch(/sonnet/);
    });
  });

  describe("stored UUID with existing session file on disk", () => {
    it("returns --resume <uuid> and a banner", () => {
      const storedUuid = "00000000-0000-4000-8000-000000000001";
      writeFakeSessionFile(storedUuid);
      const terminal = makeTerminal({
        claudeSessionId: storedUuid,
        lifecycleState: "stopped",
      });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags).toContain("--resume");
      expect(plan.flags).toContain(storedUuid);
      expect(plan.banner).toContain("resuming previous Claude session");
      expect(plan.sessionIdToPersist).toBeUndefined();
    });

    it("prepends model flags before --resume when model is set", () => {
      const storedUuid = "00000000-0000-4000-8000-000000000002";
      writeFakeSessionFile(storedUuid);
      const terminal = makeTerminal({
        claudeSessionId: storedUuid,
        lifecycleState: "stopped",
        model: "haiku",
      });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--model");
      expect(plan.flags[2]).toBe("--resume");
    });
  });

  describe("stored UUID without session file on disk", () => {
    it("allocates a fresh UUID (not the stored one) and persists it", () => {
      const storedUuid = "00000000-0000-4000-8000-000000000003";
      // Intentionally do NOT create the session file
      const terminal = makeTerminal({
        claudeSessionId: storedUuid,
        lifecycleState: "stopped",
      });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--session-id");
      expect(plan.flags[1]).not.toBe(storedUuid);
      expect(plan.sessionIdToPersist).toBe(plan.flags[1]);
      expect(plan.banner).toBeUndefined();
    });
  });

  describe("prior session without UUID (legacy --continue path)", () => {
    it.each(["stopped", "exited", "stale"] as const)(
      "returns --continue and a banner for lifecycleState=%s",
      (lifecycleState) => {
        const terminal = makeTerminal({ lifecycleState });
        const plan = planClaudeBootstrap(terminal, workspaceCwd);
        expect(plan.flags).toContain("--continue");
        expect(plan.banner).toContain("resuming previous Claude session");
        expect(plan.sessionIdToPersist).toBeUndefined();
      },
    );

    it("prepends model flags before --continue when model is set", () => {
      const terminal = makeTerminal({ lifecycleState: "stopped", model: "opus" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags[0]).toBe("--model");
      expect(plan.flags[2]).toBe("--continue");
    });
  });

  describe("unknown/invalid model value", () => {
    it("omits model flag when model key is not a known value", () => {
      // Cast to bypass TS — simulates an unknown value from a deserialized record
      const terminal = makeTerminal({ model: "unknown-model" as "opus" });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      // Should not contain --model since the model ID lookup returns undefined
      expect(plan.flags).not.toContain("--model");
    });
  });

  describe("CLAUDE_CONFIG_DIR override for session file detection", () => {
    it("respects CLAUDE_CONFIG_DIR when finding session files", () => {
      const storedUuid = "00000000-0000-4000-8000-000000000099";
      writeFakeSessionFile(storedUuid);
      const terminal = makeTerminal({ claudeSessionId: storedUuid });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      expect(plan.flags).toContain("--resume");
    });

    it("falls back to fresh UUID when CLAUDE_CONFIG_DIR points to non-existent dir", () => {
      process.env.CLAUDE_CONFIG_DIR = join(tmpDir, "no-such-dir");
      const storedUuid = "00000000-0000-4000-8000-0000000000aa";
      const terminal = makeTerminal({ claudeSessionId: storedUuid });
      const plan = planClaudeBootstrap(terminal, workspaceCwd);
      // File doesn't exist in the configured dir → fresh UUID
      expect(plan.flags[0]).toBe("--session-id");
      expect(plan.flags[1]).not.toBe(storedUuid);
    });
  });
});
