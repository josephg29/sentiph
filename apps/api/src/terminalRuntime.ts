import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import type { AgentSnapshot } from "@octogent/core";
import { WebSocketServer } from "ws";

import { TENTACLE_ID_PREFIX, TENTACLE_REGISTRY_RELATIVE_PATH } from "./terminalRuntime/constants";
import {
  loadTentacleRegistry,
  persistTentacleRegistry,
  pruneUiStateTentacleReferences,
} from "./terminalRuntime/registry";
import { createSessionRuntime } from "./terminalRuntime/sessionRuntime";
import { createDefaultGitClient } from "./terminalRuntime/systemClients";
import {
  RuntimeInputError,
  type CreateTerminalRuntimeOptions,
  type PersistedTentacle,
  type PersistedUiState,
  type TentacleGitStatusSnapshot,
  type TentaclePullRequestSnapshot,
  type TentacleWorkspaceMode,
  type TerminalSession,
} from "./terminalRuntime/types";
import { createWorktreeManager } from "./terminalRuntime/worktreeManager";

export type {
  GitClient,
  PersistedUiState,
  TentacleCompletionSound,
  TentacleWorkspaceMode,
} from "./terminalRuntime/types";
export { isTentacleCompletionSound } from "./terminalRuntime/types";
export { RuntimeInputError } from "./terminalRuntime/types";

export const createTerminalRuntime = ({
  workspaceCwd,
  gitClient = createDefaultGitClient(),
}: CreateTerminalRuntimeOptions) => {
  const sessions = new Map<string, TerminalSession>();
  const websocketServer = new WebSocketServer({ noServer: true });
  const registryPath = join(workspaceCwd, TENTACLE_REGISTRY_RELATIVE_PATH);
  const registryState = loadTentacleRegistry(registryPath);
  const tentacles = registryState.tentacles;
  let uiState = registryState.uiState;
  const isDebugPtyLogsEnabled = process.env.OCTOGENT_DEBUG_PTY_LOGS === "1";
  const ptyLogDir =
    process.env.OCTOGENT_DEBUG_PTY_LOG_DIR ?? join(workspaceCwd, ".octogent", "logs");

  const persistRegistry = () => {
    uiState = pruneUiStateTentacleReferences(uiState, tentacles);
    persistTentacleRegistry(registryPath, {
      tentacles,
      uiState,
    });
  };

  const worktreeManager = createWorktreeManager({
    workspaceCwd,
    gitClient,
    tentacles,
  });

  const sessionRuntime = createSessionRuntime({
    websocketServer,
    tentacles,
    sessions,
    getTentacleWorkspaceCwd: worktreeManager.getTentacleWorkspaceCwd,
    isDebugPtyLogsEnabled,
    ptyLogDir,
  });

  const allocateTentacleId = () => {
    let candidateTentacleNumber = 1;
    while (candidateTentacleNumber < Number.MAX_SAFE_INTEGER) {
      const candidateTentacleId = `${TENTACLE_ID_PREFIX}${candidateTentacleNumber}`;
      if (tentacles.has(candidateTentacleId)) {
        candidateTentacleNumber += 1;
        continue;
      }

      if (sessions.has(candidateTentacleId)) {
        candidateTentacleNumber += 1;
        continue;
      }

      if (worktreeManager.hasTentacleWorktree(candidateTentacleId)) {
        candidateTentacleNumber += 1;
        continue;
      }

      return candidateTentacleId;
    }

    throw new Error("Unable to allocate tentacle id.");
  };

  const buildRootSnapshot = (tentacle: PersistedTentacle): AgentSnapshot => ({
    agentId: `${tentacle.tentacleId}-root`,
    label: `${tentacle.tentacleId}-root`,
    state: "live",
    tentacleId: tentacle.tentacleId,
    tentacleName: tentacle.tentacleName,
    tentacleWorkspaceMode: tentacle.workspaceMode,
    createdAt: tentacle.createdAt,
  });

  const createTentacle = ({
    tentacleName,
    workspaceMode = "shared",
  }: {
    tentacleName?: string;
    workspaceMode?: TentacleWorkspaceMode;
  }): AgentSnapshot => {
    const tentacleId = allocateTentacleId();
    const tentacle: PersistedTentacle = {
      tentacleId,
      tentacleName: tentacleName ?? tentacleId,
      createdAt: new Date().toISOString(),
      workspaceMode,
    };

    const shouldCreateWorktree = workspaceMode === "worktree";
    if (shouldCreateWorktree) {
      worktreeManager.createTentacleWorktree(tentacleId);
    }

    tentacles.set(tentacleId, tentacle);
    persistRegistry();

    return buildRootSnapshot(tentacle);
  };

  const readUiState = (): PersistedUiState => {
    const normalized = pruneUiStateTentacleReferences(uiState, tentacles);
    const result: PersistedUiState = { ...normalized };
    if (normalized.minimizedTentacleIds) {
      result.minimizedTentacleIds = [...normalized.minimizedTentacleIds];
    }
    if (normalized.tentacleWidths) {
      result.tentacleWidths = { ...normalized.tentacleWidths };
    }
    if (normalized.tentacleCompletionSound !== undefined) {
      result.tentacleCompletionSound = normalized.tentacleCompletionSound;
    }
    return result;
  };

  const resolveWorktreeTentacleContext = (
    tentacleId: string,
  ): { tentacle: PersistedTentacle; workspaceCwd: string } | null => {
    const tentacle = tentacles.get(tentacleId);
    if (!tentacle) {
      return null;
    }

    if (tentacle.workspaceMode !== "worktree") {
      throw new RuntimeInputError(
        "Git lifecycle actions are only available for worktree tentacles.",
      );
    }

    return {
      tentacle,
      workspaceCwd: worktreeManager.getTentacleWorkspaceCwd(tentacleId),
    };
  };

  const readWorktreeGitStatus = (
    tentacleId: string,
    tentacle: PersistedTentacle,
    workspaceCwd: string,
  ): TentacleGitStatusSnapshot => {
    try {
      const status = gitClient.readWorktreeStatus({ cwd: workspaceCwd });
      return {
        tentacleId,
        workspaceMode: tentacle.workspaceMode,
        branchName: status.branchName,
        upstreamBranchName: status.upstreamBranchName,
        isDirty: status.isDirty,
        aheadCount: status.aheadCount,
        behindCount: status.behindCount,
        insertedLineCount: status.insertedLineCount,
        deletedLineCount: status.deletedLineCount,
        hasConflicts: status.hasConflicts,
        changedFiles: [...status.changedFiles],
        defaultBaseBranchName: status.defaultBaseBranchName,
      };
    } catch (error) {
      throw new RuntimeInputError(
        `Unable to read git status for ${tentacleId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const toPullRequestStatus = (state: "OPEN" | "MERGED" | "CLOSED") =>
    state === "OPEN" ? "open" : state === "MERGED" ? "merged" : "closed";

  const emptyPullRequestSnapshot = (
    tentacleId: string,
    tentacle: PersistedTentacle,
  ): TentaclePullRequestSnapshot => ({
    tentacleId,
    workspaceMode: tentacle.workspaceMode,
    status: "none",
    number: null,
    url: null,
    title: null,
    baseRef: null,
    headRef: null,
    isDraft: null,
    mergeable: null,
    mergeStateStatus: null,
  });

  const readWorktreePullRequest = (
    tentacleId: string,
    tentacle: PersistedTentacle,
    workspaceCwd: string,
  ): TentaclePullRequestSnapshot => {
    try {
      const pullRequest = gitClient.readCurrentBranchPullRequest({ cwd: workspaceCwd });
      if (!pullRequest) {
        return emptyPullRequestSnapshot(tentacleId, tentacle);
      }

      return {
        tentacleId,
        workspaceMode: tentacle.workspaceMode,
        status: toPullRequestStatus(pullRequest.state),
        number: pullRequest.number,
        url: pullRequest.url,
        title: pullRequest.title,
        baseRef: pullRequest.baseRef,
        headRef: pullRequest.headRef,
        isDraft: pullRequest.isDraft,
        mergeable: pullRequest.mergeable,
        mergeStateStatus: pullRequest.mergeStateStatus,
      };
    } catch (error) {
      throw new RuntimeInputError(
        `Unable to read pull request for ${tentacleId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return {
    listAgentSnapshots(): AgentSnapshot[] {
      return [...tentacles.values()].map((tentacle) => buildRootSnapshot(tentacle));
    },

    readUiState,

    patchUiState(patch: PersistedUiState): PersistedUiState {
      if (patch.isAgentsSidebarVisible !== undefined) {
        uiState.isAgentsSidebarVisible = patch.isAgentsSidebarVisible;
      }
      if (patch.sidebarWidth !== undefined) {
        uiState.sidebarWidth = patch.sidebarWidth;
      }
      if (patch.isActiveAgentsSectionExpanded !== undefined) {
        uiState.isActiveAgentsSectionExpanded = patch.isActiveAgentsSectionExpanded;
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
      if (patch.tentacleCompletionSound !== undefined) {
        uiState.tentacleCompletionSound = patch.tentacleCompletionSound;
      }
      if (patch.minimizedTentacleIds !== undefined) {
        uiState.minimizedTentacleIds = [...patch.minimizedTentacleIds];
      }
      if (patch.tentacleWidths !== undefined) {
        uiState.tentacleWidths = { ...patch.tentacleWidths };
      }

      persistRegistry();
      return readUiState();
    },

    readTentacleGitStatus(tentacleId: string): TentacleGitStatusSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      return readWorktreeGitStatus(tentacleId, context.tentacle, context.workspaceCwd);
    },

    commitTentacleWorktree(tentacleId: string, message: string): TentacleGitStatusSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      const trimmedMessage = message.trim();
      if (trimmedMessage.length === 0) {
        throw new RuntimeInputError("Commit message cannot be empty.");
      }

      try {
        gitClient.commitAll({
          cwd: context.workspaceCwd,
          message: trimmedMessage,
        });
      } catch (error) {
        throw new RuntimeInputError(
          `Unable to commit ${tentacleId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return readWorktreeGitStatus(tentacleId, context.tentacle, context.workspaceCwd);
    },

    pushTentacleWorktree(tentacleId: string): TentacleGitStatusSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      try {
        gitClient.pushCurrentBranch({
          cwd: context.workspaceCwd,
        });
      } catch (error) {
        throw new RuntimeInputError(
          `Unable to push ${tentacleId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return readWorktreeGitStatus(tentacleId, context.tentacle, context.workspaceCwd);
    },

    syncTentacleWorktree(tentacleId: string, baseRef?: string): TentacleGitStatusSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      const statusBeforeSync = readWorktreeGitStatus(
        tentacleId,
        context.tentacle,
        context.workspaceCwd,
      );
      if (statusBeforeSync.isDirty) {
        throw new RuntimeInputError("Sync requires a clean worktree. Commit or stash changes first.");
      }
      if (statusBeforeSync.hasConflicts) {
        throw new RuntimeInputError("Resolve git conflicts before syncing with base.");
      }

      const normalizedBaseRef = baseRef?.trim();
      const effectiveBaseRef =
        normalizedBaseRef && normalizedBaseRef.length > 0
          ? normalizedBaseRef
          : statusBeforeSync.defaultBaseBranchName ?? "main";

      try {
        gitClient.syncWithBase({
          cwd: context.workspaceCwd,
          baseRef: effectiveBaseRef,
        });
      } catch (error) {
        throw new RuntimeInputError(
          `Unable to sync ${tentacleId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return readWorktreeGitStatus(tentacleId, context.tentacle, context.workspaceCwd);
    },

    readTentaclePullRequest(tentacleId: string): TentaclePullRequestSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      return readWorktreePullRequest(tentacleId, context.tentacle, context.workspaceCwd);
    },

    createTentaclePullRequest(
      tentacleId: string,
      input: { title: string; body?: string; baseRef?: string },
    ): TentaclePullRequestSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      const title = input.title.trim();
      if (title.length === 0) {
        throw new RuntimeInputError("Pull request title cannot be empty.");
      }

      const existingPullRequest = readWorktreePullRequest(
        tentacleId,
        context.tentacle,
        context.workspaceCwd,
      );
      if (existingPullRequest.status === "open") {
        throw new RuntimeInputError("An open pull request already exists for this branch.");
      }

      const status = readWorktreeGitStatus(tentacleId, context.tentacle, context.workspaceCwd);
      if (status.hasConflicts) {
        throw new RuntimeInputError("Resolve git conflicts before creating a pull request.");
      }

      const normalizedBaseRef = input.baseRef?.trim();
      const effectiveBaseRef =
        normalizedBaseRef && normalizedBaseRef.length > 0
          ? normalizedBaseRef
          : status.defaultBaseBranchName ?? "main";

      try {
        const pullRequest = gitClient.createPullRequest({
          cwd: context.workspaceCwd,
          title,
          body: input.body ?? "",
          baseRef: effectiveBaseRef,
          headRef: status.branchName,
        });
        if (!pullRequest) {
          return readWorktreePullRequest(tentacleId, context.tentacle, context.workspaceCwd);
        }

        return {
          tentacleId,
          workspaceMode: context.tentacle.workspaceMode,
          status: toPullRequestStatus(pullRequest.state),
          number: pullRequest.number,
          url: pullRequest.url,
          title: pullRequest.title,
          baseRef: pullRequest.baseRef,
          headRef: pullRequest.headRef,
          isDraft: pullRequest.isDraft,
          mergeable: pullRequest.mergeable,
          mergeStateStatus: pullRequest.mergeStateStatus,
        };
      } catch (error) {
        throw new RuntimeInputError(
          `Unable to create pull request for ${tentacleId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },

    mergeTentaclePullRequest(tentacleId: string): TentaclePullRequestSnapshot | null {
      const context = resolveWorktreeTentacleContext(tentacleId);
      if (!context) {
        return null;
      }

      const currentPullRequest = readWorktreePullRequest(
        tentacleId,
        context.tentacle,
        context.workspaceCwd,
      );
      if (currentPullRequest.status !== "open") {
        throw new RuntimeInputError("No open pull request found for this branch.");
      }
      if (currentPullRequest.isDraft) {
        throw new RuntimeInputError("Draft pull requests cannot be merged.");
      }
      if (currentPullRequest.mergeable === "CONFLICTING") {
        throw new RuntimeInputError("Pull request has conflicts and cannot be merged.");
      }

      try {
        gitClient.mergeCurrentBranchPullRequest({
          cwd: context.workspaceCwd,
          strategy: "squash",
        });
      } catch (error) {
        throw new RuntimeInputError(
          `Unable to merge pull request for ${tentacleId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return readWorktreePullRequest(tentacleId, context.tentacle, context.workspaceCwd);
    },

    createTentacle,

    renameTentacle(tentacleId: string, tentacleName: string): AgentSnapshot | null {
      const tentacle = tentacles.get(tentacleId);
      if (!tentacle) {
        return null;
      }

      tentacle.tentacleName = tentacleName;
      persistRegistry();
      return buildRootSnapshot(tentacle);
    },

    deleteTentacle(tentacleId: string): boolean {
      const tentacle = tentacles.get(tentacleId);
      if (!tentacle) {
        return false;
      }

      sessionRuntime.closeSession(tentacleId);
      if (tentacle.workspaceMode === "worktree") {
        worktreeManager.removeTentacleWorktree(tentacleId);
      }
      tentacles.delete(tentacleId);
      persistRegistry();
      return true;
    },

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      return sessionRuntime.handleUpgrade(request, socket, head);
    },

    close() {
      sessionRuntime.close();
      websocketServer.close();
    },
  };
};
