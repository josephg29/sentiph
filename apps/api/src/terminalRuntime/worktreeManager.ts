import { existsSync } from "node:fs";
import { join } from "node:path";

import type { GitClient } from "./types";
import { RuntimeInputError } from "./types";

interface CreateWorktreeManagerOptions {
  worktreesDir: string;
  workspaceCwd: string;
  gitClient: GitClient | undefined;
}

/**
 * Manages per-tentacle git worktrees: resolving a tentacle's working directory,
 * checking existence, and creating/removing worktrees and their branches.
 * Extracted from the terminal runtime factory; depends only on the worktrees
 * directory, the workspace root, and the optional git client.
 */
export const createWorktreeManager = ({
  worktreesDir,
  workspaceCwd,
  gitClient,
}: CreateWorktreeManagerOptions) => ({
  getTentacleWorkspaceCwd: (tentacleId: string) => {
    if (existsSync(join(worktreesDir, tentacleId))) {
      return join(worktreesDir, tentacleId);
    }
    return workspaceCwd;
  },
  hasTentacleWorktree: (tentacleId: string) => existsSync(join(worktreesDir, tentacleId)),
  createTentacleWorktree: (tentacleId: string, baseRef?: string) => {
    if (!gitClient || !gitClient.isRepository(workspaceCwd)) {
      throw new RuntimeInputError(
        "Worktree terminals require a git repository at the workspace root.",
      );
    }
    const path = join(worktreesDir, tentacleId);
    gitClient.addWorktree({
      cwd: workspaceCwd,
      path,
      branchName: `sentiph/${tentacleId}`,
      baseRef: baseRef ?? "HEAD",
    });
  },
  removeTentacleWorktree: (tentacleId: string) => {
    if (!gitClient) return;
    const path = join(worktreesDir, tentacleId);
    try {
      gitClient.removeWorktree({ cwd: workspaceCwd, path });
    } catch (err) {
      throw new RuntimeInputError(
        `Unable to remove worktree for ${tentacleId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      gitClient.removeBranch({ cwd: workspaceCwd, branchName: `sentiph/${tentacleId}` });
    } catch {
      // Branch removal is best-effort
    }
  },
});
