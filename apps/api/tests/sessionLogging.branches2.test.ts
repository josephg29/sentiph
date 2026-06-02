/**
 * Additional branch coverage for src/terminalRuntime/sessionLogging.ts
 * Targets uncovered branches: else-path for isDebugPtyLogsEnabled,
 * if-path for !transcriptDirectoryPath, if-path for !session.transcriptLog,
 * plus exitSignalFields edge cases.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendDebugLog,
  appendTranscriptEvent,
  createDebugLog,
  exitSignalFields,
  openTranscriptLog,
  resolveEndedAt,
  resolveSessionEndReason,
} from "../src/terminalRuntime/sessionLogging";
import type { TerminalSession } from "../src/terminalRuntime/types";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-sl-test-"));
  tempDirs.push(dir);
  return dir;
};

// Minimal fake TerminalSession — only fields sessionLogging cares about
const makeSession = (overrides: Partial<TerminalSession> = {}): TerminalSession =>
  ({
    terminalId: "t1",
    tentacleId: "t1",
    clients: new Set(),
    directListeners: new Set(),
    cols: 80,
    rows: 24,
    agentState: "idle",
    agentStateChangedAt: 0,
    stateTracker: {} as never,
    isBootstrapCommandSent: false,
    scrollbackChunks: [],
    scrollbackBytes: 0,
    pty: {} as never,
    transcriptLog: undefined,
    transcriptEventCount: undefined,
    debugLog: undefined,
    ...overrides,
  }) as TerminalSession;

// ---------------------------------------------------------------------------
// createDebugLog — else path (isDebugPtyLogsEnabled = false)
// ---------------------------------------------------------------------------
describe("createDebugLog — branches2", () => {
  it("returns undefined when isDebugPtyLogsEnabled is false (else path)", () => {
    const result = createDebugLog("session-1", false, "/tmp/logs");
    expect(result).toBeUndefined();
  });

  it("creates a write stream when isDebugPtyLogsEnabled is true", async () => {
    const dir = makeTempDir();
    const stream = createDebugLog("session-2", true, dir);
    expect(stream).toBeDefined();
    // Close the stream properly to avoid unhandled ENOENT errors after temp dir cleanup
    if (stream) {
      await new Promise<void>((resolve) => {
        stream.on("error", () => resolve());
        stream.end(resolve);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// openTranscriptLog — if path (!transcriptDirectoryPath)
// ---------------------------------------------------------------------------
describe("openTranscriptLog — branches2", () => {
  it("returns undefined when transcriptDirectoryPath is undefined", () => {
    const result = openTranscriptLog("session-1", undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when transcriptDirectoryPath is empty string (falsy)", () => {
    const result = openTranscriptLog("session-1", "");
    expect(result).toBeUndefined();
  });

  it("returns a path string when transcriptDirectoryPath is valid", () => {
    const dir = makeTempDir();
    const result = openTranscriptLog("session-abc", dir);
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result).toContain("session-abc");
  });
});

// ---------------------------------------------------------------------------
// appendTranscriptEvent — if path (!session.transcriptLog)
// ---------------------------------------------------------------------------
describe("appendTranscriptEvent — branches2", () => {
  it("does nothing (returns undefined) when session has no transcriptLog", () => {
    const session = makeSession({ transcriptLog: undefined });
    // Should not throw
    appendTranscriptEvent(session, { type: "test", value: 1 });
    expect(session.transcriptEventCount).toBeUndefined();
  });

  it("increments transcriptEventCount when transcriptLog is set", () => {
    const dir = makeTempDir();
    const logPath = join(dir, "test.jsonl");
    const session = makeSession({ transcriptLog: logPath });
    appendTranscriptEvent(session, { type: "test", value: 1 });
    expect(session.transcriptEventCount).toBe(1);
    appendTranscriptEvent(session, { type: "test", value: 2 });
    expect(session.transcriptEventCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// appendDebugLog — coverage of the ?.write call
// ---------------------------------------------------------------------------
describe("appendDebugLog — branches2", () => {
  it("does nothing when session has no debugLog", () => {
    const session = makeSession({ debugLog: undefined });
    // Should not throw
    appendDebugLog(session, "some line");
  });
});

// ---------------------------------------------------------------------------
// resolveSessionEndReason
// ---------------------------------------------------------------------------
describe("resolveSessionEndReason — branches2", () => {
  it("returns 'pty_exit' for 'pty_exit'", () => {
    expect(resolveSessionEndReason("pty_exit")).toBe("pty_exit");
  });

  it("returns 'operator_stop' for 'operator_stop'", () => {
    expect(resolveSessionEndReason("operator_stop")).toBe("operator_stop");
  });

  it("returns 'operator_kill' for 'operator_kill'", () => {
    expect(resolveSessionEndReason("operator_kill")).toBe("operator_kill");
  });

  it("returns 'session_close' for any unrecognized reason", () => {
    expect(resolveSessionEndReason("some_other_reason")).toBe("session_close");
    expect(resolveSessionEndReason("")).toBe("session_close");
  });
});

// ---------------------------------------------------------------------------
// resolveEndedAt
// ---------------------------------------------------------------------------
describe("resolveEndedAt — branches2", () => {
  it("returns the timestamp string when it is a string", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    expect(resolveEndedAt(ts)).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// exitSignalFields — branch coverage
// ---------------------------------------------------------------------------
describe("exitSignalFields — branches2", () => {
  it("returns empty object when no exitCode or signal", () => {
    const result = exitSignalFields({
      type: "session_end",
      reason: "pty_exit",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(result).toEqual({});
  });

  it("includes exitCode when it is a number", () => {
    const result = exitSignalFields({
      type: "session_end",
      reason: "pty_exit",
      timestamp: "2026-01-01T00:00:00.000Z",
      exitCode: 0,
    });
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeUndefined();
  });

  it("includes signal when it is a number", () => {
    const result = exitSignalFields({
      type: "session_end",
      reason: "pty_exit",
      timestamp: "2026-01-01T00:00:00.000Z",
      signal: 15,
    });
    expect(result.signal).toBe(15);
  });

  it("includes signal when it is a string", () => {
    const result = exitSignalFields({
      type: "session_end",
      reason: "pty_exit",
      timestamp: "2026-01-01T00:00:00.000Z",
      signal: "SIGTERM",
    });
    expect(result.signal).toBe("SIGTERM");
  });

  it("includes both exitCode and signal", () => {
    const result = exitSignalFields({
      type: "session_end",
      reason: "pty_exit",
      timestamp: "2026-01-01T00:00:00.000Z",
      exitCode: 1,
      signal: "SIGHUP",
    });
    expect(result.exitCode).toBe(1);
    expect(result.signal).toBe("SIGHUP");
  });
});
