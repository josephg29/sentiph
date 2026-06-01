import { join } from "node:path";

import type { GitClient, PersistedTerminal } from "./types";
import { RuntimeInputError } from "./types";

interface CreateGitOpsOptions {
  terminals: Map<string, PersistedTerminal>;
  worktreesDir: string;
  gitClient: GitClient | undefined;
}

/**
 * Git lifecycle operations for worktree terminals. Extracted from the terminal
 * runtime factory; depends only on the registry map, the worktrees directory,
 * and the optional git client, all passed in explicitly.
 */
export const createGitOps = ({ terminals, worktreesDir, gitClient }: CreateGitOpsOptions) => {
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
    if (!gitClient) return null;
    return { terminal, worktreePath: getWorktreePath(terminal), gitClient };
  };

  const toGitStatusSnapshot = (tentacleId: string, worktreePath: string) => {
    if (!gitClient) return null;
    const status = gitClient.readWorktreeStatus({ cwd: worktreePath });
    return { tentacleId, workspaceMode: "worktree" as const, ...status };
  };

  return {
    readTentacleGitStatus: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    commitTentacleWorktree: (tentacleId: string, message: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      result.gitClient.commitAll({ cwd: result.worktreePath, message });
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    pushTentacleWorktree: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      result.gitClient.pushCurrentBranch({ cwd: result.worktreePath });
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    syncTentacleWorktree: (tentacleId: string, baseRef?: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      result.gitClient.syncWithBase({ cwd: result.worktreePath, baseRef: baseRef ?? "HEAD" });
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    readTentaclePullRequest: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      const pr = result.gitClient.readCurrentBranchPullRequest({ cwd: result.worktreePath });
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
      const existing = result.gitClient.readCurrentBranchPullRequest({ cwd: result.worktreePath });
      if (existing && existing.state === "OPEN") {
        throw new RuntimeInputError("An open pull request already exists for this branch.");
      }
      const worktreeStatus = result.gitClient.readWorktreeStatus({ cwd: result.worktreePath });
      const pr = result.gitClient.createPullRequest({
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
      const existing = result.gitClient.readCurrentBranchPullRequest({ cwd: result.worktreePath });
      if (!existing || existing.state !== "OPEN") {
        throw new RuntimeInputError("No open pull request found for this branch.");
      }
      result.gitClient.mergeCurrentBranchPullRequest({
        cwd: result.worktreePath,
        strategy: "squash",
      });
      const pr = result.gitClient.readCurrentBranchPullRequest({ cwd: result.worktreePath });
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
};
