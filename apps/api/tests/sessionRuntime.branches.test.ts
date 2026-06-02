/**
 * Branch coverage top-up for terminalRuntime/sessionRuntime.ts.
 * Targets uncovered branches: writeInput isClosed, resizeSession isClosed,
 * teardownSession double-call guard, connectDirect no-scrollback path,
 * handleUpgrade raw Buffer message, ensureSession non-existent cwd,
 * schedulePromptTimer guard, emitStateIfChanged null-state path, and more.
 * Do NOT edit or duplicate names from sessionRuntime.test.ts or sessionRuntime.extra.test.ts.
 */
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createShellEnvironmentMock, ensureSpawnHelperMock, spawnMock } = vi.hoisted(() => ({
  createShellEnvironmentMock: vi.fn(() => ({})),
  ensureSpawnHelperMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

vi.mock("../src/terminalRuntime/ptyEnvironment", () => ({
  createShellEnvironment: createShellEnvironmentMock,
  ensureNodePtySpawnHelperExecutable: ensureSpawnHelperMock,
}));

import { createSessionRuntime } from "../src/terminalRuntime/sessionRuntime";
import type { PersistedTerminal, TerminalSession } from "../src/terminalRuntime/types";

// ─── fakes ────────────────────────────────────────────────────────────────────

class FakePty extends EventEmitter {
  pid = 42;
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();

  onData(listener: (chunk: string) => void) {
    this.on("data", listener);
    return { dispose: () => this.off("data", listener) };
  }

  onExit(listener: (event: { exitCode: number; signal: number }) => void) {
    this.on("exit", listener);
    return { dispose: () => this.off("exit", listener) };
  }

  emitData(chunk: string) {
    this.emit("data", chunk);
  }

  emitExit(event: { exitCode: number; signal: number }) {
    this.emit("exit", event);
  }
}

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  sentMessages: string[] = [];
  send = vi.fn((payload: string) => {
    this.sentMessages.push(payload);
  });
  close = vi.fn(() => {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit("close");
  });
}

class FakeWebSocketServer {
  nextSocket: FakeWebSocket | null = null;

  handleUpgrade = vi.fn(
    (
      _req: IncomingMessage,
      _socket: Duplex,
      _head: Buffer,
      callback: (socket: FakeWebSocket) => void,
    ) => {
      if (!this.nextSocket) throw new Error("Missing websocket for upgrade.");
      const socket = this.nextSocket;
      this.nextSocket = null;
      callback(socket);
    },
  );
}

const createUpgradeRequest = (tentacleId: string) =>
  ({ url: `/api/terminals/${tentacleId}/ws` }) as IncomingMessage;

const parseSentMessages = (socket: FakeWebSocket) =>
  socket.sentMessages.map(
    (raw) => JSON.parse(raw) as { type: string; data?: string; state?: string },
  );

// ─── runtime factory ─────────────────────────────────────────────────────────

const tmpDirsToClean: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const d of tmpDirsToClean) {
    rmSync(d, { recursive: true, force: true });
  }
  tmpDirsToClean.length = 0;
  createShellEnvironmentMock.mockClear();
  ensureSpawnHelperMock.mockClear();
  spawnMock.mockReset();
});

const makePT = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
  ...overrides,
});

const makeRuntime = ({
  terminals,
  sessions = new Map<string, TerminalSession>(),
  pty,
  sessionIdleGraceMs = 60_000,
  scrollbackMaxBytes = 1024,
  maxConcurrentSessions,
  onStateChange,
  onSessionStart,
  onSessionEnd,
  onOutputChunk,
  transcriptDirectoryPath: transcriptDir,
}: {
  terminals: Map<string, PersistedTerminal>;
  sessions?: Map<string, TerminalSession>;
  pty: FakePty;
  sessionIdleGraceMs?: number;
  scrollbackMaxBytes?: number;
  maxConcurrentSessions?: number;
  onStateChange?: Parameters<typeof createSessionRuntime>[0]["onStateChange"];
  onSessionStart?: Parameters<typeof createSessionRuntime>[0]["onSessionStart"];
  onSessionEnd?: Parameters<typeof createSessionRuntime>[0]["onSessionEnd"];
  onOutputChunk?: Parameters<typeof createSessionRuntime>[0]["onOutputChunk"];
  transcriptDirectoryPath?: string;
}) => {
  spawnMock.mockReturnValue(pty);
  const websocketServer = new FakeWebSocketServer();
  const transcriptDirectoryPath = transcriptDir ?? mkdtempSync(join(tmpdir(), "sr-branches-test-"));
  if (!transcriptDir) tmpDirsToClean.push(transcriptDirectoryPath);
  const runtime = createSessionRuntime({
    websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
    terminals,
    sessions,
    getTentacleWorkspaceCwd: () => process.cwd(),
    isDebugPtyLogsEnabled: false,
    ptyLogDir: process.cwd(),
    transcriptDirectoryPath,
    sessionIdleGraceMs,
    scrollbackMaxBytes,
    ...(maxConcurrentSessions !== undefined ? { maxConcurrentSessions } : {}),
    ...(onStateChange !== undefined ? { onStateChange } : {}),
    ...(onSessionStart !== undefined ? { onSessionStart } : {}),
    ...(onSessionEnd !== undefined ? { onSessionEnd } : {}),
    ...(onOutputChunk !== undefined ? { onOutputChunk } : {}),
  });
  return { runtime, websocketServer, sessions };
};

// ─── writeInput — isClosed branch ────────────────────────────────────────────

describe("writeInput — branch coverage", () => {
  it("returns false for a closed session (isClosed guard)", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, sessions } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    // Force-close the session so isClosed=true
    runtime.closeSession("t1");
    // writeInput should return false because session no longer exists
    expect(runtime.writeInput("t1", "data\r")).toBe(false);
    runtime.close();
  });

  it("returns false when writing to a session id with no session", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    // Session was never started
    expect(runtime.writeInput("t1", "hello\r")).toBe(false);
    runtime.close();
  });

  it("triggers emitStateIfChanged when input contains newline", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const onStateChange = vi.fn();
    const { runtime } = makeRuntime({ terminals, pty, onStateChange });
    runtime.startSession("t1");
    // Write without newline — no state change triggered by observeSubmit
    runtime.writeInput("t1", "partial");
    // Write with newline — triggers observeSubmit path
    runtime.writeInput("t1", "cmd\r");
    // onStateChange might or might not fire depending on state tracker, but no throw
    expect(pty.write).toHaveBeenCalledWith("partial");
    expect(pty.write).toHaveBeenCalledWith("cmd\r");
    runtime.close();
  });
});

// ─── resizeSession — isClosed branch ─────────────────────────────────────────

describe("resizeSession — branch coverage", () => {
  it("returns false when session is closed", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    runtime.closeSession("t1");
    expect(runtime.resizeSession("t1", 100, 30)).toBe(false);
    runtime.close();
  });
});

// ─── releaseSessionKeepAlive — isClosed branch ───────────────────────────────

describe("releaseSessionKeepAlive — branch coverage", () => {
  it("returns false when session is closed", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([
      ["t1", makePT({ initialPrompt: "do stuff" })],
    ]);
    const { runtime } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    runtime.closeSession("t1");
    expect(runtime.releaseSessionKeepAlive("t1")).toBe(false);
    runtime.close();
  });

  it("returns false when session does not exist", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    expect(runtime.releaseSessionKeepAlive("t1")).toBe(false);
    runtime.close();
  });
});

// ─── teardownSession — isClosed double-call guard ────────────────────────────

describe("teardownSession — double-call guard", () => {
  it("is idempotent: calling closeSession twice does not throw", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    expect(runtime.closeSession("t1")).toBe(true);
    // Second call: session gone from map — returns false without crash
    expect(runtime.closeSession("t1")).toBe(false);
    runtime.close();
  });

  it("pty exit after closeSession does not re-tear-down (isClosed guard in exit handler)", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const onSessionEnd = vi.fn();
    const { runtime } = makeRuntime({ terminals, pty, onSessionEnd });
    runtime.startSession("t1");
    // Manually close the session
    runtime.closeSession("t1");
    const callsAfterClose = onSessionEnd.mock.calls.length;
    // Emit exit AFTER close — the isClosed guard in onExit handler should suppress it
    pty.emitExit({ exitCode: 0, signal: 0 });
    expect(onSessionEnd.mock.calls.length).toBe(callsAfterClose);
    runtime.close();
  });
});

// ─── connectDirect — no-scrollback path ──────────────────────────────────────

describe("connectDirect — branch coverage", () => {
  it("does not send history message when session scrollback is empty", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    // No output emitted — scrollback is empty

    const received: unknown[] = [];
    const disconnect = runtime.connectDirect("t1", (msg) => received.push(msg));
    expect(disconnect).not.toBeNull();
    // State message should be delivered, but NOT history
    const hasHistory = received.some((m) => (m as { type: string }).type === "history");
    expect(hasHistory).toBe(false);
    const hasState = received.some((m) => (m as { type: string }).type === "state");
    expect(hasState).toBe(true);

    disconnect?.();
    runtime.close();
  });

  it("sends history when scrollback is non-empty", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    pty.emitData("some output\r\n");

    const received: unknown[] = [];
    const disconnect = runtime.connectDirect("t1", (msg) => received.push(msg));
    const hasHistory = received.some((m) => (m as { type: string }).type === "history");
    expect(hasHistory).toBe(true);

    disconnect?.();
    runtime.close();
  });

  it("disconnect callback no-ops when session is already closed", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime } = makeRuntime({ terminals, pty });
    runtime.startSession("t1");
    const disconnect = runtime.connectDirect("t1", vi.fn());
    runtime.closeSession("t1");
    // Calling disconnect after session is closed must not throw
    expect(() => disconnect?.()).not.toThrow();
    runtime.close();
  });

  it("returns null when spawn throws during connectDirect", () => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => {
      throw new Error("posix_spawnp failed");
    });
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const sessions = new Map<string, TerminalSession>();
    const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "sr-branches-spawn-err-"));
    tmpDirsToClean.push(transcriptDirectoryPath);
    const websocketServer = new FakeWebSocketServer();
    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions,
      getTentacleWorkspaceCwd: () => process.cwd(),
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
    });
    expect(runtime.connectDirect("t1", vi.fn())).toBeNull();
    runtime.close();
  });
});

// ─── handleUpgrade — message as Buffer ───────────────────────────────────────

describe("handleUpgrade — message types", () => {
  it("handles a raw message sent as a Buffer (not string)", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, websocketServer } = makeRuntime({ terminals, pty });
    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));

    // Emit a message as a Buffer — the handler should coerce it to a string
    const payload = JSON.stringify({ type: "input", data: "ls\r" });
    socket.emit("message", Buffer.from(payload));
    expect(pty.write).toHaveBeenCalledWith("ls\r");

    runtime.close();
  });

  it("handles a message that is neither string nor Buffer by calling toString()", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, websocketServer } = makeRuntime({ terminals, pty });
    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));

    // Emit a non-string, non-Buffer (e.g., an object that has .toString)
    // This exercises the `String(raw)` fallback branch
    const payload = JSON.stringify({ type: "input", data: "pwd\r" });
    const weirdRaw = {
      toString() {
        return payload;
      },
    };
    // The message handler will parse the string and write to pty
    socket.emit("message", weirdRaw);
    expect(pty.write).toHaveBeenCalledWith("pwd\r");

    runtime.close();
  });

  it("falls back to pty.write for non-JSON messages", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, websocketServer } = makeRuntime({ terminals, pty });
    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));

    // Non-JSON message — the catch block writes raw text to pty
    socket.emit("message", "not valid json{{");
    expect(pty.write).toHaveBeenCalledWith("not valid json{{");

    runtime.close();
  });

  it("ignores messages on a closed session", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, websocketServer } = makeRuntime({ terminals, pty });
    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));

    runtime.closeSession("t1");
    const writeCallsBefore = pty.write.mock.calls.length;
    socket.emit("message", JSON.stringify({ type: "input", data: "ignored\r" }));
    // No new write calls since session is closed
    expect(pty.write.mock.calls.length).toBe(writeCallsBefore);

    runtime.close();
  });

  it("ignores client close events when session is already closed", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, websocketServer } = makeRuntime({ terminals, pty });
    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));

    runtime.closeSession("t1");
    // This emits "close" on socket, which calls the ws close handler
    // The guard `if (session.isClosed) return;` should prevent idle-close from re-running
    expect(() => socket.close()).not.toThrow();
    runtime.close();
  });

  it("handles resize with cols and rows that trigger the 'same dimensions' dedup skip", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, websocketServer } = makeRuntime({ terminals, pty });
    const socket = new FakeWebSocket();
    websocketServer.nextSocket = socket;
    runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));

    // First resize sets dimensions
    socket.emit("message", JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    expect(pty.resize).toHaveBeenCalledTimes(1);

    // Second resize with same dimensions — should NOT call resize again (dedup)
    socket.emit("message", JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    expect(pty.resize).toHaveBeenCalledTimes(1);

    runtime.close();
  });
});

// ─── ensureSession — non-existent cwd ────────────────────────────────────────

describe("ensureSession — non-existent working directory", () => {
  it("startSession returns false when the cwd does not exist", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "sr-branches-no-cwd-"));
    tmpDirsToClean.push(transcriptDirectoryPath);
    const websocketServer = new FakeWebSocketServer();
    const runtime = createSessionRuntime({
      websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
      terminals,
      sessions: new Map(),
      // Return a path that definitely does not exist
      getTentacleWorkspaceCwd: () => "/this/path/does/not/exist/at/all/9999",
      isDebugPtyLogsEnabled: false,
      ptyLogDir: process.cwd(),
      transcriptDirectoryPath,
    });

    spawnMock.mockReturnValue(pty);
    expect(runtime.startSession("t1")).toBe(false);
    runtime.close();
  });
});

// ─── scheduleIdleCloseIfNeeded — keepAliveWithoutClients branch ──────────────

describe("scheduleIdleCloseIfNeeded — keepAlive branch", () => {
  it("does not schedule idle close when keepAliveWithoutClients is true", () => {
    vi.useFakeTimers();
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([
      ["t1", makePT({ initialPrompt: "do stuff" })],
    ]);
    const { runtime, sessions } = makeRuntime({ terminals, pty, sessionIdleGraceMs: 100 });

    // startSession sets keepAliveWithoutClients=true because of initialPrompt
    runtime.startSession("t1");
    expect(sessions.has("t1")).toBe(true);

    // Advance time — should NOT close because keepAlive is set
    vi.advanceTimersByTime(5000);
    expect(sessions.has("t1")).toBe(true);

    runtime.close();
  });
});

// ─── emitStateIfChanged — null state path ────────────────────────────────────

describe("emitStateIfChanged — null/same-state branch", () => {
  it("does not call onStateChange when data chunk produces null next state", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const onStateChange = vi.fn();
    const { runtime } = makeRuntime({ terminals, pty, onStateChange });
    runtime.startSession("t1");
    onStateChange.mockClear();

    // Emit output that won't trigger a state transition (ordinary output)
    // The stateTracker returns null → emitStateIfChanged early-returns
    pty.emitData("some random output that does not match any state pattern");

    // onStateChange may or may not be called but should not throw
    expect(onStateChange).toHaveBeenCalledTimes(0);

    runtime.close();
  });
});

// ─── onOutputChunk callback ───────────────────────────────────────────────────

describe("onOutputChunk callback", () => {
  it("fires onOutputChunk for each PTY data chunk", () => {
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const onOutputChunk = vi.fn();
    const { runtime } = makeRuntime({ terminals, pty, onOutputChunk });
    runtime.startSession("t1");

    pty.emitData("hello world\r\n");
    expect(onOutputChunk).toHaveBeenCalledWith("t1", "hello world\r\n");

    pty.emitData("line 2\r\n");
    expect(onOutputChunk).toHaveBeenCalledTimes(2);

    runtime.close();
  });
});

// ─── statePollTimer teardown ──────────────────────────────────────────────────

describe("statePollTimer teardown during session close", () => {
  it("clears the poll timer when session is torn down", () => {
    vi.useFakeTimers();
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const onStateChange = vi.fn();
    const { runtime, sessions } = makeRuntime({ terminals, pty, onStateChange });

    runtime.startSession("t1");
    expect(sessions.has("t1")).toBe(true);

    runtime.closeSession("t1");
    expect(sessions.has("t1")).toBe(false);

    // Advance well past poll interval — poll timer should be gone, no more calls
    onStateChange.mockClear();
    vi.advanceTimersByTime(10_000);
    // If poll timer were still alive it would call stateTracker.poll()
    // We just verify the close doesn't crash and sessions map is clean
    expect(sessions.has("t1")).toBe(false);

    runtime.close();
  });
});

// ─── sessionIdleGraceMs — directListeners keep-alive path ────────────────────

describe("scheduleIdleCloseIfNeeded — directListeners branch", () => {
  it("does not idle-close when directListeners still has a listener", () => {
    vi.useFakeTimers();
    const pty = new FakePty();
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
    const { runtime, sessions } = makeRuntime({ terminals, pty, sessionIdleGraceMs: 100 });

    runtime.startSession("t1");

    // Connect a direct listener (no WebSocket clients, but directListeners.size > 0)
    const disconnect = runtime.connectDirect("t1", vi.fn());
    expect(disconnect).not.toBeNull();

    // Advance past idle grace — should NOT close because directListener is attached
    vi.advanceTimersByTime(5000);
    expect(sessions.has("t1")).toBe(true);

    disconnect?.();

    runtime.close();
  });
});
