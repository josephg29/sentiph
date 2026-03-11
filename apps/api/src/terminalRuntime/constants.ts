export const TENTACLE_ID_PREFIX = "tentacle-";
export const TENTACLE_REGISTRY_VERSION = 2;
export const TENTACLE_REGISTRY_RELATIVE_PATH = ".octogent/state/tentacles.json";
export const TENTACLE_TRANSCRIPT_RELATIVE_PATH = ".octogent/state/transcripts";
export const TENTACLE_WORKTREE_RELATIVE_PATH = ".octogent/worktrees";
export const TENTACLE_WORKTREE_BRANCH_PREFIX = "octogent/";
export const TENTACLE_BOOTSTRAP_COMMAND = "codex";

export const TENTACLE_BOOTSTRAP_COMMANDS: Record<string, string> = {
  codex: "codex",
  "claude-code": "claude",
};
export const TERMINAL_SESSION_IDLE_GRACE_MS = 5 * 60 * 1000;
export const TERMINAL_SCROLLBACK_MAX_BYTES = 512 * 1024;
