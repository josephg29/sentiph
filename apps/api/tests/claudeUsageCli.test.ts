/**
 * tests/claudeUsageCli.test.ts
 *
 * Covers claudeUsageCli.ts:
 *  - spawnDefaultCliUsage (the exported function)
 *  - resolveClaudeBinary (indirectly, by mocking execFileSync)
 *  - scrubbedEnv (indirectly — env keys are filtered at pty spawn)
 *  - spawnCliAndCapture (via node-pty mock)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Hoist mocks — must be declared before any imports that use them
// --------------------------------------------------------------------------

const { mockExecFileSync } = vi.hoisted(() => {
  const mockExecFileSync = vi.fn<typeof import("node:child_process").execFileSync>();
  return { mockExecFileSync };
});

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
  spawn: vi.fn(),
}));

const { mockPtySpawn } = vi.hoisted(() => {
  const mockPtySpawn = vi.fn();
  return { mockPtySpawn };
});

vi.mock("node-pty", () => ({
  spawn: mockPtySpawn,
}));

// --------------------------------------------------------------------------
// Import the module under test ONCE at the top level
// (no vi.resetModules — that would break the hoisted vi.mock references)
// --------------------------------------------------------------------------

import { spawnDefaultCliUsage } from "../src/claudeUsageCli";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// Wait for the dynamic import("node-pty").then(...) inside spawnCliAndCapture
// to complete and attach listeners to the terminal object.
const waitForPtyInit = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

type DataListener = (data: string) => void;
type ExitListener = () => void;

const makeTerminal = () => {
  const dataListeners: DataListener[] = [];
  const exitListeners: ExitListener[] = [];

  const term = {
    onData: (cb: DataListener) => {
      dataListeners.push(cb);
    },
    onExit: (cb: ExitListener) => {
      exitListeners.push(cb);
    },
    write: vi.fn(),
    kill: vi.fn(),
    /** Emit data to all onData listeners. */
    _emit: (data: string) => {
      for (const cb of dataListeners) cb(data);
    },
    /** Simulate pty process exit. */
    _exit: () => {
      for (const cb of exitListeners) cb();
    },
  };

  return term;
};

afterEach(() => {
  vi.clearAllMocks();
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("spawnDefaultCliUsage", () => {
  it("returns null when 'which claude' fails (binary not found)", async () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error("which: no claude in PATH");
    });

    const result = await spawnDefaultCliUsage();

    expect(result).toBeNull();
    expect(mockPtySpawn).not.toHaveBeenCalled();
  });

  it("returns null when 'which claude' returns empty string", async () => {
    mockExecFileSync.mockReturnValueOnce("" as unknown as ReturnType<typeof mockExecFileSync>);

    const result = await spawnDefaultCliUsage();

    expect(result).toBeNull();
    expect(mockPtySpawn).not.toHaveBeenCalled();
  });

  it("returns null when pty exits without any output", async () => {
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    // Wait for the dynamic import(..).then() to run and attach listeners
    await waitForPtyInit();

    // Exit with no data — both buffers are empty, so finish(null)
    term._exit();

    const result = await promise;
    expect(result).toBeNull();
  });

  it("returns the buffer when pty exits with data in waiting phase", async () => {
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();

    // Emit buffer data while in "waiting" phase (no ready needle)
    term._emit("some cli output that is not a ready needle");
    term._exit();

    const result = await promise;
    // buffer has content; usageBuffer is empty — returns buffer
    expect(result).toBe("some cli output that is not a ready needle");
  });

  it("handles trust prompt by writing 'y' when 'doyoutrust' appears in collapsed output", async () => {
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();

    // Emit trust prompt — collapses to include "doyoutrust"
    term._emit("Do you trust this directory?");

    // Give the onData handler time to write
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(term.write).toHaveBeenCalledWith("y\r");

    term._exit();
    await promise;
  });

  it("respects CLAUDECODE env scrubbing — does not pass CLAUDECODE or ANTHROPIC_ keys to pty", async () => {
    const origClaudecode = process.env.CLAUDECODE;
    const origAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDECODE = "1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();
    term._exit();
    await promise;

    expect(mockPtySpawn).toHaveBeenCalledOnce();
    const spawnOptions = mockPtySpawn.mock.calls[0]?.[2] as { env?: Record<string, string> };
    expect(spawnOptions.env?.CLAUDECODE).toBeUndefined();
    expect(spawnOptions.env?.ANTHROPIC_API_KEY).toBeUndefined();

    // Restore
    if (origClaudecode === undefined) {
      process.env.CLAUDECODE = undefined;
    } else {
      process.env.CLAUDECODE = origClaudecode;
    }
    if (origAnthropicKey === undefined) {
      process.env.ANTHROPIC_API_KEY = undefined;
    } else {
      process.env.ANTHROPIC_API_KEY = origAnthropicKey;
    }
  });

  it("passes binary path and --allowed-tools args to pty spawn", async () => {
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();
    term._exit();
    await promise;

    expect(mockPtySpawn).toHaveBeenCalledWith(
      "/usr/local/bin/claude",
      ["--allowed-tools", ""],
      expect.objectContaining({ name: "xterm-256color" }),
    );
  });

  it("uses 160 cols and 50 rows for the pty", async () => {
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();
    term._exit();
    await promise;

    const spawnOptions = mockPtySpawn.mock.calls[0]?.[2] as { cols?: number; rows?: number };
    expect(spawnOptions.cols).toBe(160);
    expect(spawnOptions.rows).toBe(50);
  });

  it("handles write throwing (pty dead) in capturing phase — resolves null", async () => {
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    // write throws every time
    term.write.mockImplementation(() => {
      throw new Error("pty is dead");
    });
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();

    // Trigger ready state — schedules sendUsageCommand via setTimeout(delay)
    // Once the delay fires, write() throws and finish(null) is called
    term._emit("Tips for getting started");

    // Wait past the CLI_PTY_READY_DELAY_MS (900ms)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await promise;
    expect(result).toBeNull();
  });

  it("resolves when pty exits with non-empty buffer (after waiting phase)", async () => {
    // This tests the path where pty exits with data in buffer but empty usageBuffer
    mockExecFileSync.mockReturnValueOnce(
      "/usr/local/bin/claude\n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();

    // Emit data twice (but no ready needle or stop needle), then exit
    term._emit("First chunk of output from CLI");
    term._emit(" second chunk");
    term._exit();

    const result = await promise;
    // buffer accumulated both chunks, usageBuffer is empty — returns buffer
    expect(result).toBe("First chunk of output from CLI second chunk");
  });
});

describe("resolveClaudeBinary (via spawnDefaultCliUsage)", () => {
  it("trims whitespace from which output before passing to pty spawn", async () => {
    // execFileSync returns path with surrounding whitespace (common for shell output)
    mockExecFileSync.mockReturnValueOnce(
      "  /usr/bin/claude  \n" as unknown as ReturnType<typeof mockExecFileSync>,
    );

    const term = makeTerminal();
    mockPtySpawn.mockReturnValueOnce(term);

    const promise = spawnDefaultCliUsage();

    await waitForPtyInit();
    term._exit();
    await promise;

    expect(mockPtySpawn).toHaveBeenCalledWith(
      "/usr/bin/claude",
      expect.any(Array),
      expect.any(Object),
    );
  }, 10000);
});
