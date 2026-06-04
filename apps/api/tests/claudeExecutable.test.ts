/**
 * Tests for terminalRuntime/claudeExecutable.ts and its integration with
 * buildBootstrapCommand.
 *
 * Regression target: on Windows a bare `claude` typed into cmd.exe can bind to
 * `claude.ps1` (when PATHEXT lists `.PS1` ahead of `.CMD`) or to the
 * extensionless bash shim, both of which cmd.exe refuses with "The system
 * cannot execute the specified program." The resolver must hand cmd.exe a
 * wrapper it can actually launch.
 */
import { win32 as winPath } from "node:path";

import { describe, expect, it } from "vitest";

import { buildBootstrapCommand } from "../src/terminalRuntime/claudeBootstrap";
import { resolveClaudeCommand } from "../src/terminalRuntime/claudeExecutable";

// Builds a fileExists predicate backed by an exact set of Windows paths,
// joined with win32 semantics so the test is deterministic on any host OS.
const winFileExists = (existing: string[]) => {
  const set = new Set(existing);
  return (candidate: string) => set.has(candidate);
};

describe("resolveClaudeCommand", () => {
  describe("POSIX", () => {
    it("returns the bare `claude` word regardless of PATH contents", () => {
      const result = resolveClaudeCommand({
        platform: "linux",
        env: { PATH: "/usr/local/bin:/usr/bin" },
        fileExists: () => true,
      });
      expect(result).toBe("claude");
    });

    it("honors SENTIPH_CLAUDE_PATH override", () => {
      const result = resolveClaudeCommand({
        platform: "darwin",
        env: { SENTIPH_CLAUDE_PATH: "/opt/claude/bin/claude", PATH: "/usr/bin" },
        fileExists: () => false,
      });
      expect(result).toBe("/opt/claude/bin/claude");
    });

    it("quotes an override that contains spaces", () => {
      const result = resolveClaudeCommand({
        platform: "linux",
        env: { SENTIPH_CLAUDE_PATH: "/opt/my claude/claude" },
      });
      expect(result).toBe('"/opt/my claude/claude"');
    });
  });

  describe("Windows", () => {
    it("resolves to claude.cmd and NEVER claude.ps1 (the reported failure)", () => {
      const dir = "C:\\Users\\dev\\AppData\\Roaming\\npm";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: dir },
        // Both the .ps1 shim and the .cmd wrapper exist on disk; cmd.exe would
        // pick the un-runnable .ps1, but the resolver must pick the .cmd.
        fileExists: winFileExists([
          winPath.join(dir, "claude.ps1"),
          winPath.join(dir, "claude.cmd"),
        ]),
      });
      expect(result).toBe(winPath.join(dir, "claude.cmd"));
    });

    it("never resolves to the extensionless bash shim", () => {
      const dir = "C:\\tools\\bin";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: dir },
        // Only the extensionless shim exists — cmd.exe cannot run it.
        fileExists: winFileExists([winPath.join(dir, "claude")]),
      });
      expect(result).toBe("claude"); // falls back to bare word, not the shim path
    });

    it("prefers .exe over .cmd when both exist (cmd.exe PATHEXT order)", () => {
      const dir = "C:\\tools\\bin";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: dir },
        fileExists: winFileExists([
          winPath.join(dir, "claude.exe"),
          winPath.join(dir, "claude.cmd"),
        ]),
      });
      expect(result).toBe(winPath.join(dir, "claude.exe"));
    });

    it("searches PATH directories in order and returns the first match", () => {
      const dir1 = "C:\\empty";
      const dir2 = "C:\\Users\\dev\\AppData\\Roaming\\npm";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: `${dir1};${dir2}` },
        fileExists: winFileExists([winPath.join(dir2, "claude.cmd")]),
      });
      expect(result).toBe(winPath.join(dir2, "claude.cmd"));
    });

    it("quotes a resolved path that contains spaces", () => {
      const dir = "C:\\Program Files\\nodejs";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: dir },
        fileExists: winFileExists([winPath.join(dir, "claude.cmd")]),
      });
      expect(result).toBe(`"${winPath.join(dir, "claude.cmd")}"`);
    });

    it("falls back to the bare word when nothing is found on PATH", () => {
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: "C:\\nope;C:\\also-nope" },
        fileExists: () => false,
      });
      expect(result).toBe("claude");
    });

    it("strips surrounding quotes and whitespace from PATH entries", () => {
      const dir = "C:\\Users\\dev\\AppData\\Roaming\\npm";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { Path: `  "${dir}" ;` },
        fileExists: winFileExists([winPath.join(dir, "claude.cmd")]),
      });
      expect(result).toBe(winPath.join(dir, "claude.cmd"));
    });

    it("reads PATH when Path is absent (env spelling fallback)", () => {
      const dir = "C:\\tools";
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { PATH: dir },
        fileExists: winFileExists([winPath.join(dir, "claude.exe")]),
      });
      expect(result).toBe(winPath.join(dir, "claude.exe"));
    });

    it("honors SENTIPH_CLAUDE_PATH override and quotes spaces", () => {
      const result = resolveClaudeCommand({
        platform: "win32",
        env: { SENTIPH_CLAUDE_PATH: "C:\\custom path\\claude.cmd", Path: "C:\\ignored" },
        fileExists: () => true,
      });
      expect(result).toBe('"C:\\custom path\\claude.cmd"');
    });
  });
});

describe("buildBootstrapCommand with a resolved claudeExecutable", () => {
  it("uses the quoted path as a single head token for a worker, preserving base flags", () => {
    const exe = `"${winPath.join("C:\\Program Files\\nodejs", "claude.cmd")}"`;
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "t1",
      claudeExecutable: exe,
      claudeBootstrapFlags: ["--model", "claude-sonnet-4-6", "--session-id", "abc"],
    });
    expect(cmd).toBe(
      `${exe} --model claude-sonnet-4-6 --session-id abc --dangerously-skip-permissions`,
    );
  });

  it("injects the resolved executable into the Sentiph tentacle command", () => {
    const exe = '"C:\\npm\\claude.cmd"';
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "__sentiph__",
      claudeExecutable: exe,
      sentiphMcpConfigPath: "/tmp/mcp.json",
    });
    expect(cmd.startsWith(`${exe} `)).toBe(true);
    expect(cmd).toContain('--mcp-config "/tmp/mcp.json"');
    expect(cmd).toContain("--dangerously-skip-permissions");
  });

  it("injects the resolved executable for a group leader alongside --mcp-config", () => {
    const exe = '"C:\\npm\\claude.cmd"';
    const cmd = buildBootstrapCommand({
      provider: "claude-code",
      tentacleId: "t1",
      isGroupLeader: true,
      claudeExecutable: exe,
      sentiphMcpConfigPath: "/tmp/mcp.json",
      claudeBootstrapFlags: ["--resume", "uuid-here"],
    });
    expect(cmd.startsWith(`${exe} `)).toBe(true);
    expect(cmd).toContain("--resume uuid-here");
    expect(cmd).toContain('--mcp-config "/tmp/mcp.json"');
    expect(cmd).toContain("--dangerously-skip-permissions");
  });

  it("preserves the bare `claude` default when no executable is injected", () => {
    const cmd = buildBootstrapCommand({ provider: "claude-code", tentacleId: "__sentiph__" });
    expect(cmd).toBe("claude --dangerously-skip-permissions");
  });
});
