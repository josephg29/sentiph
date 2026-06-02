import type { TerminalSnapshot } from "@sentiph/core";
import type { WebSocket } from "ws";

import { DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS } from "./constants";
import type {
  PersistedTerminal,
  PersistedUiState,
  TerminalLifecycleState,
  TerminalSession,
} from "./types";

const WS_READYSTATE_OPEN = 1;

// ---------------------------------------------------------------------------
// Lifecycle → snapshot state mapping
// ---------------------------------------------------------------------------

const lifecycleStateToAgentState = (
  lifecycleState: TerminalLifecycleState,
): TerminalSnapshot["state"] => {
  switch (lifecycleState) {
    case "stale":
      return "stale";
    case "exited":
      return "exited";
    case "stopped":
      return "stopped";
    default:
      return "live";
  }
};

// ---------------------------------------------------------------------------
// toTerminalSnapshot
// ---------------------------------------------------------------------------

export const makeToTerminalSnapshot =
  (sessions: Map<string, TerminalSession>, uiStateRef: { current: PersistedUiState }) =>
  (terminal: PersistedTerminal): TerminalSnapshot => {
    const session = sessions.get(terminal.terminalId);
    const lifecycleState: TerminalLifecycleState = session
      ? "running"
      : (terminal.lifecycleState ?? "registered");
    const thresholdMs =
      uiStateRef.current.terminalInactivityThresholdMs ?? DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS;
    const hasUserPrompt = terminal.lastActiveAt
      ? Date.now() - new Date(terminal.lastActiveAt).getTime() < thresholdMs
      : false;
    return {
      terminalId: terminal.terminalId,
      label: terminal.terminalId,
      state: lifecycleStateToAgentState(lifecycleState),
      tentacleId: terminal.tentacleId,
      tentacleName: terminal.tentacleName,
      ...(terminal.color ? { color: terminal.color } : {}),
      workspaceMode: terminal.workspaceMode,
      createdAt: terminal.createdAt,
      hasUserPrompt,
      ...(terminal.parentTerminalId ? { parentTerminalId: terminal.parentTerminalId } : {}),
      ...(session ? { agentRuntimeState: session.agentState } : {}),
      ...(session
        ? { agentStateChangedAt: new Date(session.agentStateChangedAt).toISOString() }
        : {}),
      lifecycleState,
      ...(terminal.lifecycleReason ? { lifecycleReason: terminal.lifecycleReason } : {}),
      ...(terminal.lifecycleUpdatedAt ? { lifecycleUpdatedAt: terminal.lifecycleUpdatedAt } : {}),
      ...(terminal.processId ? { processId: terminal.processId } : {}),
      ...(terminal.startedAt ? { startedAt: terminal.startedAt } : {}),
      ...(terminal.endedAt ? { endedAt: terminal.endedAt } : {}),
      ...(terminal.exitCode !== undefined ? { exitCode: terminal.exitCode } : {}),
      ...(terminal.exitSignal !== undefined ? { exitSignal: terminal.exitSignal } : {}),
    };
  };

// ---------------------------------------------------------------------------
// Terminal event broadcasting
// ---------------------------------------------------------------------------

export const makeBroadcastTerminalEvent =
  (terminalEventClients: Set<WebSocket>) =>
  (event: Record<string, unknown>): void => {
    const payload = JSON.stringify(event);
    for (const client of terminalEventClients) {
      if (client.readyState !== WS_READYSTATE_OPEN) {
        continue;
      }
      client.send(payload);
    }
  };
