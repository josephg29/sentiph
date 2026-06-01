import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join, relative } from "node:path";
import type { Duplex } from "node:stream";

import { createAgentMetricsCollector } from "./agentMetricsCollector";

import type { TerminalSnapshot } from "@sentiph/core";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

// The repo's ws-shim.d.ts exposes WebSocket only as an interface, so the runtime
// OPEN constant isn't typed. The value 1 is the canonical WebSocket.OPEN.
const WS_READYSTATE_OPEN = 1;

import {
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS,
  SENTIPH_TENTACLE_ID,
  TERMINAL_ID_PREFIX,
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

export const MAX_CHILDREN_PER_PARENT = 32;

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
  const websocketServer = new WebSocketServer({ noServer: true });
  const terminalEventsWebsocketServer = new WebSocketServer({ noServer: true });
  const terminalEventClients = new Set<WebSocket>();
  const registryPath = join(stateDir, "state", "tentacles.json");
  const registryState = loadTerminalRegistry(registryPath);
  const registryPersistence = createTerminalRegistryPersistence(registryPath);
  const terminals = registryState.terminals;
  let uiState = registryState.uiState;
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
    registryPersistence.schedulePersist({
      terminals,
      uiState,
    });
  };

  const isProcessAlive = (pid: number | undefined): boolean => {
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

  const markTerminalRunning = (
    terminalId: string,
    { processId, startedAt }: TerminalSessionStartDetails,
  ) => {
    const terminal = terminals.get(terminalId);
    if (!terminal) {
      return;
    }

    terminal.lifecycleState = "running";
    terminal.lifecycleReason = undefined;
    terminal.lifecycleUpdatedAt = startedAt;
    terminal.startedAt = startedAt;
    terminal.endedAt = undefined;
    terminal.exitCode = undefined;
    terminal.exitSignal = undefined;
    if (processId !== undefined) {
      terminal.processId = processId;
    } else {
      terminal.processId = undefined;
    }
    persistRegistry();
    metricsCollector.onSessionStart(terminal);
    broadcastTerminalEvent({
      type: "terminal-updated",
      snapshot: toTerminalSnapshot(terminal),
    });
  };

  const markTerminalEnded = (terminalId: string, details: TerminalSessionEndDetails) => {
    const terminal = terminals.get(terminalId);
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
    persistRegistry();
    metricsCollector.onSessionEnd(terminalId, details.exitCode, details.signal, details.reason);
    broadcastTerminalEvent({
      type: "terminal-updated",
      snapshot: toTerminalSnapshot(terminal),
    });
  };

  const reconcilePersistedLifecycle = () => {
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

  const worktreesDir = join(stateDir, "worktrees");

  const GENERATED_NAME_PATTERN = /^Agent \d+$|^Sentiph Terminal \d+$/;

  const worktreeManager = createWorktreeManager({ worktreesDir, workspaceCwd, gitClient });

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
    broadcastTerminalEvent({
      type: "terminal-state-changed",
      terminalId,
      agentRuntimeState,
      ...(toolName ? { toolName } : {}),
    });
  };

  const transcriptDirectoryPath = join(stateDir, "state", "transcripts");

  const sessionRuntime = createSessionRuntime({
    websocketServer,
    terminals,
    sessions,
    resolveTerminalSession,
    getTentacleWorkspaceCwd: worktreeManager.getTentacleWorkspaceCwd,
    isDebugPtyLogsEnabled,
    ptyLogDir,
    transcriptDirectoryPath,
    maxConcurrentSessions: configuredMaxConcurrentSessions,
    onStateChange: broadcastTerminalStateChanged,
    onSessionStart: markTerminalRunning,
    onSessionEnd: markTerminalEnded,
    onOutputChunk: metricsCollector.onOutputChunk,
    sentiphMcpConfigPath,
    ...(sentiphSystemPromptPath ? { sentiphSystemPromptPath } : {}),
  });

  const gitOps = createGitOps({ terminals, worktreesDir, gitClient });
  const conversationStore = createConversationStore(stateDir);

  reconcilePersistedLifecycle();

  const allocateTerminalId = () => {
    let candidateNumber = 1;
    while (candidateNumber < Number.MAX_SAFE_INTEGER) {
      const candidateId = `${TERMINAL_ID_PREFIX}${candidateNumber}`;
      if (terminals.has(candidateId)) {
        candidateNumber += 1;
        continue;
      }

      if (sessions.has(candidateId)) {
        candidateNumber += 1;
        continue;
      }

      if (worktreeManager.hasTentacleWorktree(candidateId)) {
        candidateNumber += 1;
        continue;
      }

      return candidateId;
    }

    throw new Error("Unable to allocate terminal id.");
  };

  const allocateDefaultTerminalName = (): string => {
    const usedNumbers = new Set<number>();
    const pattern = /^Agent (\d+)$/;
    for (const t of terminals.values()) {
      const match = pattern.exec(t.tentacleName);
      if (match) usedNumbers.add(Number(match[1]));
    }
    let n = 1;
    while (usedNumbers.has(n)) n++;
    return `Agent ${n}`;
  };

  const isTerminalRecentlyActive = (terminal: PersistedTerminal): boolean => {
    if (!terminal.lastActiveAt) return false;
    const thresholdMs =
      uiState.terminalInactivityThresholdMs ?? DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS;
    return Date.now() - new Date(terminal.lastActiveAt).getTime() < thresholdMs;
  };

  const toTerminalSnapshot = (terminal: PersistedTerminal): TerminalSnapshot => {
    const session = sessions.get(terminal.terminalId);
    const lifecycleState: TerminalLifecycleState = session
      ? "running"
      : (terminal.lifecycleState ?? "registered");
    return {
      terminalId: terminal.terminalId,
      label: terminal.terminalId,
      state: lifecycleStateToAgentState(lifecycleState),
      tentacleId: terminal.tentacleId,
      tentacleName: terminal.tentacleName,
      ...(terminal.color ? { color: terminal.color } : {}),
      workspaceMode: terminal.workspaceMode,
      createdAt: terminal.createdAt,
      hasUserPrompt: isTerminalRecentlyActive(terminal),
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

  const broadcastTerminalEvent = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    for (const client of terminalEventClients) {
      if (client.readyState !== WS_READYSTATE_OPEN) {
        continue;
      }
      client.send(payload);
    }
  };

  const broadcastTerminalListChanged = () => {
    broadcastTerminalEvent({ type: "terminal-list-changed" });
  };

  const collectTerminalCascade = (rootTerminalId: string): string[] => {
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

  const createTerminal = ({
    terminalId: requestedTerminalId,
    tentacleId: requestedTentacleId,
    worktreeId: requestedWorktreeId,
    tentacleName,
    color,
    workspaceMode = "shared",
    agentProvider,
    initialPrompt,
    initialInputDraft,
    baseRef,
    parentTerminalId,
    nameOrigin,
    autoRenamePromptContext,
    isGroupLeader,
    model,
    effort,
  }: {
    terminalId?: string;
    tentacleId?: string;
    worktreeId?: string;
    tentacleName?: string;
    color?: string;
    workspaceMode?: TentacleWorkspaceMode;
    agentProvider?: TerminalAgentProvider;
    initialPrompt?: string;
    initialInputDraft?: string;
    baseRef?: string;
    parentTerminalId?: string;
    nameOrigin?: TerminalNameOrigin;
    autoRenamePromptContext?: string;
    isGroupLeader?: boolean;
    model?: TerminalModel;
    effort?: TerminalEffort;
  }): TerminalSnapshot => {
    // Sentiph is a singleton: if a terminal with that tentacleId already exists,
    // ensure its session is running and return the existing snapshot instead of
    // creating a duplicate that would orphan the live session.
    if (requestedTentacleId === SENTIPH_TENTACLE_ID) {
      const existingSentiph = [...terminals.values()].find(
        (t) => t.tentacleId === SENTIPH_TENTACLE_ID,
      );
      if (existingSentiph) {
        sessionRuntime.startSession(existingSentiph.terminalId);
        return toTerminalSnapshot(existingSentiph);
      }
    }

    // Enforce max children per parent.
    if (parentTerminalId) {
      const childCount = [...terminals.values()].filter(
        (t) => t.parentTerminalId === parentTerminalId,
      ).length;
      if (childCount >= MAX_CHILDREN_PER_PARENT) {
        throw new RuntimeInputError(
          `Parent terminal "${parentTerminalId}" already has ${MAX_CHILDREN_PER_PARENT} children (limit reached).`,
        );
      }
    }

    const terminalId =
      requestedTerminalId && !terminals.has(requestedTerminalId)
        ? requestedTerminalId
        : allocateTerminalId();

    if (initialPrompt) {
      const capacity = sessionRuntime.getSessionCapacity();
      if (capacity.active >= capacity.max) {
        throw new RuntimeInputError(
          `Terminal session limit reached (${capacity.max}). Close an existing terminal session or increase SENTIPH_MAX_TERMINAL_SESSIONS.`,
        );
      }
    }

    // Allow explicit tentacleId so multiple terminals can share a tentacle context (e.g. swarm workers).
    const tentacleId = requestedTentacleId ?? terminalId;
    const effectiveName =
      tentacleName ??
      (tentacleId === SENTIPH_TENTACLE_ID ? "Sentiph" : allocateDefaultTerminalName());

    // Auto-generate initialInputDraft from tentacle CONTEXT.md when not explicitly provided.
    if (!initialInputDraft && tentacleId && tentacleId !== SENTIPH_TENTACLE_ID) {
      const tentacleDir = join(stateDir, "tentacles", tentacleId);
      const contextPath = join(tentacleDir, "CONTEXT.md");
      if (existsSync(contextPath)) {
        const contextContent = readFileSync(contextPath, "utf8");
        const headingMatch = /^#\s+(.+)$/m.exec(contextContent);
        if (headingMatch) {
          const sectionName = (headingMatch[1] ?? "").trim();
          const relativeTentacleDir = relative(workspaceCwd, tentacleDir);
          initialInputDraft = `You are working on the ${sectionName} section. For tool-list items, context, and docs, check ${relativeTentacleDir}.`;
        }
      }
    }

    // Auto-allocate a unique worktreeId when creating a worktree terminal
    // so multiple worktree terminals can coexist (each gets its own directory).
    const worktreeId =
      requestedWorktreeId ?? (workspaceMode === "worktree" ? terminalId : undefined);

    const terminal: PersistedTerminal = {
      terminalId,
      tentacleId,
      ...(worktreeId ? { worktreeId } : {}),
      tentacleName: effectiveName,
      ...(color ? { color } : {}),
      nameOrigin: nameOrigin ?? (tentacleName ? "user" : "generated"),
      ...(autoRenamePromptContext ? { autoRenamePromptContext } : {}),
      createdAt: new Date().toISOString(),
      workspaceMode,
      agentProvider: agentProvider ?? DEFAULT_AGENT_PROVIDER,
      lifecycleState: "registered",
      lifecycleUpdatedAt: new Date().toISOString(),
      ...(initialPrompt ? { initialPrompt } : {}),
      ...(initialInputDraft ? { initialInputDraft } : {}),
      ...(initialPrompt ? { lastActiveAt: new Date().toISOString() } : {}),
      ...(parentTerminalId ? { parentTerminalId } : {}),
      ...(isGroupLeader ? { isGroupLeader: true } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    };

    const effectiveWorktreeId = worktreeId ?? tentacleId;
    const shouldCreateWorktree = workspaceMode === "worktree";
    if (shouldCreateWorktree) {
      worktreeManager.createTentacleWorktree(effectiveWorktreeId, baseRef);
    }

    terminals.set(terminalId, terminal);
    persistRegistry();
    broadcastTerminalEvent({
      type: "terminal-created",
      snapshot: toTerminalSnapshot(terminal),
    });

    if (initialPrompt || tentacleId === SENTIPH_TENTACLE_ID) {
      sessionRuntime.startSession(terminalId);
    }

    return toTerminalSnapshot(terminal);
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

    createTerminal,

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
      const terminal = terminals.get(terminalId);
      if (!terminal) {
        return null;
      }

      const stoppedActiveSession = sessionRuntime.stopSession(terminalId);
      if (!stoppedActiveSession && isProcessAlive(terminal.processId)) {
        try {
          process.kill(terminal.processId as number, "SIGTERM");
        } catch {
          // The lifecycle marker below still removes this terminal from the active set.
        }
      }

      if (!stoppedActiveSession) {
        markTerminalEnded(terminalId, {
          reason: "operator_stop",
          endedAt: new Date().toISOString(),
        });
      }

      return toTerminalSnapshot(terminal);
    },

    killTerminal(terminalId: string): TerminalSnapshot | null {
      const terminal = terminals.get(terminalId);
      if (!terminal) {
        return null;
      }

      const signal = "SIGKILL";
      const killedActiveSession = sessionRuntime.killSession(terminalId, signal);
      if (!killedActiveSession && isProcessAlive(terminal.processId)) {
        try {
          process.kill(terminal.processId as number, signal);
        } catch {
          // The lifecycle marker below still removes this terminal from the active set.
        }
      }

      if (!killedActiveSession) {
        markTerminalEnded(terminalId, {
          reason: "operator_kill",
          signal,
          endedAt: new Date().toISOString(),
        });
      }

      return toTerminalSnapshot(terminal);
    },

    pruneTerminals(): string[] {
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
    },

    deleteTerminal(terminalId: string): boolean {
      const terminal = terminals.get(terminalId);
      if (!terminal) {
        return false;
      }

      const cascadeTerminalIds = collectTerminalCascade(terminalId);
      for (const cascadeTerminalId of cascadeTerminalIds) {
        const cascadeTerminal = terminals.get(cascadeTerminalId);
        if (!cascadeTerminal) {
          continue;
        }

        sessionRuntime.closeSession(cascadeTerminalId);
        if (cascadeTerminal.workspaceMode === "worktree") {
          worktreeManager.removeTentacleWorktree(
            cascadeTerminal.worktreeId ?? cascadeTerminal.tentacleId,
          );
        }
        terminals.delete(cascadeTerminalId);
      }

      persistRegistry();
      for (const cascadeTerminalId of cascadeTerminalIds) {
        broadcastTerminalEvent({
          type: "terminal-deleted",
          terminalId: cascadeTerminalId,
        });
      }
      return true;
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
