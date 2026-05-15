import type { IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";

import { createAgentMetricsCollector } from "./agentMetricsCollector";
import {
  OCTOBOSS_SYSTEM_PROMPT,
  assertOctobossSystemPromptIsShellSafe,
} from "./octobossSystemPrompt";

import type { TerminalSnapshot } from "@sentiph/core";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

// The repo's ws-shim.d.ts exposes WebSocket only as an interface, so the runtime
// OPEN constant isn't typed. The value 1 is the canonical WebSocket.OPEN.
const WS_READYSTATE_OPEN = 1;

import {
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS,
  OCTOBOSS_TENTACLE_ID,
  TERMINAL_ID_PREFIX,
  TERMINAL_MAX_CONCURRENT_SESSIONS,
} from "./terminalRuntime/constants";
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
  type TerminalLifecycleState,
  type TerminalNameOrigin,
  type TerminalSession,
  type TerminalSessionEndDetails,
  type TerminalSessionStartDetails,
} from "./terminalRuntime/types";

export type {
  GitClient,
  PersistedUiState,
  TerminalAgentProvider,
  TerminalNameOrigin,
  TentacleWorkspaceMode,
} from "./terminalRuntime/types";
export { isTerminalAgentProvider, isTerminalCompletionSoundId } from "./terminalRuntime/types";
export { RuntimeInputError } from "./terminalRuntime/types";

export const MAX_CHILDREN_PER_PARENT = 9;

const writeOctobossMcpConfig = (stateDir: string): string => {
  const configPath = join(stateDir, "octoboss-mcp-config.json");
  const mcpServerPath = fileURLToPath(new URL("./octobossMcp.ts", import.meta.url));

  const nodeCommand = process.execPath;
  let nodeArgs: string[];
  const _require = createRequire(import.meta.url);
  try {
    const tsxPkgPath = _require.resolve("tsx/package.json");
    const tsxCliPath = join(dirname(tsxPkgPath), "dist", "cli.mjs");
    nodeArgs = existsSync(tsxCliPath)
      ? [tsxCliPath, mcpServerPath]
      : ["--import", "tsx/esm", mcpServerPath];
  } catch {
    nodeArgs = ["--import", "tsx/esm", mcpServerPath];
  }

  const config = {
    mcpServers: {
      octogent: {
        command: nodeCommand,
        args: nodeArgs,
        env: {
          SENTIPH_API_ORIGIN:
            process.env.SENTIPH_API_ORIGIN ?? "http://127.0.0.1:8787",
        },
      },
    },
  };

  try {
    // Create stateDir and its state/ subdirectory unconditionally — on first
    // run the dir may not yet exist when this is called (the registry creates
    // it later), which would silently skip writing and leave Octoboss without
    // MCP tools until the next server restart.
    mkdirSync(join(stateDir, "state"), { recursive: true });
    // mode 0o600: only the owner can read this config, since it leaks the
    // local API origin to any user with read access on the state directory.
    writeFileSync(configPath, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[octoboss-mcp] Failed to write MCP config at ${configPath}: ${message}. Octoboss will start without MCP tools.`,
    );
  }
  return configPath;
};

const writeOctobossSystemPrompt = (stateDir: string): string | undefined => {
  const promptPath = join(stateDir, "octoboss-system-prompt.md");
  try {
    assertOctobossSystemPromptIsShellSafe(OCTOBOSS_SYSTEM_PROMPT);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(promptPath, OCTOBOSS_SYSTEM_PROMPT, {
      encoding: "utf-8",
      mode: 0o600,
    });
    return promptPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[octoboss-system-prompt] Failed to write system prompt at ${promptPath}: ${message}. Octoboss will start without orchestration guidance.`,
    );
    return undefined;
  }
};

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
  const octobossMcpConfigPath = writeOctobossMcpConfig(stateDir);
  const octobossSystemPromptPath = writeOctobossSystemPrompt(stateDir);
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
  const gitClientOpt = gitClient;

  const GENERATED_NAME_PATTERN = /^Agent \d+$/;

  const worktreeManager = {
    getTentacleWorkspaceCwd: (tentacleId: string) => {
      if (existsSync(join(worktreesDir, tentacleId))) {
        return join(worktreesDir, tentacleId);
      }
      return workspaceCwd;
    },
    hasTentacleWorktree: (tentacleId: string) => existsSync(join(worktreesDir, tentacleId)),
    createTentacleWorktree: (tentacleId: string, baseRef?: string) => {
      if (!gitClientOpt || !gitClientOpt.isRepository(workspaceCwd)) {
        throw new RuntimeInputError(
          "Worktree terminals require a git repository at the workspace root.",
        );
      }
      const path = join(worktreesDir, tentacleId);
      gitClientOpt.addWorktree({
        cwd: workspaceCwd,
        path,
        branchName: `octogent/${tentacleId}`,
        baseRef: baseRef ?? "HEAD",
      });
    },
    removeTentacleWorktree: (tentacleId: string) => {
      if (!gitClientOpt) return;
      const path = join(worktreesDir, tentacleId);
      try {
        gitClientOpt.removeWorktree({ cwd: workspaceCwd, path });
      } catch (err) {
        throw new RuntimeInputError(
          `Unable to remove worktree for ${tentacleId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      try {
        gitClientOpt.removeBranch({ cwd: workspaceCwd, branchName: `octogent/${tentacleId}` });
      } catch {
        // Branch removal is best-effort
      }
    },
  };

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
    octobossMcpConfigPath,
    ...(octobossSystemPromptPath ? { octobossSystemPromptPath } : {}),
  });

  const findWorktreeTerminal = (tentacleId: string) =>
    [...terminals.values()].find((t) => t.tentacleId === tentacleId);

  const getWorktreePath = (terminal: PersistedTerminal) =>
    join(worktreesDir, terminal.worktreeId ?? terminal.tentacleId);

  const requireWorktreeTerminal = (tentacleId: string) => {
    const terminal = findWorktreeTerminal(tentacleId);
    if (!terminal) return null;
    if (terminal.workspaceMode !== "worktree") {
      throw new RuntimeInputError(
        "Git lifecycle actions are only available for worktree terminals.",
      );
    }
    if (!gitClientOpt) return null;
    return { terminal, worktreePath: getWorktreePath(terminal) };
  };

  const toGitStatusSnapshot = (tentacleId: string, worktreePath: string) => {
    if (!gitClientOpt) return null;
    const status = gitClientOpt.readWorktreeStatus({ cwd: worktreePath });
    return { tentacleId, workspaceMode: "worktree" as const, ...status };
  };

  const gitOps = {
    readTentacleGitStatus: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    commitTentacleWorktree: (tentacleId: string, message: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      gitClientOpt!.commitAll({ cwd: result.worktreePath, message });
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    pushTentacleWorktree: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      gitClientOpt!.pushCurrentBranch({ cwd: result.worktreePath });
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    syncTentacleWorktree: (tentacleId: string, baseRef?: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      gitClientOpt!.syncWithBase({ cwd: result.worktreePath, baseRef: baseRef ?? "HEAD" });
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    readTentaclePullRequest: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      const pr = gitClientOpt!.readCurrentBranchPullRequest({ cwd: result.worktreePath });
      if (!pr) return { tentacleId, workspaceMode: "worktree" as const };
      const { state, ...prRest } = pr;
      return {
        tentacleId,
        workspaceMode: "worktree" as const,
        status: state.toLowerCase() as "open" | "merged" | "closed",
        ...prRest,
      };
    },

    createTentaclePullRequest: (tentacleId: string, opts: Record<string, unknown>) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      const existing = gitClientOpt!.readCurrentBranchPullRequest({ cwd: result.worktreePath });
      if (existing && existing.state === "OPEN") {
        throw new RuntimeInputError(
          "An open pull request already exists for this branch.",
        );
      }
      const worktreeStatus = gitClientOpt!.readWorktreeStatus({ cwd: result.worktreePath });
      const pr = gitClientOpt!.createPullRequest({
        cwd: result.worktreePath,
        title: String(opts.title ?? ""),
        body: String(opts.body ?? ""),
        baseRef: String(opts.baseRef ?? worktreeStatus.defaultBaseBranchName ?? "main"),
        headRef: worktreeStatus.branchName,
      });
      if (!pr) return null;
      const { state, ...prRest } = pr;
      return {
        tentacleId,
        workspaceMode: "worktree" as const,
        status: state.toLowerCase() as "open" | "merged" | "closed",
        ...prRest,
      };
    },

    mergeTentaclePullRequest: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      const existing = gitClientOpt!.readCurrentBranchPullRequest({ cwd: result.worktreePath });
      if (!existing || existing.state !== "OPEN") {
        throw new RuntimeInputError("No open pull request found for this branch.");
      }
      gitClientOpt!.mergeCurrentBranchPullRequest({
        cwd: result.worktreePath,
        strategy: "squash",
      });
      const pr = gitClientOpt!.readCurrentBranchPullRequest({ cwd: result.worktreePath });
      if (!pr) return { tentacleId, workspaceMode: "worktree" as const };
      const { state, ...prRest } = pr;
      return {
        tentacleId,
        workspaceMode: "worktree" as const,
        status: state.toLowerCase() as "open" | "merged" | "closed",
        ...prRest,
      };
    },
  };

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
      workspaceMode: terminal.workspaceMode,
      createdAt: terminal.createdAt,
      hasUserPrompt: isTerminalRecentlyActive(terminal),
      ...(terminal.parentTerminalId ? { parentTerminalId: terminal.parentTerminalId } : {}),
      ...(session ? { agentRuntimeState: session.agentState } : {}),
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
    workspaceMode = "shared",
    agentProvider,
    initialPrompt,
    initialInputDraft,
    baseRef,
    parentTerminalId,
    nameOrigin,
    autoRenamePromptContext,
  }: {
    terminalId?: string;
    tentacleId?: string;
    worktreeId?: string;
    tentacleName?: string;
    workspaceMode?: TentacleWorkspaceMode;
    agentProvider?: TerminalAgentProvider;
    initialPrompt?: string;
    initialInputDraft?: string;
    baseRef?: string;
    parentTerminalId?: string;
    nameOrigin?: TerminalNameOrigin;
    autoRenamePromptContext?: string;
  }): TerminalSnapshot => {
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
      tentacleName ?? (tentacleId === OCTOBOSS_TENTACLE_ID ? "Octoboss" : allocateDefaultTerminalName());

    // Auto-allocate a unique worktreeId when creating a worktree terminal
    // so multiple worktree terminals can coexist (each gets its own directory).
    const worktreeId =
      requestedWorktreeId ?? (workspaceMode === "worktree" ? terminalId : undefined);

    const terminal: PersistedTerminal = {
      terminalId,
      tentacleId,
      ...(worktreeId ? { worktreeId } : {}),
      tentacleName: effectiveName,
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

    if (initialPrompt || tentacleId === OCTOBOSS_TENTACLE_ID) {
      sessionRuntime.startSession(terminalId);
    }

    return toTerminalSnapshot(terminal);
  };

  const readUiState = (): PersistedUiState => {
    const normalized = pruneUiStateTerminalReferences(uiState, terminals);
    const result: PersistedUiState = { ...normalized };
    if (normalized.minimizedTerminalIds) {
      result.minimizedTerminalIds = [...normalized.minimizedTerminalIds];
    }
    if (normalized.terminalWidths) {
      result.terminalWidths = { ...normalized.terminalWidths };
    }
    if (normalized.terminalCompletionSound !== undefined) {
      result.terminalCompletionSound = normalized.terminalCompletionSound;
    }
    return result;
  };

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
      if (patch.activePrimaryNav !== undefined) {
        uiState.activePrimaryNav = patch.activePrimaryNav;
      }
      if (patch.isAgentsSidebarVisible !== undefined) {
        uiState.isAgentsSidebarVisible = patch.isAgentsSidebarVisible;
      }
      if (patch.sidebarWidth !== undefined) {
        uiState.sidebarWidth = patch.sidebarWidth;
      }
      if (patch.isActiveAgentsSectionExpanded !== undefined) {
        uiState.isActiveAgentsSectionExpanded = patch.isActiveAgentsSectionExpanded;
      }
      if (patch.isRuntimeStatusStripVisible !== undefined) {
        uiState.isRuntimeStatusStripVisible = patch.isRuntimeStatusStripVisible;
      }
      if (patch.isMonitorVisible !== undefined) {
        uiState.isMonitorVisible = patch.isMonitorVisible;
      }
      if (patch.isBottomTelemetryVisible !== undefined) {
        uiState.isBottomTelemetryVisible = patch.isBottomTelemetryVisible;
      }
      if (patch.isCodexUsageVisible !== undefined) {
        uiState.isCodexUsageVisible = patch.isCodexUsageVisible;
      }
      if (patch.isClaudeUsageVisible !== undefined) {
        uiState.isClaudeUsageVisible = patch.isClaudeUsageVisible;
      }
      if (patch.isClaudeUsageSectionExpanded !== undefined) {
        uiState.isClaudeUsageSectionExpanded = patch.isClaudeUsageSectionExpanded;
      }
      if (patch.isCodexUsageSectionExpanded !== undefined) {
        uiState.isCodexUsageSectionExpanded = patch.isCodexUsageSectionExpanded;
      }
      if (patch.terminalCompletionSound !== undefined) {
        uiState.terminalCompletionSound = patch.terminalCompletionSound;
      }
      if (patch.minimizedTerminalIds !== undefined) {
        uiState.minimizedTerminalIds = [...patch.minimizedTerminalIds];
      }
      if (patch.terminalWidths !== undefined) {
        uiState.terminalWidths = { ...patch.terminalWidths };
      }
      if (patch.canvasOpenTerminalIds !== undefined) {
        uiState.canvasOpenTerminalIds = [...patch.canvasOpenTerminalIds];
      }
      if (patch.canvasOpenTentacleIds !== undefined) {
        uiState.canvasOpenTentacleIds = [...patch.canvasOpenTentacleIds];
      }
      if (patch.canvasTerminalsPanelWidth !== undefined) {
        uiState.canvasTerminalsPanelWidth = patch.canvasTerminalsPanelWidth;
      }

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

    listConversationSessions() {
      const transcriptDir = join(stateDir, "state", "transcripts");
      if (!existsSync(transcriptDir)) return [];
      const summaries: unknown[] = [];
      try {
        const files = readdirSync(transcriptDir).filter((f) => f.endsWith(".jsonl"));
        for (const file of files) {
          const sessionId = decodeURIComponent(file.slice(0, -6));
          const raw = readFileSync(join(transcriptDir, file), "utf8").trim();
          if (!raw) continue;
          const events = raw.split("\n").map((l) => {
            try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; }
          }).filter(Boolean) as Record<string, unknown>[];

          const startEvent = events.find((e) => e.type === "session_start");
          const endEvent = events.find((e) => e.type === "session_end");
          if (!startEvent) continue;

          const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.claude-turns.json`);
          let turns: Array<{ role: string; content: string; startedAt: string; endedAt: string }> = [];
          if (existsSync(turnsPath)) {
            try { turns = JSON.parse(readFileSync(turnsPath, "utf8")) as typeof turns; } catch { /* ignore */ }
          }
          const userTurns = turns.filter((t) => t.role === "user");
          const assistantTurns = turns.filter((t) => t.role === "assistant");

          const lastTimestamp = endEvent?.timestamp ?? events[events.length - 1]?.timestamp;
          summaries.push({
            sessionId,
            tentacleId: startEvent.tentacleId ?? sessionId,
            startedAt: startEvent.timestamp,
            endedAt: endEvent?.timestamp ?? null,
            lastEventAt: lastTimestamp ?? null,
            eventCount: events.length,
            turnCount: turns.length,
            userTurnCount: userTurns.length,
            assistantTurnCount: assistantTurns.length,
            firstUserTurnPreview: userTurns[0]?.content?.slice(0, 200) ?? null,
            lastUserTurnPreview: userTurns[userTurns.length - 1]?.content?.slice(0, 200) ?? null,
            lastAssistantTurnPreview: assistantTurns[assistantTurns.length - 1]?.content?.slice(0, 200) ?? null,
          });
        }
      } catch { /* ignore */ }
      return summaries;
    },

    readConversationSession(sessionId: string) {
      const transcriptDir = join(stateDir, "state", "transcripts");
      const transcriptPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.jsonl`);
      if (!existsSync(transcriptPath)) return null;
      const raw = readFileSync(transcriptPath, "utf8").trim();
      if (!raw) return null;
      const events = raw.split("\n").map((l) => {
        try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; }
      }).filter(Boolean);

      const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.claude-turns.json`);
      let turns: unknown[] = [];
      if (existsSync(turnsPath)) {
        try { turns = JSON.parse(readFileSync(turnsPath, "utf8")) as unknown[]; } catch { /* ignore */ }
      }

      const startEvent = (events as Record<string, unknown>[]).find((e) => e.type === "session_start");
      return {
        sessionId,
        tentacleId: startEvent?.tentacleId ?? sessionId,
        turnCount: turns.length,
        events,
        turns,
      };
    },

    exportConversationSession(sessionId: string, format: "md" | "json") {
      const transcriptDir = join(stateDir, "state", "transcripts");
      const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.claude-turns.json`);
      if (!existsSync(turnsPath)) return null;
      let turns: Array<{ role: string; content: string }> = [];
      try { turns = JSON.parse(readFileSync(turnsPath, "utf8")) as typeof turns; } catch { return null; }

      if (format === "json") {
        return JSON.stringify({ sessionId, turnCount: turns.length, turns });
      }

      const lines: string[] = [];
      for (const turn of turns) {
        lines.push(`## ${turn.role === "user" ? "User" : "Assistant"}`);
        lines.push("");
        lines.push(turn.content);
        lines.push("");
      }
      return lines.join("\n");
    },

    deleteConversationSession(sessionId: string) {
      const transcriptDir = join(stateDir, "state", "transcripts");
      const base = join(transcriptDir, encodeURIComponent(sessionId));
      for (const ext of [".jsonl", ".claude-turns.json"]) {
        const path = `${base}${ext}`;
        if (existsSync(path)) { try { rmSync(path); } catch { /* ignore */ } }
      }
    },

    deleteAllConversationSessions() {
      const transcriptDir = join(stateDir, "state", "transcripts");
      if (!existsSync(transcriptDir)) return;
      try {
        const files = readdirSync(transcriptDir);
        for (const file of files) {
          try { rmSync(join(transcriptDir, file)); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    },

    searchConversations(query: string) {
      const q = query.toLowerCase();
      const transcriptDir = join(stateDir, "state", "transcripts");
      if (!existsSync(transcriptDir)) return [];
      const results: unknown[] = [];
      try {
        const files = readdirSync(transcriptDir).filter((f) => f.endsWith(".claude-turns.json"));
        for (const file of files) {
          const sessionId = decodeURIComponent(file.slice(0, -".claude-turns.json".length));
          let turns: Array<{ role: string; content: string }> = [];
          try { turns = JSON.parse(readFileSync(join(transcriptDir, file), "utf8")) as typeof turns; } catch { continue; }
          if (turns.some((t) => t.content.toLowerCase().includes(q))) {
            results.push({ sessionId });
          }
        }
      } catch { /* ignore */ }
      return results;
    },

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
