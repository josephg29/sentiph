/**
 * Supplementary sessionRuntime tests covering branches not addressed in
 * sessionRuntime.test.ts. Do NOT edit sessionRuntime.test.ts.
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

// ─── runtime factory helper ───────────────────────────────────────────────────

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
}) => {
  spawnMock.mockReturnValue(pty);
  const websocketServer = new FakeWebSocketServer();
  const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "sr-extra-test-"));
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
  return { runtime, websocketServer, sessions, transcriptDirectoryPath };
};

const makePT = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
  ...overrides,
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

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

// ─── tests ────────────────────────────────────────────────────────────────────

describe("createSessionRuntime (extra coverage)", () => {
  describe("handleUpgrade — edge paths", () => {
    it("returns false for a URL with no terminal id segment", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      const badRequest = { url: "/api/other/path" } as IncomingMessage;
      expect(runtime.handleUpgrade(badRequest, {} as Duplex, Buffer.alloc(0))).toBe(false);
      runtime.close();
    });

    it("returns false when terminal id is not in the registry", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>();
      const { runtime } = makeRuntime({ terminals, pty });
      expect(
        runtime.handleUpgrade(createUpgradeRequest("nonexistent"), {} as Duplex, Buffer.alloc(0)),
      ).toBe(false);
      runtime.close();
    });

    it("sends error output and closes websocket when spawn throws", () => {
      spawnMock.mockReset();
      spawnMock.mockImplementation(() => {
        throw new Error("posix_spawnp failed");
      });
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const sessions = new Map<string, TerminalSession>();
      const websocketServer = new FakeWebSocketServer();
      const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "sr-spawn-err-"));
      tmpDirsToClean.push(transcriptDirectoryPath);
      const runtime = createSessionRuntime({
        websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
        terminals,
        sessions,
        getTentacleWorkspaceCwd: () => process.cwd(),
        isDebugPtyLogsEnabled: false,
        ptyLogDir: process.cwd(),
        transcriptDirectoryPath,
      });
      const socket = new FakeWebSocket();
      websocketServer.nextSocket = socket;
      runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));
      const msgs = parseSentMessages(socket);
      expect(msgs.some((m) => m.type === "output" && m.data?.includes("failed to start"))).toBe(
        true,
      );
      expect(socket.close).toHaveBeenCalledOnce();
      runtime.close();
    });
  });

  describe("stopSession / killSession", () => {
    it("stopSession returns false for non-existent session", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.stopSession("t1")).toBe(false);
      runtime.close();
    });

    it("stopSession tears down an active session", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, sessions } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      expect(sessions.has("t1")).toBe(true);
      expect(runtime.stopSession("t1")).toBe(true);
      expect(sessions.has("t1")).toBe(false);
      expect(pty.kill).toHaveBeenCalledOnce();
      runtime.close();
    });

    it("killSession returns false for non-existent session", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.killSession("t1")).toBe(false);
      runtime.close();
    });

    it("killSession kills session with SIGKILL signal", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, sessions } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      expect(runtime.killSession("t1", "SIGKILL")).toBe(true);
      expect(sessions.has("t1")).toBe(false);
      expect(pty.kill).toHaveBeenCalledWith("SIGKILL");
      runtime.close();
    });

    it("killSession uses SIGKILL as default signal", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      runtime.killSession("t1");
      expect(pty.kill).toHaveBeenCalledWith("SIGKILL");
      runtime.close();
    });
  });

  describe("writeInput", () => {
    it("returns false when session does not exist", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.writeInput("t1", "hello")).toBe(false);
      runtime.close();
    });

    it("writes data to the pty", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      expect(runtime.writeInput("t1", "ls\r")).toBe(true);
      // First call is the bootstrap command; second is our input
      expect(pty.write).toHaveBeenCalledWith("ls\r");
      runtime.close();
    });
  });

  describe("resizeSession", () => {
    it("returns false when session does not exist", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.resizeSession("t1", 100, 30)).toBe(false);
      runtime.close();
    });

    it("resizes an active session", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      expect(runtime.resizeSession("t1", 100, 30)).toBe(true);
      expect(pty.resize).toHaveBeenCalledWith(100, 30);
      runtime.close();
    });

    it("returns true without calling resize when dimensions are unchanged", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      // Initial default is 120x35
      expect(runtime.resizeSession("t1", 120, 35)).toBe(true);
      expect(pty.resize).not.toHaveBeenCalled();
      runtime.close();
    });

    it("enforces minimum cols (20) and rows (10)", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      runtime.resizeSession("t1", 5, 3);
      expect(pty.resize).toHaveBeenCalledWith(20, 10);
      runtime.close();
    });
  });

  describe("getScrollback", () => {
    it("returns null when session does not exist", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.getScrollback("t1")).toBeNull();
      runtime.close();
    });

    it("returns empty string for a new session with no output", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      expect(runtime.getScrollback("t1")).toBe("");
      runtime.close();
    });

    it("returns accumulated output after pty emits data", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      pty.emitData("line one\r\n");
      pty.emitData("line two\r\n");
      expect(runtime.getScrollback("t1")).toBe("line one\r\nline two\r\n");
      runtime.close();
    });
  });

  describe("getSessionCapacity", () => {
    it("reports active count and max", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty, maxConcurrentSessions: 3 });
      expect(runtime.getSessionCapacity()).toEqual({ active: 0, max: 3 });
      runtime.startSession("t1");
      expect(runtime.getSessionCapacity()).toEqual({ active: 1, max: 3 });
      runtime.close();
    });
  });

  describe("connectDirect", () => {
    it("returns null when terminal is not in registry", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>();
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.connectDirect("nonexistent", vi.fn())).toBeNull();
      runtime.close();
    });

    it("delivers history and state to a direct listener", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      runtime.startSession("t1");
      pty.emitData("some output\r\n");

      const received: unknown[] = [];
      const disconnect = runtime.connectDirect("t1", (msg) => received.push(msg));
      expect(disconnect).not.toBeNull();

      expect(received.some((m) => (m as { type: string }).type === "history")).toBe(true);
      expect(received.some((m) => (m as { type: string }).type === "state")).toBe(true);

      disconnect?.();
      runtime.close();
    });

    it("schedules idle close when direct listener disconnects and no clients remain", () => {
      vi.useFakeTimers();
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, sessions } = makeRuntime({ terminals, pty, sessionIdleGraceMs: 500 });
      runtime.startSession("t1");

      const disconnect = runtime.connectDirect("t1", vi.fn());
      disconnect?.();

      expect(sessions.has("t1")).toBe(true);
      vi.advanceTimersByTime(500);
      expect(sessions.has("t1")).toBe(false);
      runtime.close();
    });

    it("returns null when ensureSession throws (spawn error)", () => {
      spawnMock.mockReset();
      spawnMock.mockImplementation(() => {
        throw new Error("spawn failed");
      });
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const sessions = new Map<string, TerminalSession>();
      const websocketServer = new FakeWebSocketServer();
      const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "sr-connect-err-"));
      tmpDirsToClean.push(transcriptDirectoryPath);
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

  describe("startSession edge cases", () => {
    it("returns false when terminal is not in registry", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>();
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.startSession("nonexistent")).toBe(false);
      runtime.close();
    });

    it("is idempotent — second call is a no-op, same pty is reused", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.startSession("t1")).toBe(true);
      expect(runtime.startSession("t1")).toBe(true);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      runtime.close();
    });
  });

  describe("releaseSessionKeepAlive", () => {
    it("returns false when session does not exist", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime } = makeRuntime({ terminals, pty });
      expect(runtime.releaseSessionKeepAlive("t1")).toBe(false);
      runtime.close();
    });
  });

  describe("onOutputChunk callback", () => {
    it("fires for each data chunk emitted by the pty", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const onOutputChunk = vi.fn();
      const { runtime } = makeRuntime({ terminals, pty, onOutputChunk });
      runtime.startSession("t1");
      pty.emitData("chunk-one");
      pty.emitData("chunk-two");
      expect(onOutputChunk).toHaveBeenCalledTimes(2);
      expect(onOutputChunk).toHaveBeenCalledWith("t1", "chunk-one");
      expect(onOutputChunk).toHaveBeenCalledWith("t1", "chunk-two");
      runtime.close();
    });
  });

  describe("WebSocket message edge cases", () => {
    it("forwards unparseable messages directly to pty as raw text", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, websocketServer } = makeRuntime({ terminals, pty });
      const socket = new FakeWebSocket();
      websocketServer.nextSocket = socket;
      runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));
      socket.emit("message", "not json {{{{");
      expect(pty.write).toHaveBeenCalledWith("not json {{{{");
      runtime.close();
    });

    it("handles Buffer messages from WebSocket", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, websocketServer } = makeRuntime({ terminals, pty });
      const socket = new FakeWebSocket();
      websocketServer.nextSocket = socket;
      runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));
      socket.emit("message", Buffer.from(JSON.stringify({ type: "input", data: "hello\r" })));
      expect(pty.write).toHaveBeenCalledWith("hello\r");
      runtime.close();
    });

    it("does not resize when cols/rows are non-finite", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, websocketServer } = makeRuntime({ terminals, pty });
      const socket = new FakeWebSocket();
      websocketServer.nextSocket = socket;
      runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));
      socket.emit("message", JSON.stringify({ type: "resize", cols: "bad", rows: "bad" }));
      expect(pty.resize).not.toHaveBeenCalled();
      runtime.close();
    });

    it("sends current agent state to a newly connected websocket", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const { runtime, websocketServer } = makeRuntime({ terminals, pty });
      const socket = new FakeWebSocket();
      websocketServer.nextSocket = socket;
      runtime.handleUpgrade(createUpgradeRequest("t1"), {} as Duplex, Buffer.alloc(0));
      const msgs = parseSentMessages(socket);
      expect(msgs.some((m) => m.type === "state")).toBe(true);
      runtime.close();
    });
  });

  describe("session_end event callbacks", () => {
    it("onSessionEnd is called with operator_stop reason on stopSession", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const onSessionEnd = vi.fn();
      const { runtime } = makeRuntime({ terminals, pty, onSessionEnd });
      runtime.startSession("t1");
      runtime.stopSession("t1");
      expect(onSessionEnd).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ reason: "operator_stop" }),
      );
      runtime.close();
    });

    it("onSessionEnd is called with operator_kill reason on killSession", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const onSessionEnd = vi.fn();
      const { runtime } = makeRuntime({ terminals, pty, onSessionEnd });
      runtime.startSession("t1");
      runtime.killSession("t1");
      expect(onSessionEnd).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ reason: "operator_kill" }),
      );
      runtime.close();
    });

    it("onSessionEnd is called with pty_exit reason when pty exits naturally", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      const onSessionEnd = vi.fn();
      const { runtime } = makeRuntime({ terminals, pty, onSessionEnd });
      runtime.startSession("t1");
      pty.emitExit({ exitCode: 0, signal: 0 });
      expect(onSessionEnd).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ reason: "pty_exit", exitCode: 0 }),
      );
      runtime.close();
    });
  });

  describe("maxConcurrentSessions boundary", () => {
    it("clamps non-finite maxConcurrentSessions to the default", () => {
      const pty = new FakePty();
      const terminals = new Map<string, PersistedTerminal>([["t1", makePT()]]);
      // Pass NaN — should fall back to default (not 0 or Infinity)
      const { runtime } = makeRuntime({ terminals, pty, maxConcurrentSessions: Number.NaN });
      const capacity = runtime.getSessionCapacity();
      expect(capacity.max).toBeGreaterThan(0);
      expect(Number.isFinite(capacity.max)).toBe(true);
      runtime.close();
    });
  });

  describe("resolveTerminalSession override", () => {
    it("uses the custom resolver to map terminalId to a different sessionId/tentacleId", () => {
      const pty = new FakePty();
      spawnMock.mockReturnValue(pty);
      const terminals = new Map<string, PersistedTerminal>([
        ["t1", makePT({ terminalId: "t1", tentacleId: "tent-A" })],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const websocketServer = new FakeWebSocketServer();
      const transcriptDirectoryPath = mkdtempSync(join(tmpdir(), "sr-custom-resolver-"));
      tmpDirsToClean.push(transcriptDirectoryPath);
      const runtime = createSessionRuntime({
        websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
        terminals,
        sessions,
        resolveTerminalSession: (terminalId) => {
          if (terminalId === "t1") {
            return { sessionId: "t1", tentacleId: "tent-A" };
          }
          return null;
        },
        getTentacleWorkspaceCwd: () => process.cwd(),
        isDebugPtyLogsEnabled: false,
        ptyLogDir: process.cwd(),
        transcriptDirectoryPath,
      });

      expect(runtime.startSession("t1")).toBe(true);
      expect(sessions.has("t1")).toBe(true);
      runtime.close();
    });
  });
});
