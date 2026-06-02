import type { AgentRuntimeState } from "../agentStateDetection";
import {
  appendDebugLog,
  appendTranscriptEvent,
  exitSignalFields,
  resolveEndedAt,
  resolveSessionEndReason,
} from "./sessionLogging";
import type { SessionEndEvent } from "./sessionLogging";
import type { TerminalSession, TerminalSessionEndDetails } from "./types";

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

export const clearIdleCloseTimer = (session: TerminalSession): void => {
  if (!session.idleCloseTimer) {
    return;
  }

  clearTimeout(session.idleCloseTimer);
  session.idleCloseTimer = undefined;
};

const clearPromptTimers = (session: TerminalSession): void => {
  if (!session.promptTimers) {
    return;
  }

  for (const timer of session.promptTimers) {
    clearTimeout(timer);
  }
  session.promptTimers.clear();
};

export const schedulePromptTimer = (
  session: TerminalSession,
  sessions: Map<string, TerminalSession>,
  sessionId: string,
  callback: () => void,
  delayMs: number,
): void => {
  const timer = setTimeout(() => {
    session.promptTimers?.delete(timer);
    if (session.isClosed || sessions.get(sessionId) !== session) {
      return;
    }

    callback();
  }, delayMs);

  if (!session.promptTimers) {
    session.promptTimers = new Set();
  }
  session.promptTimers.add(timer);
};

// ---------------------------------------------------------------------------
// Idle-close scheduling
// ---------------------------------------------------------------------------

export const scheduleIdleCloseIfNeeded = (
  session: TerminalSession,
  sessionId: string,
  sessions: Map<string, TerminalSession>,
  sessionIdleGraceMs: number,
  closeSession: (sessionId: string) => boolean,
): void => {
  if (session.isClosed || sessions.get(sessionId) !== session) {
    return;
  }

  if (session.keepAliveWithoutClients) {
    return;
  }

  if (session.clients.size > 0 || session.directListeners.size > 0) {
    return;
  }

  appendDebugLog(session, `idle-grace-start session=${sessionId} timeoutMs=${sessionIdleGraceMs}`);
  clearIdleCloseTimer(session);
  session.idleCloseTimer = setTimeout(() => {
    appendDebugLog(session, `idle-grace-expired session=${sessionId}`);
    closeSession(sessionId);
  }, sessionIdleGraceMs);
};

// ---------------------------------------------------------------------------
// State emission
// ---------------------------------------------------------------------------

export const emitStateIfChanged = (
  session: TerminalSession,
  sessionId: string,
  nextState: AgentRuntimeState | null,
  onStateChange:
    | ((terminalId: string, state: AgentRuntimeState, toolName?: string) => void)
    | undefined,
  broadcastStateFn: (session: TerminalSession, nextState: AgentRuntimeState) => void,
): void => {
  if (!nextState || nextState === session.agentState) {
    return;
  }

  session.agentState = nextState;
  session.agentStateChangedAt = Date.now();
  appendDebugLog(session, `state-change session=${sessionId} state=${nextState}`);
  onStateChange?.(sessionId, nextState, session.lastToolName);
  broadcastStateFn(session, nextState);
};

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export type TeardownOptions = {
  sessions: Map<string, TerminalSession>;
  onSessionEnd?: (terminalId: string, details: TerminalSessionEndDetails) => void;
  transcriptEventSequence: { value: number };
};

export const teardownSession = (
  sessionId: string,
  session: TerminalSession,
  event: SessionEndEvent,
  options: { killPty: boolean; killSignal?: string },
  ctx: TeardownOptions,
): void => {
  if (session.isClosed) {
    return;
  }

  session.isClosed = true;
  clearIdleCloseTimer(session);
  clearPromptTimers(session);
  ctx.onSessionEnd?.(sessionId, {
    reason: resolveSessionEndReason(event.reason),
    endedAt: resolveEndedAt(event.timestamp),
    ...exitSignalFields(event),
  });

  if (session.statePollTimer) {
    clearInterval(session.statePollTimer);
    session.statePollTimer = undefined;
  }

  for (const disposable of session.ptyDisposables ?? []) {
    try {
      disposable.dispose();
    } catch {
      // Ignore listener cleanup errors; the PTY teardown below is still required.
    }
  }
  session.ptyDisposables = [];

  if (options.killPty) {
    try {
      session.pty.kill(options.killSignal);
    } catch {
      // Ignore teardown errors; session will still be discarded.
    }
  }

  for (const client of session.clients) {
    if (client.readyState === 1) {
      client.close();
    }
  }
  session.clients.clear();
  session.directListeners.clear();
  session.debugLog?.end();
  session.debugLog = undefined;

  appendTranscriptEvent(session, {
    type: "session_end",
    eventId: `${sessionId}:${++ctx.transcriptEventSequence.value}`,
    sessionId,
    reason: resolveSessionEndReason(event.reason),
    timestamp: resolveEndedAt(event.timestamp),
    ...exitSignalFields(event),
  });
  session.transcriptLog = undefined;

  if (ctx.sessions.get(sessionId) === session) {
    ctx.sessions.delete(sessionId);
  }
};

// ---------------------------------------------------------------------------
// Named close/stop/kill helpers (thin wrappers over teardownSession)
// ---------------------------------------------------------------------------

export const closeSession = (
  sessionId: string,
  sessions: Map<string, TerminalSession>,
  ctx: TeardownOptions,
): boolean => {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  teardownSession(
    sessionId,
    session,
    {
      type: "session_end",
      reason: "session_close",
      timestamp: new Date().toISOString(),
    },
    { killPty: true },
    ctx,
  );
  return true;
};

export const stopSession = (
  sessionId: string,
  sessions: Map<string, TerminalSession>,
  ctx: TeardownOptions,
): boolean => {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  teardownSession(
    sessionId,
    session,
    {
      type: "session_end",
      reason: "operator_stop",
      timestamp: new Date().toISOString(),
    },
    { killPty: true },
    ctx,
  );
  return true;
};

export const killSession = (
  sessionId: string,
  signal: string,
  sessions: Map<string, TerminalSession>,
  ctx: TeardownOptions,
): boolean => {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  teardownSession(
    sessionId,
    session,
    {
      type: "session_end",
      reason: "operator_kill",
      signal,
      timestamp: new Date().toISOString(),
    },
    { killPty: true, killSignal: signal },
    ctx,
  );
  return true;
};
