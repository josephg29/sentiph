import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

class FakePty extends EventEmitter {
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();

  onData(listener: (chunk: string) => void) {
    this.on("data", listener);
    return {
      dispose: () => {
        this.off("data", listener);
      },
    };
  }

  onExit(listener: (event: { exitCode: number; signal: number }) => void) {
    this.on("exit", listener);
    return {
      dispose: () => {
        this.off("exit", listener);
      },
    };
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
    if (this.readyState !== 1) {
      return;
    }

    this.readyState = 3;
    this.emit("close");
  });
}

class FakeWebSocketServer {
  nextSocket: FakeWebSocket | null = null;

  handleUpgrade = vi.fn(
    (
      _request: IncomingMessage,
      _socket: Duplex,
      _head: Buffer,
      callback: (socket: FakeWebSocket) => void,
    ) => {
      if (!this.nextSocket) {
        throw new Error("Missing websocket for upgrade.");
      }

      const socket = this.nextSocket;
      this.nextSocket = null;
      callback(socket);
    },
  );
}

const createUpgradeRequest = (tentacleId: string) =>
  ({
    url: `/api/terminals/${tentacleId}/ws`,
  }) as IncomingMessage;

const parseSentMessages = (socket: FakeWebSocket) =>
  socket.sentMessages.map((raw) => JSON.parse(raw) as { type: string; data?: string });

describe("createSessionRuntime", () => {
  const temporaryDirectories: string[] = [];

  const createTemporaryDirectory = () => {
    const directory = mkdtempSync(join(tmpdir(), "sentiph-session-runtime-test-"));
    temporaryDirectories.push(directory);
    return directory;
  };

  beforeEach(() => {
    createShellEnvironmentMock.mockClear();
    ensureSpawnHelperMock.mockClear();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  describe("Claude session resume", () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let originalClaudeConfigDir: string | undefined;
    let claudeConfigDir: string;
    let workspaceCwd: string;

    beforeEach(() => {
      originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
      claudeConfigDir = createTemporaryDirectory();
      workspaceCwd = createTemporaryDirectory();
      process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;
    });

    afterEach(() => {
      if (originalClaudeConfigDir === undefined) {
        // biome-ignore lint/performance/noDelete: restoring the original env requires removing the key, not setting it to "undefined".
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
      }
    });

    const claudeProjectDirForCwd = (cwd: string) =>
      join(claudeConfigDir, "projects", cwd.replace(/\//g, "-"));

    const writeFakeClaudeSessionFile = (cwd: string, sessionId: string) => {
      const dir = claudeProjectDirForCwd(cwd);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${sessionId}.jsonl`), "{}\n", "utf8");
    };

    const makeRuntime = (
      terminals: Map<string, PersistedTerminal>,
      sessions: Map<string, TerminalSession>,
      pty: FakePty,
    ) => {
      spawnMock.mockReturnValue(pty);
      const websocketServer = new FakeWebSocketServer();
      const transcriptDirectoryPath = createTemporaryDirectory();
      return {
        websocketServer,
        runtime: createSessionRuntime({
          websocketServer: websocketServer as unknown as import("ws").WebSocketServer,
          terminals,
          sessions,
          getTentacleWorkspaceCwd: () => workspaceCwd,
          isDebugPtyLogsEnabled: false,
          ptyLogDir: process.cwd(),
          transcriptDirectoryPath,
          sessionIdleGraceMs: 60_000,
          scrollbackMaxBytes: 1024,
        }),
      };
    };

    it("fresh terminal: generates a UUID, sends --session-id, persists the UUID, no banner", () => {
      const tentacleId = "tentacle-fresh";
      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      expect(firstCall).toMatch(
        /^claude --session-id [0-9a-f-]+ --dangerously-skip-permissions\r$/,
      );

      const uuidMatch = firstCall.match(/--session-id ([0-9a-f-]+)/);
      const generatedUuid = uuidMatch?.[1] ?? "";
      expect(generatedUuid).toMatch(UUID_REGEX);
      expect(terminals.get(tentacleId)?.claudeSessionId).toBe(generatedUuid);

      runtime.close();
    });

    it("reopened terminal with stored UUID and session file: --resume + banner", () => {
      const tentacleId = "tentacle-resume";
      const storedUuid = "00000000-0000-4000-8000-000000000001";
      writeFakeClaudeSessionFile(workspaceCwd, storedUuid);

      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            lifecycleState: "stopped",
            claudeSessionId: storedUuid,
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      expect(firstCall).toBe(`claude --resume ${storedUuid} --dangerously-skip-permissions\r`);

      // Banner is preserved in scrollback so newly connecting clients see it.
      const scrollback = runtime.getScrollback(tentacleId) ?? "";
      expect(scrollback).toContain("[Sentiph: resuming previous Claude session");

      // Reopen via WebSocket — banner should also be re-broadcast in history.
      runtime.close();
    });

    it("stored UUID but session file missing: allocates fresh UUID to avoid Claude 'session already exists' on retry", () => {
      const tentacleId = "tentacle-missing-file";
      const storedUuid = "00000000-0000-4000-8000-000000000002";

      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            lifecycleState: "stopped",
            claudeSessionId: storedUuid,
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      const match = firstCall.match(
        /^claude --session-id ([0-9a-f-]{36}) --dangerously-skip-permissions\r$/,
      );
      expect(match).not.toBeNull();
      const usedUuid = match?.[1];
      // Must NOT reuse the orphaned stored UUID — Claude CLI would abort with
      // "session already exists" if the ID was registered by a prior failed
      // bootstrap (e.g. credits exhausted) or by a parallel worker spawn.
      expect(usedUuid).not.toBe(storedUuid);

      // The replacement UUID must be persisted so subsequent retries stay stable.
      expect(terminals.get(tentacleId)?.claudeSessionId).toBe(usedUuid);

      const scrollback = runtime.getScrollback(tentacleId) ?? "";
      expect(scrollback).not.toContain("resuming previous Claude session");

      runtime.close();
    });

    it("legacy stopped terminal without UUID: --continue + banner", () => {
      const tentacleId = "tentacle-legacy";
      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            lifecycleState: "stopped",
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      expect(firstCall).toBe("claude --continue --dangerously-skip-permissions\r");

      const scrollback = runtime.getScrollback(tentacleId) ?? "";
      expect(scrollback).toContain("[Sentiph: resuming previous Claude session");

      // We intentionally do NOT stamp a new UUID for legacy resumes — that
      // identity belongs to whichever session --continue picks up.
      expect(terminals.get(tentacleId)?.claudeSessionId).toBeUndefined();

      runtime.close();
    });

    it("legacy exited/stale terminals also resume via --continue", () => {
      for (const lifecycleState of ["exited", "stale"] as const) {
        const tentacleId = `tentacle-${lifecycleState}`;
        const terminals = new Map<string, PersistedTerminal>([
          [
            tentacleId,
            {
              terminalId: tentacleId,
              tentacleId,
              tentacleName: tentacleId,
              createdAt: new Date().toISOString(),
              workspaceMode: "shared",
              agentProvider: "claude-code",
              lifecycleState,
            },
          ],
        ]);
        const sessions = new Map<string, TerminalSession>();
        const pty = new FakePty();
        const { runtime } = makeRuntime(terminals, sessions, pty);

        expect(runtime.startSession(tentacleId)).toBe(true);
        const firstCall = pty.write.mock.calls[0]?.[0] as string;
        expect(firstCall).toBe("claude --continue --dangerously-skip-permissions\r");

        runtime.close();
      }
    });

    it("Sentiph tentacle skips resume injection (keeps its own flag handling)", () => {
      const terminalId = "sentiph-terminal";
      const terminals = new Map<string, PersistedTerminal>([
        [
          terminalId,
          {
            terminalId,
            tentacleId: "__sentiph__",
            tentacleName: "Sentiph",
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            lifecycleState: "stopped",
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(terminalId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      // No --session-id / --resume / --continue for Sentiph — it keeps its
      // existing bootstrap (just `claude --dangerously-skip-permissions` when
      // no sentiph-specific paths are configured).
      expect(firstCall).toBe("claude --dangerously-skip-permissions\r");
      expect(firstCall).not.toContain("--session-id");
      expect(firstCall).not.toContain("--resume");
      expect(firstCall).not.toContain("--continue");

      runtime.close();
    });

    it("model on a fresh terminal: injects --model <claude-id> ahead of --session-id", () => {
      const tentacleId = "tentacle-model-opus";
      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            model: "opus",
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      expect(firstCall).toMatch(
        /^claude --model claude-opus-4-7 --session-id [0-9a-f-]+ --dangerously-skip-permissions\r$/,
      );

      runtime.close();
    });

    it("model on a resume: injects --model alongside --resume", () => {
      const tentacleId = "tentacle-model-resume";
      const storedUuid = "00000000-0000-4000-8000-0000000000a1";
      writeFakeClaudeSessionFile(workspaceCwd, storedUuid);

      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            lifecycleState: "stopped",
            claudeSessionId: storedUuid,
            model: "haiku",
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      expect(firstCall).toBe(
        `claude --model claude-haiku-4-5 --resume ${storedUuid} --dangerously-skip-permissions\r`,
      );

      runtime.close();
    });

    it("Codex provider skips resume injection (only claude-code is affected)", () => {
      const tentacleId = "tentacle-codex";
      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "codex",
            lifecycleState: "stopped",
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { runtime } = makeRuntime(terminals, sessions, pty);

      expect(runtime.startSession(tentacleId)).toBe(true);

      const firstCall = pty.write.mock.calls[0]?.[0] as string;
      expect(firstCall).toBe("codex\r");
      expect(terminals.get(tentacleId)?.claudeSessionId).toBeUndefined();

      runtime.close();
    });

    it("WebSocket history replays the resume banner to late-joining clients", () => {
      const tentacleId = "tentacle-banner-replay";
      const storedUuid = "00000000-0000-4000-8000-000000000003";
      writeFakeClaudeSessionFile(workspaceCwd, storedUuid);

      const terminals = new Map<string, PersistedTerminal>([
        [
          tentacleId,
          {
            terminalId: tentacleId,
            tentacleId,
            tentacleName: tentacleId,
            createdAt: new Date().toISOString(),
            workspaceMode: "shared",
            agentProvider: "claude-code",
            lifecycleState: "stopped",
            claudeSessionId: storedUuid,
          },
        ],
      ]);
      const sessions = new Map<string, TerminalSession>();
      const pty = new FakePty();
      const { websocketServer, runtime } = makeRuntime(terminals, sessions, pty);

      const socket = new FakeWebSocket();
      websocketServer.nextSocket = socket;
      expect(
        runtime.handleUpgrade(createUpgradeRequest(tentacleId), {} as Duplex, Buffer.alloc(0)),
      ).toBe(true);

      const messages = parseSentMessages(socket);
      const outputMessage = messages.find(
        (msg) => msg.type === "output" && msg.data?.includes("resuming previous Claude session"),
      );
      expect(outputMessage).toBeDefined();

      runtime.close();
    });
  });
});
