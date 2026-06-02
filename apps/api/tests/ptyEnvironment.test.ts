/**
 * Branch coverage tests for terminalRuntime/ptyEnvironment.ts.
 * Tests createShellEnvironment and ensureNodePtySpawnHelperExecutable edge paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoist mocks so they are available before module initialization.
const { existsSyncMock, statSyncMock, chmodSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(() => false),
  statSyncMock: vi.fn(() => ({ mode: 0o644 })),
  chmodSyncMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    existsSync: existsSyncMock,
    statSync: statSyncMock,
    chmodSync: chmodSyncMock,
  };
});

import {
  createShellEnvironment,
  ensureNodePtySpawnHelperExecutable,
} from "../src/terminalRuntime/ptyEnvironment";

afterEach(() => {
  vi.restoreAllMocks();
  existsSyncMock.mockReset();
  statSyncMock.mockReset();
  chmodSyncMock.mockReset();
});

// ─── createShellEnvironment ────────────────────────────────────────────────────

describe("createShellEnvironment", () => {
  it("returns an env object with TERM and COLORTERM always set", () => {
    const env = createShellEnvironment();
    expect(env.TERM).toBe("xterm-256color");
    expect(env.COLORTERM).toBe("truecolor");
    expect(env.TMOUT).toBe("0");
  });

  it("does not set SENTIPH_SESSION_ID when sentiphSessionId is omitted", () => {
    const env = createShellEnvironment();
    expect(env.SENTIPH_SESSION_ID).toBeUndefined();
  });

  it("sets SENTIPH_SESSION_ID when sentiphSessionId is provided", () => {
    const env = createShellEnvironment({ sentiphSessionId: "sess-abc" });
    expect(env.SENTIPH_SESSION_ID).toBe("sess-abc");
  });

  it("does not set MAX_THINKING_TOKENS when maxThinkingTokens is omitted", () => {
    const env = createShellEnvironment();
    expect(env.MAX_THINKING_TOKENS).toBeUndefined();
  });

  it("sets MAX_THINKING_TOKENS when maxThinkingTokens is a positive finite number", () => {
    const env = createShellEnvironment({ maxThinkingTokens: 10000 });
    expect(env.MAX_THINKING_TOKENS).toBe("10000");
  });

  it("clamps negative maxThinkingTokens to 0", () => {
    const env = createShellEnvironment({ maxThinkingTokens: -500 });
    expect(env.MAX_THINKING_TOKENS).toBe("0");
  });

  it("floors fractional maxThinkingTokens", () => {
    const env = createShellEnvironment({ maxThinkingTokens: 7.9 });
    expect(env.MAX_THINKING_TOKENS).toBe("7");
  });

  it("does not set MAX_THINKING_TOKENS when maxThinkingTokens is Infinity (not finite)", () => {
    // Infinity is not finite — the guard should skip it
    const env = createShellEnvironment({ maxThinkingTokens: Number.POSITIVE_INFINITY });
    expect(env.MAX_THINKING_TOKENS).toBeUndefined();
  });

  it("does not set MAX_THINKING_TOKENS when maxThinkingTokens is NaN", () => {
    const env = createShellEnvironment({ maxThinkingTokens: Number.NaN });
    expect(env.MAX_THINKING_TOKENS).toBeUndefined();
  });

  it("copies string-valued process.env entries", () => {
    const original = process.env.HOME;
    if (original !== undefined) {
      const env = createShellEnvironment();
      expect(env.HOME).toBe(original);
    }
  });

  it("does not copy undefined process.env entries", () => {
    const env = createShellEnvironment();
    for (const [, value] of Object.entries(env)) {
      expect(typeof value).toBe("string");
    }
  });

  it("options object with no keys does not crash", () => {
    expect(() => createShellEnvironment({})).not.toThrow();
  });
});

// ─── ensureNodePtySpawnHelperExecutable ───────────────────────────────────────

describe("ensureNodePtySpawnHelperExecutable", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("returns early on win32 without calling existsSync", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    ensureNodePtySpawnHelperExecutable();
    expect(existsSyncMock).not.toHaveBeenCalled();
  });

  it("skips chmod when all helper paths do not exist (existsSync returns false)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    // node-pty is installed in this repo so require.resolve will succeed.
    // existsSync returns false for every candidate — no chmod should happen.
    existsSyncMock.mockReturnValue(false);

    ensureNodePtySpawnHelperExecutable();
    expect(chmodSyncMock).not.toHaveBeenCalled();
  });

  it("skips chmod when helper exists but already has execute bits set (mode 0o755)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ mode: 0o755 });

    ensureNodePtySpawnHelperExecutable();
    expect(chmodSyncMock).not.toHaveBeenCalled();
  });

  it("calls chmodSync when helper exists but lacks execute bit (mode 0o644)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ mode: 0o644 });

    ensureNodePtySpawnHelperExecutable();
    expect(chmodSyncMock).toHaveBeenCalled();
    const [, newMode] = chmodSyncMock.mock.calls[0] as [string, number];
    expect((newMode & 0o111) !== 0).toBe(true);
  });

  it("does not throw when statSync throws unexpectedly", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockImplementation(() => {
      throw new Error("EACCES permission denied");
    });

    expect(() => ensureNodePtySpawnHelperExecutable()).not.toThrow();
  });
});
