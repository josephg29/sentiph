import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { GitClient } from "./types";

export const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const createDefaultGitClient = (): GitClient => ({
  assertAvailable() {
    try {
      execFileSync("git", ["--version"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`git is required for worktree tentacles: ${toErrorMessage(error)}`);
    }
  },

  isRepository(cwd) {
    try {
      const output = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      });
      return output.trim() === "true";
    } catch {
      return false;
    }
  },

  addWorktree({ cwd, path, branchName, baseRef }) {
    mkdirSync(dirname(path), { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", branchName, path, baseRef], {
      cwd,
      stdio: "pipe",
    });
  },

  removeWorktree({ cwd, path }) {
    execFileSync("git", ["worktree", "remove", "--force", path], {
      cwd,
      stdio: "pipe",
    });
  },

  removeBranch({ cwd, branchName }) {
    const output = execFileSync(
      "git",
      ["branch", "--list", "--format=%(refname:short)", branchName],
      {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    const existingBranches = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!existingBranches.includes(branchName)) {
      return;
    }

    execFileSync("git", ["branch", "-D", branchName], {
      cwd,
      stdio: "pipe",
    });
  },
});
