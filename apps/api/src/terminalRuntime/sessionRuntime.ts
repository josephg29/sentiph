import { type WriteStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import { type IPty, spawn } from "node-pty";
import type { WebSocket, WebSocketServer } from "ws";

import { type CodexRuntimeState, CodexStateTracker } from "../codexStateDetection";
import {
  TENTACLE_BOOTSTRAP_COMMAND,
  TENTACLE_BOOTSTRAP_COMMANDS,
  TERMINAL_SCROLLBACK_MAX_BYTES,
  TERMINAL_SESSION_IDLE_GRACE_MS,
} from "./constants";
import {
  type ConversationTranscriptEvent,
  type ConversationTranscriptEventPayload,
  ensureTranscriptDirectory,
  transcriptFilenameForSession,
} from "./conversations";
import { broadcastMessage, getTentacleId, sendMessage } from "./protocol";
import { createShellEnvironment, ensureNodePtySpawnHelperExecutable } from "./ptyEnvironment";
import { toErrorMessage } from "./systemClients";
import type { PersistedTentacle, TerminalSession } from "./types";

type CreateSessionRuntimeOptions = {
  websocketServer: WebSocketServer;
  tentacles: Map<string, PersistedTentacle>;
  sessions: Map<string, TerminalSession>;
  resolveTerminalSession?: (terminalId: string) => {
    sessionId: string;
    tentacleId: string;
  } | null;
  getTentacleWorkspaceCwd: (tentacleId: string) => string;
  isDebugPtyLogsEnabled: boolean;
  ptyLogDir: string;
  transcriptDirectoryPath: string;
  sessionIdleGraceMs?: number;
  scrollbackMaxBytes?: number;
};

export const createSessionRuntime = ({
  websocketServer,
  tentacles,
  sessions,
  resolveTerminalSession,
  getTentacleWorkspaceCwd,
  isDebugPtyLogsEnabled,
  ptyLogDir,
  transcriptDirectoryPath,
  sessionIdleGraceMs = TERMINAL_SESSION_IDLE_GRACE_MS,
  scrollbackMaxBytes = TERMINAL_SCROLLBACK_MAX_BYTES,
}: CreateSessionRuntimeOptions) => {
  const DEFAULT_PTY_COLS = 120;
  const DEFAULT_PTY_ROWS = 35;

  const getShellLaunch = () => {
    if (process.platform === "win32") {
      return {
        command: process.env.ComSpec ?? "cmd.exe",
        args: [],
      };
    }

    const shellFromEnvironment = process.env.SHELL?.trim();
    if (shellFromEnvironment && shellFromEnvironment.length > 0) {
      return {
        command: shellFromEnvironment,
        args: ["-i"],
      };
    }

    return {
      command: "/bin/bash",
      args: ["-i"],
    };
  };

  const createDebugLog = (sessionId: string) => {
    if (!isDebugPtyLogsEnabled) {
      return undefined;
    }

    mkdirSync(ptyLogDir, { recursive: true });
    const filename = `${sessionId}-${Date.now()}.log`;
    return createWriteStream(join(ptyLogDir, filename), {
      flags: "a",
      encoding: "utf8",
    });
  };

  const appendDebugLog = (session: TerminalSession, line: string) => {
    session.debugLog?.write(`${new Date().toISOString()} ${line}\n`);
  };

  const createTranscriptLog = (sessionId: string) => {
    ensureTranscriptDirectory(transcriptDirectoryPath);
    const filename = transcriptFilenameForSession(sessionId);
    const stream = createWriteStream(join(transcriptDirectoryPath, filename), {
      flags: "a",
      encoding: "utf8",
    });
    stream.on("error", () => {
      // Keep terminal flow alive even if transcript writes fail.
    });
    return stream;
  };

  const appendTranscriptEvent = (
    session: TerminalSession,
    sessionId: string,
    event: ConversationTranscriptEventPayload,
  ) => {
    if (!session.transcriptLog) {
      return;
    }

    const nextEventCount = (session.transcriptEventCount ?? 0) + 1;
    session.transcriptEventCount = nextEventCount;
    const payload: ConversationTranscriptEvent = {
      ...event,
      eventId: `${sessionId}:${nextEventCount}`,
      sessionId,
      tentacleId: session.tentacleId,
    } as ConversationTranscriptEvent;
    session.transcriptLog.write(`${JSON.stringify(payload)}\n`);
  };

  const closeTranscript = (
    session: TerminalSession,
    sessionId: string,
    event: ConversationTranscriptEventPayload,
  ) => {
    if (session.hasTranscriptEnded) {
      return;
    }

    appendTranscriptEvent(session, sessionId, event);
    session.hasTranscriptEnded = true;
    session.transcriptLog?.end();
    session.transcriptLog = undefined;
  };

  const emitStateIfChanged = (
    session: TerminalSession,
    sessionId: string,
    nextState: CodexRuntimeState | null,
  ) => {
    if (!nextState || nextState === session.codexState) {
      return;
    }

    session.codexState = nextState;
    appendDebugLog(session, `state-change session=${sessionId} state=${nextState}`);
    appendTranscriptEvent(session, sessionId, {
      type: "state_change",
      state: nextState,
      timestamp: new Date().toISOString(),
    });
    broadcastMessage(session, {
      type: "state",
      state: nextState,
    });
  };

  const resolveSession =
    resolveTerminalSession ??
    ((terminalId: string) => {
      if (!tentacles.has(terminalId)) {
        return null;
      }
      return {
        sessionId: terminalId,
        tentacleId: terminalId,
      };
    });

  const clearIdleCloseTimer = (session: TerminalSession) => {
    if (!session.idleCloseTimer) {
      return;
    }

    clearTimeout(session.idleCloseTimer);
    session.idleCloseTimer = undefined;
  };

  const appendScrollback = (session: TerminalSession, chunk: string) => {
    let nextChunk = chunk;
    let nextChunkBytes = Buffer.byteLength(nextChunk, "utf8");
    if (nextChunkBytes > scrollbackMaxBytes) {
      const chunkBuffer = Buffer.from(nextChunk, "utf8");
      nextChunk = chunkBuffer.subarray(chunkBuffer.length - scrollbackMaxBytes).toString("utf8");
      nextChunkBytes = Buffer.byteLength(nextChunk, "utf8");
      session.scrollbackChunks = [];
      session.scrollbackBytes = 0;
    }

    session.scrollbackChunks.push(nextChunk);
    session.scrollbackBytes += nextChunkBytes;
    while (session.scrollbackBytes > scrollbackMaxBytes && session.scrollbackChunks.length > 0) {
      const removedChunk = session.scrollbackChunks.shift();
      if (!removedChunk) {
        break;
      }

      session.scrollbackBytes -= Buffer.byteLength(removedChunk, "utf8");
    }
  };

  const sendHistory = (websocket: WebSocket, session: TerminalSession) => {
    if (session.scrollbackChunks.length === 0) {
      return;
    }

    sendMessage(websocket, {
      type: "history",
      data: session.scrollbackChunks.join(""),
    });
  };

  const closeSession = (sessionId: string): boolean => {
    const session = sessions.get(sessionId);
    if (!session) {
      return false;
    }

    clearIdleCloseTimer(session);
    closeTranscript(session, sessionId, {
      type: "session_end",
      reason: "session_close",
      timestamp: new Date().toISOString(),
    });
    try {
      session.pty.kill();
    } catch {
      // Ignore teardown errors; session will still be discarded.
    }

    if (session.statePollTimer) {
      clearInterval(session.statePollTimer);
    }
    session.debugLog?.end();
    sessions.delete(sessionId);
    return true;
  };

  const ensureCodexBootstrapped = (sessionId: string, session: TerminalSession) => {
    if (session.isBootstrapCommandSent) {
      return;
    }

    session.isBootstrapCommandSent = true;
    const tentacle = tentacles.get(session.tentacleId);
    const provider = tentacle?.agentProvider ?? "codex";
    const bootstrapCommand =
      TENTACLE_BOOTSTRAP_COMMANDS[provider] ?? TENTACLE_BOOTSTRAP_COMMAND;
    appendDebugLog(session, `bootstrap session=${sessionId} command=${bootstrapCommand}`);
    session.pty.write(`${bootstrapCommand}\r`);
  };

  const ensureSession = (sessionId: string, tentacleId: string) => {
    const existingSession = sessions.get(sessionId);
    if (existingSession) {
      return existingSession;
    }

    if (!tentacles.has(tentacleId)) {
      throw new Error(`Unknown tentacle: ${tentacleId}`);
    }

    const tentacleCwd = getTentacleWorkspaceCwd(tentacleId);
    if (!existsSync(tentacleCwd)) {
      throw new Error(`Tentacle working directory does not exist: ${tentacleCwd}`);
    }

    ensureNodePtySpawnHelperExecutable();
    const shellLaunch = getShellLaunch();

    let pty: IPty;
    try {
      pty = spawn(shellLaunch.command, shellLaunch.args, {
        cols: DEFAULT_PTY_COLS,
        rows: DEFAULT_PTY_ROWS,
        cwd: tentacleCwd,
        env: createShellEnvironment({ octogentSessionId: sessionId }),
        name: "xterm-256color",
      });
    } catch (error) {
      throw new Error(
        `Unable to start terminal shell (${shellLaunch.command}): ${toErrorMessage(error)}`,
      );
    }

    const stateTracker = new CodexStateTracker();
    const debugLog = createDebugLog(sessionId);
    const transcriptLog = createTranscriptLog(sessionId);
    const session: TerminalSession = {
      tentacleId,
      pty,
      clients: new Set(),
      cols: DEFAULT_PTY_COLS,
      rows: DEFAULT_PTY_ROWS,
      codexState: stateTracker.currentState,
      stateTracker,
      isBootstrapCommandSent: false,
      scrollbackChunks: [],
      scrollbackBytes: 0,
      transcriptEventCount: 0,
      pendingInput: "",
      hasTranscriptEnded: false,
    };
    if (debugLog) {
      session.debugLog = debugLog;
    }
    session.transcriptLog = transcriptLog;

    appendDebugLog(session, `session-start session=${sessionId} tentacle=${tentacleId}`);
    appendTranscriptEvent(session, sessionId, {
      type: "session_start",
      timestamp: new Date().toISOString(),
    });
    session.statePollTimer = setInterval(() => {
      emitStateIfChanged(session, sessionId, session.stateTracker.poll(Date.now()));
    }, 300);

    session.pty.onData((chunk) => {
      appendDebugLog(session, `pty-output session=${sessionId} chunk=${JSON.stringify(chunk)}`);
      appendScrollback(session, chunk);
      const nextState = session.stateTracker.observeChunk(chunk, Date.now());
      broadcastMessage(session, {
        type: "output",
        data: chunk,
      });
      emitStateIfChanged(session, sessionId, nextState);
    });

    session.pty.onExit(({ exitCode, signal }) => {
      const message = `\r\n[terminal exited (code ${exitCode}, signal ${signal})]\r\n`;
      broadcastMessage(session, {
        type: "output",
        data: message,
      });
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.close();
        }
      }

      appendDebugLog(
        session,
        `session-exit session=${sessionId} code=${exitCode} signal=${signal}`,
      );
      closeTranscript(session, sessionId, {
        type: "session_end",
        reason: "pty_exit",
        ...(Number.isFinite(exitCode) ? { exitCode } : {}),
        ...(Number.isFinite(signal) ? { signal } : {}),
        timestamp: new Date().toISOString(),
      });
      if (session.statePollTimer) {
        clearInterval(session.statePollTimer);
      }
      session.debugLog?.end();
      sessions.delete(sessionId);
    });

    sessions.set(sessionId, session);
    return session;
  };

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    const terminalId = getTentacleId(request);
    if (!terminalId) {
      return false;
    }

    const resolvedSession = resolveSession(terminalId);
    if (!resolvedSession) {
      return false;
    }
    const { sessionId, tentacleId } = resolvedSession;

    websocketServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
      let session: TerminalSession;
      try {
        session = ensureSession(sessionId, tentacleId);
      } catch (error) {
        sendMessage(websocket, {
          type: "output",
          data: `\r\n[terminal failed to start: ${toErrorMessage(error)}]\r\n`,
        });
        websocket.close();
        return;
      }

      session.clients.add(websocket);
      appendDebugLog(session, `ws-open session=${sessionId} clients=${session.clients.size}`);
      clearIdleCloseTimer(session);
      ensureCodexBootstrapped(sessionId, session);
      sendHistory(websocket, session);
      sendMessage(websocket, {
        type: "state",
        state: session.codexState,
      });

      websocket.on("message", (raw: unknown) => {
        const text =
          typeof raw === "string" ? raw : raw instanceof Buffer ? raw.toString() : String(raw);
        try {
          const payload = JSON.parse(text) as
            | { type: "input"; data: string }
            | { type: "resize"; cols: number; rows: number };

          if (payload.type === "input" && typeof payload.data === "string") {
            appendDebugLog(
              session,
              `ws-input session=${sessionId} data=${JSON.stringify(payload.data)}`,
            );
            session.pty.write(payload.data);
            if (/[\r\n]/.test(payload.data)) {
              emitStateIfChanged(
                session,
                sessionId,
                session.stateTracker.observeSubmit(Date.now()),
              );
            }
            return;
          }

          if (
            payload.type === "resize" &&
            Number.isFinite(payload.cols) &&
            Number.isFinite(payload.rows)
          ) {
            const nextCols = Math.max(20, Math.floor(payload.cols));
            const nextRows = Math.max(10, Math.floor(payload.rows));
            if (session.cols === nextCols && session.rows === nextRows) {
              return;
            }

            session.cols = nextCols;
            session.rows = nextRows;
            session.pty.resize(nextCols, nextRows);
          }
        } catch {
          session.pty.write(text);
        }
      });

      websocket.on("close", () => {
        session.clients.delete(websocket);
        appendDebugLog(session, `ws-close session=${sessionId} clients=${session.clients.size}`);
        if (session.clients.size === 0) {
          appendDebugLog(
            session,
            `idle-grace-start session=${sessionId} timeoutMs=${sessionIdleGraceMs}`,
          );
          clearIdleCloseTimer(session);
          session.idleCloseTimer = setTimeout(() => {
            appendDebugLog(session, `idle-grace-expired session=${sessionId}`);
            closeSession(sessionId);
          }, sessionIdleGraceMs);
        }
      });
    });

    return true;
  };

  const close = () => {
    for (const sessionId of sessions.keys()) {
      closeSession(sessionId);
    }
  };

  return {
    closeSession,
    handleUpgrade,
    close,
  };
};
