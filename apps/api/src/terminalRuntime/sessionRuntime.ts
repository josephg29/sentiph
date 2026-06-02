import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import type { WebSocket, WebSocketServer } from "ws";
import type { AgentRuntimeState } from "../agentStateDetection";
import {
  TERMINAL_MAX_CONCURRENT_SESSIONS,
  TERMINAL_SCROLLBACK_MAX_BYTES,
  TERMINAL_SESSION_IDLE_GRACE_MS,
} from "./constants";
import { broadcastMessage, getTerminalId, sendMessage } from "./protocol";
import {
  type BootstrapContext,
  type EnsureSessionContext,
  ensureAgentBootstrapped,
  ensureSession,
} from "./sessionBootstrap";
import {
  type TeardownOptions,
  clearIdleCloseTimer,
  closeSession as lifecycleCloseSession,
  emitStateIfChanged as lifecycleEmitStateIfChanged,
  killSession as lifecycleKillSession,
  scheduleIdleCloseIfNeeded as lifecycleScheduleIdleClose,
  stopSession as lifecycleStopSession,
  schedulePromptTimer,
  teardownSession,
} from "./sessionLifecycle";
import { appendDebugLog } from "./sessionLogging";
import type { SessionEndEvent } from "./sessionLogging";
import { toErrorMessage } from "./systemClients";
import {
  appendScrollback as appendScrollbackToSession,
  stripBrokenLeadingAnsi,
} from "./terminalOutput";
import type {
  DirectSessionListener,
  PersistedTerminal,
  TerminalSession,
  TerminalSessionEndDetails,
  TerminalSessionStartDetails,
} from "./types";

type CreateSessionRuntimeOptions = {
  websocketServer: WebSocketServer;
  terminals: Map<string, PersistedTerminal>;
  sessions: Map<string, TerminalSession>;
  resolveTerminalSession?: (terminalId: string) => {
    sessionId: string;
    tentacleId: string;
  } | null;
  getTentacleWorkspaceCwd: (tentacleId: string) => string;
  isDebugPtyLogsEnabled: boolean;
  ptyLogDir: string;
  transcriptDirectoryPath?: string;
  sessionIdleGraceMs?: number;
  scrollbackMaxBytes?: number;
  maxConcurrentSessions?: number;
  onStateChange?: (terminalId: string, state: AgentRuntimeState, toolName?: string) => void;
  onSessionStart?: (terminalId: string, details: TerminalSessionStartDetails) => void;
  onSessionEnd?: (terminalId: string, details: TerminalSessionEndDetails) => void;
  onOutputChunk?: (terminalId: string, chunk: string) => void;
  sentiphMcpConfigPath?: string;
  sentiphSystemPromptPath?: string;
};

export const createSessionRuntime = ({
  websocketServer,
  terminals,
  sessions,
  resolveTerminalSession,
  getTentacleWorkspaceCwd,
  isDebugPtyLogsEnabled,
  ptyLogDir,
  transcriptDirectoryPath,
  sessionIdleGraceMs = TERMINAL_SESSION_IDLE_GRACE_MS,
  scrollbackMaxBytes = TERMINAL_SCROLLBACK_MAX_BYTES,
  maxConcurrentSessions = TERMINAL_MAX_CONCURRENT_SESSIONS,
  onStateChange,
  onSessionStart,
  onSessionEnd,
  onOutputChunk,
  sentiphMcpConfigPath,
  sentiphSystemPromptPath,
}: CreateSessionRuntimeOptions) => {
  const sessionLimit = Number.isFinite(maxConcurrentSessions)
    ? Math.max(1, Math.floor(maxConcurrentSessions))
    : TERMINAL_MAX_CONCURRENT_SESSIONS;

  const transcriptEventSequence = { value: 0 };

  const resolveSession =
    resolveTerminalSession ??
    ((terminalId: string) => {
      if (!terminals.has(terminalId)) {
        return null;
      }
      const terminal = terminals.get(terminalId);
      return {
        sessionId: terminalId,
        tentacleId: terminal?.tentacleId ?? terminalId,
      };
    });

  const appendScrollback = (session: TerminalSession, chunk: string) => {
    appendScrollbackToSession(session, chunk, scrollbackMaxBytes);
  };

  const sendHistory = (websocket: WebSocket, session: TerminalSession) => {
    if (session.scrollbackChunks.length === 0) {
      return;
    }

    sendMessage(websocket, {
      type: "history",
      data: stripBrokenLeadingAnsi(session.scrollbackChunks.join("")),
    });
  };

  // -------------------------------------------------------------------------
  // Bound teardown context
  // -------------------------------------------------------------------------

  const teardownCtx: TeardownOptions = {
    sessions,
    ...(onSessionEnd ? { onSessionEnd } : {}),
    transcriptEventSequence,
  };

  const boundTeardownSession = (
    sessionId: string,
    session: TerminalSession,
    event: SessionEndEvent,
    options: { killPty: boolean; killSignal?: string },
  ): void => {
    teardownSession(sessionId, session, event, options, teardownCtx);
  };

  // -------------------------------------------------------------------------
  // Bound state-emission helper
  // -------------------------------------------------------------------------

  const boundEmitStateIfChanged = (
    session: TerminalSession,
    sessionId: string,
    nextState: AgentRuntimeState | null,
  ): void => {
    lifecycleEmitStateIfChanged(
      session,
      sessionId,
      nextState,
      onStateChange,
      (_session, _nextState) => {
        broadcastMessage(_session, {
          type: "state",
          state: _nextState,
          ...(_session.lastToolName ? { toolName: _session.lastToolName } : {}),
        });
      },
    );
  };

  // -------------------------------------------------------------------------
  // Bound schedulePromptTimer
  // -------------------------------------------------------------------------

  const boundSchedulePromptTimer = (
    session: TerminalSession,
    sessionId: string,
    callback: () => void,
    delayMs: number,
  ): void => {
    schedulePromptTimer(session, sessions, sessionId, callback, delayMs);
  };

  // -------------------------------------------------------------------------
  // Bound closeSession (used in idle-grace and public API)
  // -------------------------------------------------------------------------

  const boundCloseSession = (sessionId: string): boolean =>
    lifecycleCloseSession(sessionId, sessions, teardownCtx);

  // -------------------------------------------------------------------------
  // Bootstrap context
  // -------------------------------------------------------------------------

  const bootstrapCtx: BootstrapContext = {
    terminals,
    ...(sentiphMcpConfigPath ? { sentiphMcpConfigPath } : {}),
    ...(sentiphSystemPromptPath ? { sentiphSystemPromptPath } : {}),
    schedulePromptTimer: boundSchedulePromptTimer,
    appendScrollback,
    broadcastOutput: (session, data) => {
      broadcastMessage(session, { type: "output", data });
    },
    appendDebugLog,
  };

  // -------------------------------------------------------------------------
  // ensureSession context
  // -------------------------------------------------------------------------

  const ensureSessionCtx: EnsureSessionContext = {
    sessions,
    terminals,
    sessionLimit,
    getTentacleWorkspaceCwd,
    isDebugPtyLogsEnabled,
    ptyLogDir,
    ...(transcriptDirectoryPath ? { transcriptDirectoryPath } : {}),
    transcriptEventSequence,
    ...(onSessionStart ? { onSessionStart } : {}),
    ...(onOutputChunk ? { onOutputChunk } : {}),
    appendScrollback,
    broadcastMessage: (session, msg) => {
      broadcastMessage(session, msg as Parameters<typeof broadcastMessage>[1]);
    },
    emitStateIfChanged: boundEmitStateIfChanged,
    teardownSession: boundTeardownSession,
  };

  // -------------------------------------------------------------------------
  // Idle-close scheduling
  // -------------------------------------------------------------------------

  const scheduleIdleCloseIfNeeded = (session: TerminalSession, sessionId: string): void => {
    lifecycleScheduleIdleClose(session, sessionId, sessions, sessionIdleGraceMs, boundCloseSession);
  };

  // -------------------------------------------------------------------------
  // Bootstrap helper (bound)
  // -------------------------------------------------------------------------

  const boundEnsureAgentBootstrapped = (sessionId: string, session: TerminalSession): void => {
    ensureAgentBootstrapped(sessionId, session, bootstrapCtx);
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const closeSession = boundCloseSession;

  const stopSession = (sessionId: string): boolean =>
    lifecycleStopSession(sessionId, sessions, teardownCtx);

  const killSession = (sessionId: string, signal = "SIGKILL"): boolean =>
    lifecycleKillSession(sessionId, signal, sessions, teardownCtx);

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    const terminalId = getTerminalId(request);
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
        session = ensureSession(sessionId, tentacleId, ensureSessionCtx);
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
      boundEnsureAgentBootstrapped(sessionId, session);
      sendHistory(websocket, session);
      sendMessage(websocket, {
        type: "state",
        state: session.agentState,
      });

      websocket.on("message", (raw: unknown) => {
        if (session.isClosed) {
          return;
        }

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
              boundEmitStateIfChanged(
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
        if (session.isClosed) {
          return;
        }

        session.clients.delete(websocket);
        appendDebugLog(session, `ws-close session=${sessionId} clients=${session.clients.size}`);
        scheduleIdleCloseIfNeeded(session, sessionId);
      });
    });

    return true;
  };

  const close = () => {
    for (const sessionId of sessions.keys()) {
      closeSession(sessionId);
    }
  };

  const connectDirect = (
    terminalId: string,
    listener: DirectSessionListener,
  ): (() => void) | null => {
    const resolvedSession = resolveSession(terminalId);
    if (!resolvedSession) {
      return null;
    }
    const { sessionId, tentacleId } = resolvedSession;

    let session: TerminalSession;
    try {
      session = ensureSession(sessionId, tentacleId, ensureSessionCtx);
    } catch {
      return null;
    }

    session.directListeners.add(listener);
    clearIdleCloseTimer(session);
    boundEnsureAgentBootstrapped(sessionId, session);

    if (session.scrollbackChunks.length > 0) {
      listener({ type: "history", data: session.scrollbackChunks.join("") });
    }
    listener({ type: "state", state: session.agentState });

    return () => {
      if (session.isClosed) {
        return;
      }

      session.directListeners.delete(listener);
      scheduleIdleCloseIfNeeded(session, sessionId);
    };
  };

  const startSession = (terminalId: string): boolean => {
    const resolvedSession = resolveSession(terminalId);
    if (!resolvedSession) {
      return false;
    }

    const { sessionId, tentacleId } = resolvedSession;
    let session: TerminalSession;
    try {
      session = ensureSession(sessionId, tentacleId, ensureSessionCtx);
    } catch {
      return false;
    }

    clearIdleCloseTimer(session);
    boundEnsureAgentBootstrapped(sessionId, session);
    return true;
  };

  const writeInput = (terminalId: string, data: string): boolean => {
    const session = sessions.get(terminalId);
    if (!session || session.isClosed) {
      return false;
    }

    session.pty.write(data);
    if (/[\r\n]/.test(data)) {
      boundEmitStateIfChanged(session, terminalId, session.stateTracker.observeSubmit(Date.now()));
    }
    return true;
  };

  const resizeSession = (terminalId: string, cols: number, rows: number): boolean => {
    const session = sessions.get(terminalId);
    if (!session || session.isClosed) {
      return false;
    }

    const nextCols = Math.max(20, Math.floor(cols));
    const nextRows = Math.max(10, Math.floor(rows));
    if (session.cols === nextCols && session.rows === nextRows) {
      return true;
    }

    session.cols = nextCols;
    session.rows = nextRows;
    session.pty.resize(nextCols, nextRows);
    return true;
  };

  const releaseSessionKeepAlive = (terminalId: string): boolean => {
    const session = sessions.get(terminalId);
    if (!session || session.isClosed) {
      return false;
    }

    session.keepAliveWithoutClients = false;
    scheduleIdleCloseIfNeeded(session, terminalId);
    return true;
  };

  const getScrollback = (terminalId: string): string | null => {
    const session = sessions.get(terminalId);
    if (!session) return null;
    return session.scrollbackChunks.join("");
  };

  return {
    closeSession,
    stopSession,
    killSession,
    handleUpgrade,
    connectDirect,
    startSession,
    writeInput,
    resizeSession,
    releaseSessionKeepAlive,
    close,
    getScrollback,
    getSessionCapacity: () => ({
      active: sessions.size,
      max: sessionLimit,
    }),
  };
};
