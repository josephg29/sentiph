/**
 * Tests for terminalRuntime/mcpConfig.ts
 * Covers writeSentiphMcpConfig and writeSentiphSystemPrompt.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeSentiphMcpConfig, writeSentiphSystemPrompt } from "../src/terminalRuntime/mcpConfig";

// ─── helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sentiph-mcp-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── writeSentiphMcpConfig ────────────────────────────────────────────────────

describe("writeSentiphMcpConfig", () => {
  it("creates the config file at the expected path", () => {
    const configPath = writeSentiphMcpConfig(tmpDir);
    expect(configPath).toBe(join(tmpDir, "sentiph-mcp-config.json"));
    expect(existsSync(configPath)).toBe(true);
  });

  it("creates the state/ subdirectory", () => {
    writeSentiphMcpConfig(tmpDir);
    expect(existsSync(join(tmpDir, "state"))).toBe(true);
  });

  it("writes valid JSON containing an mcpServers.sentiph entry", () => {
    const configPath = writeSentiphMcpConfig(tmpDir);
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      mcpServers: { sentiph: { command: string; args: string[]; env: Record<string, string> } };
    };
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.sentiph).toBeDefined();
    expect(typeof parsed.mcpServers.sentiph.command).toBe("string");
    expect(Array.isArray(parsed.mcpServers.sentiph.args)).toBe(true);
    expect(parsed.mcpServers.sentiph.env.SENTIPH_API_ORIGIN).toBeDefined();
  });

  it("uses SENTIPH_API_ORIGIN env var when set", () => {
    const originalOrigin = process.env.SENTIPH_API_ORIGIN;
    process.env.SENTIPH_API_ORIGIN = "http://custom-origin:9999";
    try {
      const configPath = writeSentiphMcpConfig(tmpDir);
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as {
        mcpServers: { sentiph: { env: { SENTIPH_API_ORIGIN: string } } };
      };
      expect(parsed.mcpServers.sentiph.env.SENTIPH_API_ORIGIN).toBe("http://custom-origin:9999");
    } finally {
      if (originalOrigin === undefined) {
        // biome-ignore lint/performance/noDelete: restoring original env
        delete process.env.SENTIPH_API_ORIGIN;
      } else {
        process.env.SENTIPH_API_ORIGIN = originalOrigin;
      }
    }
  });

  it("falls back to default origin when SENTIPH_API_ORIGIN is not set", () => {
    const originalOrigin = process.env.SENTIPH_API_ORIGIN;
    // biome-ignore lint/performance/noDelete: need to unset for this test
    delete process.env.SENTIPH_API_ORIGIN;
    try {
      const configPath = writeSentiphMcpConfig(tmpDir);
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as {
        mcpServers: { sentiph: { env: { SENTIPH_API_ORIGIN: string } } };
      };
      expect(parsed.mcpServers.sentiph.env.SENTIPH_API_ORIGIN).toBe("http://127.0.0.1:8787");
    } finally {
      if (originalOrigin !== undefined) {
        process.env.SENTIPH_API_ORIGIN = originalOrigin;
      }
    }
  });

  it("sets file mode to 0o600 (owner read/write only)", () => {
    const configPath = writeSentiphMcpConfig(tmpDir);
    const stat = statSync(configPath);
    // Mask to the permission bits (ignoring file type bits)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("creates stateDir and ancestors even when they do not exist", () => {
    const nestedDir = join(tmpDir, "a", "b", "c");
    const configPath = writeSentiphMcpConfig(nestedDir);
    expect(existsSync(configPath)).toBe(true);
  });

  it("logs a warning and returns the path when write fails", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Use an impossible directory path that cannot be created
    // (on most systems a file path used as directory causes an error)
    const impossibleDir = join(tmpDir, "blocked");
    // Make a file at that path so mkdirSync will fail
    writeFileSync(impossibleDir, "not-a-dir");

    // writeSentiphMcpConfig must not throw; it catches write errors
    const resultPath = writeSentiphMcpConfig(impossibleDir);
    // Should return the intended config path regardless
    expect(resultPath).toBe(join(impossibleDir, "sentiph-mcp-config.json"));
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

// ─── writeSentiphSystemPrompt ─────────────────────────────────────────────────

describe("writeSentiphSystemPrompt", () => {
  it("creates the system prompt file and returns its path", () => {
    const promptPath = writeSentiphSystemPrompt(tmpDir);
    expect(promptPath).toBe(join(tmpDir, "sentiph-system-prompt.md"));
    expect(promptPath).toBeDefined();
    if (promptPath) {
      expect(existsSync(promptPath)).toBe(true);
    }
  });

  it("writes non-empty content to the prompt file", () => {
    const promptPath = writeSentiphSystemPrompt(tmpDir);
    if (promptPath) {
      const content = readFileSync(promptPath, "utf8");
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("sets file mode to 0o600", () => {
    const promptPath = writeSentiphSystemPrompt(tmpDir);
    if (promptPath) {
      const stat = statSync(promptPath);
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("returns undefined and logs a warning when write fails", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Place a file at the stateDir path so mkdirSync+writeFileSync fail
    const blockedPath = join(tmpDir, "blocked-prompt");
    writeFileSync(blockedPath, "not-a-dir");

    const result = writeSentiphSystemPrompt(blockedPath);
    expect(result).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("creates stateDir when it does not exist", () => {
    const newDir = join(tmpDir, "new-state-dir");
    const promptPath = writeSentiphSystemPrompt(newDir);
    expect(existsSync(newDir)).toBe(true);
    if (promptPath) {
      expect(existsSync(promptPath)).toBe(true);
    }
  });
});
