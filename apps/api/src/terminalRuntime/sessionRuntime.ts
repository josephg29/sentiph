import { type WriteStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import { type IPty, spawn } from "node-pty";
import type { WebSocket, WebSocketServer } from "ws";

import { type CodexRuntimeState, CodexStateTracker } from "../codexStateDetection";
import {
  TENTACLE_BOOTSTRAP_COMMAND,
  TERMINAL_SCROLLBACK_MAX_BYTES,
  TERMINAL_SESSION_IDLE_GRACE_MS,
} from "./constants";
import { broadcastMessage, getTentacleId, sendMessage } from "./protocol";
import { createShellEnvironment, ensureNodePtySpawnHelperExecutable } from "./ptyEnvironment";
import { toErrorMessage } from "./systemClients";
import type { PersistedTentacle, TerminalSession } from "./types";

type CreateSessionRuntimeOptions = {
  websocketServer: WebSocketServer;
  tentacles: Map<string, PersistedTentacle>;
  sessions: Map<string, TerminalSession>;
  getTentacleWorkspaceCwd: (tentacleId: string) => string;
  isDebugPtyLogsEnabled: boolean;
  ptyLogDir: string;
  sessionIdleGraceMs?: number;
  scrollbackMaxBytes?: number;
};

export const createSessionRuntime = ({
  websocketServer,
  tentacles,
  sessions,
  getTentacleWorkspaceCwd,
  isDebugPtyLogsEnabled,
  ptyLogDir,
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

  const createDebugLog = (tentacleId: string) => {
    if (!isDebugPtyLogsEnabled) {
      return undefined;
    }

    mkdirSync(ptyLogDir, { recursive: true });
    const filename = `${tentacleId}-${Date.now()}.log`;
    return createWriteStream(join(ptyLogDir, filename), {
      flags: "a",
      encoding: "utf8",
    });
  };

  const appendDebugLog = (session: TerminalSession, line: string) => {
    session.debugLog?.write(`${new Date().toISOString()} ${line}\n`);
  };

  const emitStateIfChanged = (
    session: TerminalSession,
    tentacleId: string,
    nextState: CodexRuntimeState | null,
  ) => {
    if (!nextState || nextState === session.codexState) {
      return;
    }

    session.codexState = nextState;
    appendDebugLog(session, `state-change tentacle=${tentacleId} state=${nextState}`);
    broadcastMessage(session, {
      type: "state",
      state: nextState,
    });
  };

  const clearIdleCloseTimer = (session: TerminalSession) => {
    if (!session.idleCloseTimer) {
      return;
    }

    clearTimeout(session.idleCloseTimer);
    delete session.idleCloseTimer;
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

  const closeSession = (tentacleId: string): boolean => {
    const session = sessions.get(tentacleId);
    if (!session) {
      return false;
    }

    clearIdleCloseTimer(session);
    try {
      session.pty.kill();
    } catch {
      // Ignore teardown errors; session will still be discarded.
    }

    if (session.statePollTimer) {
      clearInterval(session.statePollTimer);
    }
    session.debugLog?.end();
    sessions.delete(tentacleId);
    return true;
  };

  const ensureCodexBootstrapped = (tentacleId: string, session: TerminalSession) => {
    if (session.isBootstrapCommandSent) {
      return;
    }

    session.isBootstrapCommandSent = true;
    appendDebugLog(
      session,
      `bootstrap tentacle=${tentacleId} command=${TENTACLE_BOOTSTRAP_COMMAND}`,
    );
    session.pty.write(`${TENTACLE_BOOTSTRAP_COMMAND}\r`);
  };

  const ensureSession = (tentacleId: string) => {
    const existingSession = sessions.get(tentacleId);
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
        env: createShellEnvironment(),
        name: "xterm-256color",
      });
    } catch (error) {
      throw new Error(
        `Unable to start terminal shell (${shellLaunch.command}): ${toErrorMessage(error)}`,
      );
    }

    const stateTracker = new CodexStateTracker();
    const debugLog = createDebugLog(tentacleId);
    const session: TerminalSession = {
      pty,
      clients: new Set(),
      cols: DEFAULT_PTY_COLS,
      rows: DEFAULT_PTY_ROWS,
      codexState: stateTracker.currentState,
      stateTracker,
      isBootstrapCommandSent: false,
      scrollbackChunks: [],
      scrollbackBytes: 0,
    };
    if (debugLog) {
      session.debugLog = debugLog;
    }

    appendDebugLog(session, `session-start tentacle=${tentacleId}`);
    session.statePollTimer = setInterval(() => {
      emitStateIfChanged(session, tentacleId, session.stateTracker.poll(Date.now()));
    }, 300);

    session.pty.onData((chunk) => {
      appendDebugLog(session, `pty-output tentacle=${tentacleId} chunk=${JSON.stringify(chunk)}`);
      appendScrollback(session, chunk);
      const nextState = session.stateTracker.observeChunk(chunk, Date.now());
      broadcastMessage(session, {
        type: "output",
        data: chunk,
      });
      emitStateIfChanged(session, tentacleId, nextState);
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
        `session-exit tentacle=${tentacleId} code=${exitCode} signal=${signal}`,
      );
      if (session.statePollTimer) {
        clearInterval(session.statePollTimer);
      }
      session.debugLog?.end();
      sessions.delete(tentacleId);
    });

    sessions.set(tentacleId, session);
    return session;
  };

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    const tentacleId = getTentacleId(request);
    if (!tentacleId || !tentacles.has(tentacleId)) {
      return false;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
      let session: TerminalSession;
      try {
        session = ensureSession(tentacleId);
      } catch (error) {
        sendMessage(websocket, {
          type: "output",
          data: `\r\n[terminal failed to start: ${toErrorMessage(error)}]\r\n`,
        });
        websocket.close();
        return;
      }

      session.clients.add(websocket);
      appendDebugLog(session, `ws-open tentacle=${tentacleId} clients=${session.clients.size}`);
      clearIdleCloseTimer(session);
      ensureCodexBootstrapped(tentacleId, session);
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
              `ws-input tentacle=${tentacleId} data=${JSON.stringify(payload.data)}`,
            );
            session.pty.write(payload.data);
            if (/[\r\n]/.test(payload.data)) {
              emitStateIfChanged(
                session,
                tentacleId,
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
        appendDebugLog(session, `ws-close tentacle=${tentacleId} clients=${session.clients.size}`);
        if (session.clients.size === 0) {
          appendDebugLog(
            session,
            `idle-grace-start tentacle=${tentacleId} timeoutMs=${sessionIdleGraceMs}`,
          );
          clearIdleCloseTimer(session);
          session.idleCloseTimer = setTimeout(() => {
            appendDebugLog(session, `idle-grace-expired tentacle=${tentacleId}`);
            closeSession(tentacleId);
          }, sessionIdleGraceMs);
        }
      });
    });

    return true;
  };

  const close = () => {
    for (const tentacleId of sessions.keys()) {
      closeSession(tentacleId);
    }
  };

  return {
    closeSession,
    handleUpgrade,
    close,
  };
};
