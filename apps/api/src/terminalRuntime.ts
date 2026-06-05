import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import { formatChannelDelivery } from "@sentiph/core";
import type { ChannelMessage, TerminalSnapshot } from "@sentiph/core";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

import { createAgentMetricsCollector } from "./agentMetricsCollector";
import { createChannelStore } from "./terminalRuntime/channelStore";
import {
  DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS,
  SENTIPH_TENTACLE_ID,
  TERMINAL_MAX_CONCURRENT_SESSIONS,
} from "./terminalRuntime/constants";
import { createConversationStore } from "./terminalRuntime/conversationStore";
import { createGitOps } from "./terminalRuntime/gitOps";
import { writeSentiphMcpConfig, writeSentiphSystemPrompt } from "./terminalRuntime/mcpConfig";
import {
  createTerminalRegistryPersistence,
  loadTerminalRegistry,
  pruneUiStateTerminalReferences,
} from "./terminalRuntime/registry";
import { createSessionRuntime } from "./terminalRuntime/sessionRuntime";
import { createTentacleStore } from "./terminalRuntime/tentacleStore";
import {
  type CreateTerminalContext,
  type CreateTerminalParams,
  createTerminal as factoryCreateTerminal,
} from "./terminalRuntime/terminalFactory";
import {
  type LifecycleMarkerContext,
  type TerminalOpsContext,
  isProcessAlive,
  deleteTerminal as lifecycleDeleteTerminal,
  killTerminal as lifecycleKillTerminal,
  pruneTerminals as lifecyclePruneTerminals,
  stopTerminal as lifecycleStopTerminal,
  markTerminalEnded,
  markTerminalRunning,
  reconcilePersistedLifecycle,
} from "./terminalRuntime/terminalLifecycle";
import {
  makeBroadcastTerminalEvent,
  makeToTerminalSnapshot,
} from "./terminalRuntime/terminalSnapshot";
import type { DirectSessionListener } from "./terminalRuntime/types";
import {
  type CreateTerminalRuntimeOptions,
  type PersistedTerminal,
  type PersistedUiState,
  RuntimeInputError,
  type TentacleWorkspaceMode,
  type TerminalAgentProvider,
  type TerminalEffort,
  type TerminalLifecycleState,
  type TerminalModel,
  type TerminalNameOrigin,
  type TerminalSession,
  type TerminalSessionEndDetails,
  type TerminalSessionStartDetails,
} from "./terminalRuntime/types";
import { applyUiStatePatch, readUiStateSnapshot } from "./terminalRuntime/uiState";
import { createWorktreeManager } from "./terminalRuntime/worktreeManager";

export type {
  GitClient,
  PersistedUiState,
  TerminalAgentProvider,
  TerminalEffort,
  TerminalModel,
  TerminalNameOrigin,
  TentacleWorkspaceMode,
} from "./terminalRuntime/types";
export {
  isTerminalAgentProvider,
  isTerminalCompletionSoundId,
  isTerminalEffort,
  isTerminalModel,
} from "./terminalRuntime/types";
export { RuntimeInputError } from "./terminalRuntime/types";

export const createTerminalRuntime = ({
  workspaceCwd,
  projectStateDir,
  gitClient,
  getApiBaseUrl = () => process.env.SENTIPH_API_ORIGIN ?? "http://127.0.0.1:8787",
  maxConcurrentSessions,
}: CreateTerminalRuntimeOptions) => {
  const stateDir = projectStateDir ?? join(workspaceCwd, ".sentiph");
  const metricsDir = join(stateDir, "state", "metrics");
  const metricsCollector = createAgentMetricsCollector(metricsDir);
  const sentiphMcpConfigPath = writeSentiphMcpConfig(stateDir);
  const sentiphSystemPromptPath = writeSentiphSystemPrompt(stateDir);
  const sessions = new Map<string, TerminalSession>();
  const channelStore = createChannelStore();
  const tentacleStore = createTentacleStore(join(stateDir, "tentacles"));
  // Last known agent runtime state per terminal, used to deliver queued channel
  // messages the moment a target becomes idle (and to deliver on send when the
  // target is already idle).
  const lastAgentState = new Map<string, string>();
  const websocketServer = new WebSocketServer({ noServer: true });
  const terminalEventsWebsocketServer = new WebSocketServer({ noServer: true });
  const terminalEventClients = new Set<WebSocket>();
  const registryPath = join(stateDir, "state", "tentacles.json");
  const registryState = loadTerminalRegistry(registryPath);
  const registryPersistence = createTerminalRegistryPersistence(registryPath);
  const terminals = registryState.terminals;
  let uiState = registryState.uiState;
  const uiStateRef = {
    get current() {
      return uiState;
    },
  };
  const isDebugPtyLogsEnabled = process.env.SENTIPH_DEBUG_PTY_LOGS === "1";
  const ptyLogDir = process.env.SENTIPH_DEBUG_PTY_LOG_DIR ?? join(stateDir, "logs");
  const configuredMaxConcurrentSessions = (() => {
    if (maxConcurrentSessions !== undefined) {
      return maxConcurrentSessions;
    }

    const raw = process.env.SENTIPH_MAX_TERMINAL_SESSIONS?.trim();
    if (!raw) {
      return TERMINAL_MAX_CONCURRENT_SESSIONS;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 1
      ? Math.floor(parsed)
      : TERMINAL_MAX_CONCURRENT_SESSIONS;
  })();

  const persistRegistry = () => {
    uiState = pruneUiStateTerminalReferences(uiState, terminals);
    registryPersistence.schedulePersist({ terminals, uiState });
  };

  // ---------------------------------------------------------------------------
  // Terminal event broadcasting
  // ---------------------------------------------------------------------------

  const broadcastTerminalEvent = makeBroadcastTerminalEvent(terminalEventClients);

  // ---------------------------------------------------------------------------
  // Snapshot builder
  // ---------------------------------------------------------------------------

  const toTerminalSnapshot = makeToTerminalSnapshot(sessions, uiStateRef);

  // ---------------------------------------------------------------------------
  // Session runtime
  // ---------------------------------------------------------------------------

  const GENERATED_NAME_PATTERN = /^Agent \d+$|^Sentiph Terminal \d+$/;

  const resolveTerminalSession = (
    terminalId: string,
  ): { sessionId: string; tentacleId: string } | null => {
    const terminal = terminals.get(terminalId);
    if (terminal) {
      return {
        sessionId: terminalId,
        tentacleId: terminal.worktreeId ?? terminal.tentacleId,
      };
    }

    return null;
  };

  const broadcastTerminalStateChanged = (
    terminalId: string,
    agentRuntimeState: string,
    toolName?: string,
  ) => {
    metricsCollector.onStateChange(terminalId, agentRuntimeState);
    lastAgentState.set(terminalId, agentRuntimeState);
    broadcastTerminalEvent({
      type: "terminal-state-changed",
      terminalId,
      agentRuntimeState,
      ...(toolName ? { toolName } : {}),
    });
    if (agentRuntimeState === "idle") {
      deliverPendingChannelMessages(terminalId);
    }
  };

  // Inject any queued channel messages into a target terminal's PTY. Best-effort:
  // if the session is not currently writable, messages stay pending and are retried
  // on the next idle transition.
  const deliverPendingChannelMessages = (terminalId: string) => {
    for (const message of channelStore.takePending(terminalId)) {
      const ok = sessionRuntime.writeInput(terminalId, `${formatChannelDelivery(message)}\r`);
      if (!ok) {
        return;
      }
      channelStore.markDelivered(terminalId, message.messageId);
    }
  };

  const transcriptDirectoryPath = join(stateDir, "state", "transcripts");

  // ---------------------------------------------------------------------------
  // Lifecycle marker context
  // ---------------------------------------------------------------------------

  const lifecycleCtx: LifecycleMarkerContext = {
    terminals,
    persistRegistry,
    broadcastTerminalEvent,
    toTerminalSnapshot,
    metricsOnSessionStart: (terminal) => metricsCollector.onSessionStart(terminal),
    metricsOnSessionEnd: (terminalId, exitCode, signal, reason) =>
      metricsCollector.onSessionEnd(terminalId, exitCode, signal, reason),
    metricsOnStateChange: (terminalId, agentRuntimeState) =>
      metricsCollector.onStateChange(terminalId, agentRuntimeState),
  };

  const sessionRuntime = createSessionRuntime({
    websocketServer,
    terminals,
    sessions,
    resolveTerminalSession,
    getTentacleWorkspaceCwd: (tentacleId) => worktreeManager.getTentacleWorkspaceCwd(tentacleId),
    isDebugPtyLogsEnabled,
    ptyLogDir,
    transcriptDirectoryPath,
    maxConcurrentSessions: configuredMaxConcurrentSessions,
    onStateChange: broadcastTerminalStateChanged,
    onSessionStart: (terminalId, details) => markTerminalRunning(terminalId, details, lifecycleCtx),
    onSessionEnd: (terminalId, details) => markTerminalEnded(terminalId, details, lifecycleCtx),
    onOutputChunk: metricsCollector.onOutputChunk,
    sentiphMcpConfigPath,
    ...(sentiphSystemPromptPath ? { sentiphSystemPromptPath } : {}),
  });

  const worktreesDir = join(stateDir, "worktrees");
  const worktreeManager = createWorktreeManager({ worktreesDir, workspaceCwd, gitClient });
  const gitOps = createGitOps({ terminals, worktreesDir, gitClient });
  const conversationStore = createConversationStore(stateDir);

  // ---------------------------------------------------------------------------
  // Terminal ops context
  // ---------------------------------------------------------------------------

  const opsCtx: TerminalOpsContext = {
    ...lifecycleCtx,
    sessions,
    sessionRuntime,
    worktreeManager,
  };

  reconcilePersistedLifecycle(terminals, persistRegistry);

  // ---------------------------------------------------------------------------
  // Factory context
  // ---------------------------------------------------------------------------

  const factoryCtx: CreateTerminalContext = {
    terminals,
    sessions,
    stateDir,
    workspaceCwd,
    persistRegistry,
    broadcastTerminalEvent,
    toTerminalSnapshot,
    hasTentacleWorktree: (id) => worktreeManager.hasTentacleWorktree(id),
    createTentacleWorktree: (id, baseRef) => worktreeManager.createTentacleWorktree(id, baseRef),
    startSession: (terminalId) => sessionRuntime.startSession(terminalId),
    getSessionCapacity: () => sessionRuntime.getSessionCapacity(),
  };

  const readUiState = (): PersistedUiState => readUiStateSnapshot(uiState, terminals);

  return {
    listTerminalSnapshots(): TerminalSnapshot[] {
      const snapshots: TerminalSnapshot[] = [];
      for (const terminal of terminals.values()) {
        snapshots.push(toTerminalSnapshot(terminal));
      }
      return snapshots;
    },

    readUiState,

    patchUiState(patch: PersistedUiState): PersistedUiState {
      applyUiStatePatch(uiState, patch);
      persistRegistry();
      return readUiState();
    },

    ...gitOps,

    createTerminal(params: CreateTerminalParams): TerminalSnapshot {
      return factoryCreateTerminal(params, factoryCtx);
    },

    renameTerminal(terminalId: string, tentacleName: string): TerminalSnapshot | null {
      const terminal = terminals.get(terminalId);
      if (!terminal) {
        return null;
      }

      terminal.tentacleName = tentacleName;
      terminal.nameOrigin = "user";
      terminal.autoRenamePromptContext = undefined;
      persistRegistry();
      broadcastTerminalEvent({
        type: "terminal-updated",
        snapshot: toTerminalSnapshot(terminal),
      });
      return toTerminalSnapshot(terminal);
    },

    stopTerminal(terminalId: string): TerminalSnapshot | null {
      return lifecycleStopTerminal(terminalId, opsCtx);
    },

    killTerminal(terminalId: string): TerminalSnapshot | null {
      return lifecycleKillTerminal(terminalId, opsCtx);
    },

    pruneTerminals(): string[] {
      return lifecyclePruneTerminals(terminals, sessions, persistRegistry, broadcastTerminalEvent);
    },

    deleteTerminal(terminalId: string): boolean {
      return lifecycleDeleteTerminal(terminalId, opsCtx);
    },

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      let requestUrl: URL;
      try {
        requestUrl = new URL(request.url ?? "/", "http://localhost");
      } catch {
        return false;
      }

      if (requestUrl.pathname === "/api/terminal-events/ws") {
        terminalEventsWebsocketServer.handleUpgrade(request, socket, head, (websocket) => {
          terminalEventClients.add(websocket);
          websocket.on("close", () => {
            terminalEventClients.delete(websocket);
          });
        });
        return true;
      }

      return sessionRuntime.handleUpgrade(request, socket, head);
    },

    connectDirect(terminalId: string, listener: DirectSessionListener): (() => void) | null {
      return sessionRuntime.connectDirect(terminalId, listener);
    },

    getScrollback(terminalId: string): string | null {
      return sessionRuntime.getScrollback(terminalId);
    },

    writeInput(terminalId: string, data: string): boolean {
      return sessionRuntime.writeInput(terminalId, data);
    },

    resizeTerminal(terminalId: string, cols: number, rows: number): boolean {
      return sessionRuntime.resizeSession(terminalId, cols, rows);
    },

    // ---- Channels (in-memory inter-terminal messaging) ----

    /**
     * Queue a channel message for a target terminal. Returns the stored message,
     * or null when the target terminal record does not exist. If the target is
     * already idle, pending messages are delivered immediately.
     */
    sendChannelMessage(input: {
      fromTerminalId: string;
      toTerminalId: string;
      content: string;
    }): ChannelMessage | null {
      if (!terminals.has(input.toTerminalId)) {
        return null;
      }
      const message = channelStore.enqueue(input);
      // Deliver immediately when the target is already idle. The session's live
      // agentState is authoritative (a terminal can be idle without ever having
      // emitted a state-change event); lastAgentState is only a fallback.
      const targetState =
        sessions.get(input.toTerminalId)?.agentState ?? lastAgentState.get(input.toTerminalId);
      if (targetState === "idle") {
        deliverPendingChannelMessages(input.toTerminalId);
      }
      return message;
    },

    listChannelMessages(terminalId: string): ChannelMessage[] {
      return channelStore.list(terminalId);
    },

    // ---- Tentacles (sessions) ----

    createTentacle(input: { name: string; description?: string; id?: string }) {
      return tentacleStore.createTentacle(input);
    },

    listTentacles() {
      return tentacleStore.listTentacles();
    },

    ...conversationStore,

    renameTerminalBySession(sessionId: string, name: string) {
      const terminal = terminals.get(sessionId);
      if (!terminal) return null;
      terminal.tentacleName = name;
      terminal.nameOrigin = "prompt";
      terminal.autoRenamePromptContext = undefined;
      persistRegistry();
      broadcastTerminalEvent({ type: "terminal-updated", snapshot: toTerminalSnapshot(terminal) });
      return toTerminalSnapshot(terminal);
    },

    renameTerminalBySessionAuto(sessionId: string, promptFallback: string) {
      const terminal = terminals.get(sessionId);
      if (!terminal) return null;

      let newName: string;
      if (terminal.autoRenamePromptContext) {
        newName = terminal.autoRenamePromptContext;
      } else if (
        terminal.nameOrigin !== "user" &&
        terminal.nameOrigin !== "prompt" &&
        GENERATED_NAME_PATTERN.test(terminal.tentacleName)
      ) {
        newName = promptFallback;
      } else {
        return null;
      }

      terminal.tentacleName = newName;
      terminal.nameOrigin = "prompt";
      terminal.autoRenamePromptContext = undefined;
      persistRegistry();
      broadcastTerminalEvent({ type: "terminal-updated", snapshot: toTerminalSnapshot(terminal) });
      return toTerminalSnapshot(terminal);
    },

    async close() {
      sessionRuntime.close();
      await registryPersistence.close();
      for (const client of terminalEventClients) {
        client.close();
      }
      terminalEventClients.clear();
      terminalEventsWebsocketServer.close();
      websocketServer.close();
    },
  };
};
