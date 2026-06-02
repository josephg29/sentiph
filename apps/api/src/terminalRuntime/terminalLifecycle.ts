import type { TerminalSnapshot } from "@sentiph/core";

import type {
  PersistedTerminal,
  TerminalLifecycleState,
  TerminalSessionEndDetails,
  TerminalSessionEndReason,
} from "./types";

// ---------------------------------------------------------------------------
// Process-alive check
// ---------------------------------------------------------------------------

export const isProcessAlive = (pid: number | undefined): boolean => {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Cascade collection
// ---------------------------------------------------------------------------

const collectTerminalCascade = (
  rootTerminalId: string,
  terminals: Map<string, PersistedTerminal>,
): string[] => {
  const toDelete = new Set<string>();
  const queue = [rootTerminalId];

  while (queue.length > 0) {
    const currentTerminalId = queue.shift();
    if (!currentTerminalId || toDelete.has(currentTerminalId)) {
      continue;
    }

    toDelete.add(currentTerminalId);
    for (const terminal of terminals.values()) {
      if (terminal.parentTerminalId === currentTerminalId) {
        queue.push(terminal.terminalId);
      }
    }
  }

  return Array.from(toDelete);
};

// ---------------------------------------------------------------------------
// Lifecycle marker context
// ---------------------------------------------------------------------------

export type LifecycleMarkerContext = {
  terminals: Map<string, PersistedTerminal>;
  persistRegistry: () => void;
  broadcastTerminalEvent: (event: Record<string, unknown>) => void;
  toTerminalSnapshot: (terminal: PersistedTerminal) => TerminalSnapshot;
  onSessionStart?: (terminalId: string, details: { processId?: number; startedAt: string }) => void;
  onSessionEnd?: (terminalId: string, details: TerminalSessionEndDetails) => void;
  metricsOnSessionStart: (terminal: PersistedTerminal) => void;
  metricsOnSessionEnd: (
    terminalId: string,
    exitCode: number | undefined,
    signal: string | number | undefined,
    reason: TerminalSessionEndReason,
  ) => void;
  metricsOnStateChange: (terminalId: string, agentRuntimeState: string) => void;
};

// ---------------------------------------------------------------------------
// markTerminalRunning / markTerminalEnded
// ---------------------------------------------------------------------------

export const markTerminalRunning = (
  terminalId: string,
  details: { processId?: number; startedAt: string },
  ctx: LifecycleMarkerContext,
): void => {
  const terminal = ctx.terminals.get(terminalId);
  if (!terminal) {
    return;
  }

  terminal.lifecycleState = "running";
  terminal.lifecycleReason = undefined;
  terminal.lifecycleUpdatedAt = details.startedAt;
  terminal.startedAt = details.startedAt;
  terminal.endedAt = undefined;
  terminal.exitCode = undefined;
  terminal.exitSignal = undefined;
  if (details.processId !== undefined) {
    terminal.processId = details.processId;
  } else {
    terminal.processId = undefined;
  }
  ctx.persistRegistry();
  ctx.metricsOnSessionStart(terminal);
  ctx.broadcastTerminalEvent({
    type: "terminal-updated",
    snapshot: ctx.toTerminalSnapshot(terminal),
  });
};

export const markTerminalEnded = (
  terminalId: string,
  details: TerminalSessionEndDetails,
  ctx: LifecycleMarkerContext,
): void => {
  const terminal = ctx.terminals.get(terminalId);
  if (!terminal) {
    return;
  }

  terminal.lifecycleState = details.reason === "pty_exit" ? "exited" : "stopped";
  terminal.lifecycleReason = details.reason;
  terminal.lifecycleUpdatedAt = details.endedAt;
  terminal.endedAt = details.endedAt;
  terminal.processId = undefined;
  if (details.exitCode !== undefined) {
    terminal.exitCode = details.exitCode;
  } else {
    terminal.exitCode = undefined;
  }
  if (details.signal !== undefined) {
    terminal.exitSignal = details.signal;
  } else {
    terminal.exitSignal = undefined;
  }
  ctx.persistRegistry();
  ctx.metricsOnSessionEnd(terminalId, details.exitCode, details.signal, details.reason);
  ctx.broadcastTerminalEvent({
    type: "terminal-updated",
    snapshot: ctx.toTerminalSnapshot(terminal),
  });
};

// ---------------------------------------------------------------------------
// reconcilePersistedLifecycle
// ---------------------------------------------------------------------------

export const reconcilePersistedLifecycle = (
  terminals: Map<string, PersistedTerminal>,
  persistRegistry: () => void,
): void => {
  let didChange = false;
  const now = new Date().toISOString();

  for (const terminal of terminals.values()) {
    if (terminal.lifecycleState !== "running") {
      continue;
    }

    terminal.lifecycleState = "stale";
    terminal.lifecycleReason = isProcessAlive(terminal.processId)
      ? "orphaned_process"
      : "missing_process";
    terminal.lifecycleUpdatedAt = now;
    didChange = true;
  }

  if (didChange) {
    persistRegistry();
  }
};

// ---------------------------------------------------------------------------
// stopTerminal / killTerminal / pruneTerminals / deleteTerminal
// ---------------------------------------------------------------------------

export type TerminalOpsContext = LifecycleMarkerContext & {
  sessions: Map<string, import("./types").TerminalSession>;
  sessionRuntime: {
    stopSession: (sessionId: string) => boolean;
    killSession: (sessionId: string, signal?: string) => boolean;
    closeSession: (sessionId: string) => boolean;
  };
  worktreeManager: {
    removeTentacleWorktree: (tentacleId: string) => void;
  };
};

export const stopTerminal = (
  terminalId: string,
  ctx: TerminalOpsContext,
): TerminalSnapshot | null => {
  const terminal = ctx.terminals.get(terminalId);
  if (!terminal) {
    return null;
  }

  const stoppedActiveSession = ctx.sessionRuntime.stopSession(terminalId);
  if (!stoppedActiveSession && isProcessAlive(terminal.processId)) {
    try {
      process.kill(terminal.processId as number, "SIGTERM");
    } catch {
      // The lifecycle marker below still removes this terminal from the active set.
    }
  }

  if (!stoppedActiveSession) {
    markTerminalEnded(
      terminalId,
      {
        reason: "operator_stop",
        endedAt: new Date().toISOString(),
      },
      ctx,
    );
  }

  return ctx.toTerminalSnapshot(terminal);
};

export const killTerminal = (
  terminalId: string,
  ctx: TerminalOpsContext,
): TerminalSnapshot | null => {
  const terminal = ctx.terminals.get(terminalId);
  if (!terminal) {
    return null;
  }

  const signal = "SIGKILL";
  const killedActiveSession = ctx.sessionRuntime.killSession(terminalId, signal);
  if (!killedActiveSession && isProcessAlive(terminal.processId)) {
    try {
      process.kill(terminal.processId as number, signal);
    } catch {
      // The lifecycle marker below still removes this terminal from the active set.
    }
  }

  if (!killedActiveSession) {
    markTerminalEnded(
      terminalId,
      {
        reason: "operator_kill",
        signal,
        endedAt: new Date().toISOString(),
      },
      ctx,
    );
  }

  return ctx.toTerminalSnapshot(terminal);
};

export const pruneTerminals = (
  terminals: Map<string, PersistedTerminal>,
  sessions: Map<string, import("./types").TerminalSession>,
  persistRegistry: () => void,
  broadcastTerminalEvent: (event: Record<string, unknown>) => void,
): string[] => {
  const prunableStates = new Set<TerminalLifecycleState>(["stale", "exited", "stopped"]);
  const prunedTerminalIds: string[] = [];

  for (const terminal of terminals.values()) {
    const lifecycleState = terminal.lifecycleState ?? "registered";
    if (!prunableStates.has(lifecycleState) || sessions.has(terminal.terminalId)) {
      continue;
    }

    prunedTerminalIds.push(terminal.terminalId);
  }

  if (prunedTerminalIds.length === 0) {
    return [];
  }

  for (const terminalId of prunedTerminalIds) {
    terminals.delete(terminalId);
  }

  persistRegistry();
  for (const terminalId of prunedTerminalIds) {
    broadcastTerminalEvent({
      type: "terminal-deleted",
      terminalId,
    });
  }
  return prunedTerminalIds;
};

export const deleteTerminal = (terminalId: string, ctx: TerminalOpsContext): boolean => {
  const terminal = ctx.terminals.get(terminalId);
  if (!terminal) {
    return false;
  }

  const cascadeTerminalIds = collectTerminalCascade(terminalId, ctx.terminals);
  for (const cascadeTerminalId of cascadeTerminalIds) {
    const cascadeTerminal = ctx.terminals.get(cascadeTerminalId);
    if (!cascadeTerminal) {
      continue;
    }

    ctx.sessionRuntime.closeSession(cascadeTerminalId);
    if (cascadeTerminal.workspaceMode === "worktree") {
      ctx.worktreeManager.removeTentacleWorktree(
        cascadeTerminal.worktreeId ?? cascadeTerminal.tentacleId,
      );
    }
    ctx.terminals.delete(cascadeTerminalId);
  }

  ctx.persistRegistry();
  for (const cascadeTerminalId of cascadeTerminalIds) {
    ctx.broadcastTerminalEvent({
      type: "terminal-deleted",
      terminalId: cascadeTerminalId,
    });
  }
  return true;
};
