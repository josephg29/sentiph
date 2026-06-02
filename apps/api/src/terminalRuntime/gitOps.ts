import { join } from "node:path";

import type { GitClient, PersistedTerminal } from "./types";
import { RuntimeInputError } from "./types";

interface CreateGitOpsOptions {
  terminals: Map<string, PersistedTerminal>;
  worktreesDir: string;
  gitClient: GitClient | undefined;
}

// Short TTL so back-to-back reads (e.g. a UI polling status + PR for the same
// tentacle) avoid re-shelling out to git, while staying fresh enough that a
// mutation elsewhere is reflected quickly. Mutating ops invalidate eagerly.
const GIT_READ_CACHE_TTL_MS = (() => {
  const raw = process.env.SENTIPH_GIT_READ_CACHE_TTL_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 4000;
})();

type GitReadCacheEntry = { value: unknown; cachedAt: number };

// Each createGitOps instance owns its own per-tentacle cache (keyed by
// `${kind}:${tentacleId}`), so separate runtimes never share state. We register
// every instance's cache here so the exported reset can clear them all for tests.
const liveGitReadCaches = new Set<Map<string, GitReadCacheEntry>>();

/** Clears every live per-tentacle git read cache. Exported for test isolation. */
export const resetGitOpsCache = (): void => {
  for (const cache of liveGitReadCaches) {
    cache.clear();
  }
};

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

  // ---------------------------------------------------------------------------
  // Per-tentacle read cache. Mutating operations invalidate the affected
  // tentacle's entries since they change observable git state.
  // ---------------------------------------------------------------------------
  const gitReadCache = new Map<string, GitReadCacheEntry>();
  liveGitReadCaches.add(gitReadCache);

  const cacheKey = (kind: "status" | "pr", tentacleId: string) => `${kind}:${tentacleId}`;

  const readCached = <T>(kind: "status" | "pr", tentacleId: string, compute: () => T): T => {
    const key = cacheKey(kind, tentacleId);
    const entry = gitReadCache.get(key);
    if (entry && Date.now() - entry.cachedAt < GIT_READ_CACHE_TTL_MS) {
      return entry.value as T;
    }
    const value = compute();
    gitReadCache.set(key, { value, cachedAt: Date.now() });
    return value;
  };

  const invalidateTentacle = (tentacleId: string) => {
    gitReadCache.delete(cacheKey("status", tentacleId));
    gitReadCache.delete(cacheKey("pr", tentacleId));
  };

  return {
    readTentacleGitStatus: (tentacleId: string) =>
      readCached("status", tentacleId, () => {
        const result = requireWorktreeTerminal(tentacleId);
        if (!result) return null;
        return toGitStatusSnapshot(tentacleId, result.worktreePath);
      }),

    commitTentacleWorktree: (tentacleId: string, message: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      result.gitClient.commitAll({ cwd: result.worktreePath, message });
      invalidateTentacle(tentacleId);
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    pushTentacleWorktree: (tentacleId: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      result.gitClient.pushCurrentBranch({ cwd: result.worktreePath });
      invalidateTentacle(tentacleId);
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    syncTentacleWorktree: (tentacleId: string, baseRef?: string) => {
      const result = requireWorktreeTerminal(tentacleId);
      if (!result) return null;
      result.gitClient.syncWithBase({ cwd: result.worktreePath, baseRef: baseRef ?? "HEAD" });
      invalidateTentacle(tentacleId);
      return toGitStatusSnapshot(tentacleId, result.worktreePath);
    },

    readTentaclePullRequest: (tentacleId: string) =>
      readCached("pr", tentacleId, () => {
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
      }),

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
      invalidateTentacle(tentacleId);
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
      invalidateTentacle(tentacleId);
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
