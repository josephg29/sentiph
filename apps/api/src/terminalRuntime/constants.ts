export const TERMINAL_ID_PREFIX = "terminal-";
export const OCTOBOSS_TENTACLE_ID = "__octoboss__";
export const TERMINAL_REGISTRY_VERSION = 3;
export const TERMINAL_REGISTRY_RELATIVE_PATH = ".octogent/state/tentacles.json";
export const TERMINAL_TRANSCRIPT_RELATIVE_PATH = ".octogent/state/transcripts";
export const TENTACLE_WORKTREE_RELATIVE_PATH = ".octogent/worktrees";
export const TENTACLE_WORKTREE_BRANCH_PREFIX = "octogent/";
export const DEFAULT_AGENT_PROVIDER = "claude-code" as const;

// Set OCTOGENT_BYPASS_PERMISSIONS=0 to launch Claude Code without
// --dangerously-skip-permissions (Claude will prompt for each tool call).
// Default: enabled (matches historical behaviour).
const bypassPermissions = process.env.OCTOGENT_BYPASS_PERMISSIONS !== "0";
const CLAUDE_BOOTSTRAP = bypassPermissions
  ? "claude --dangerously-skip-permissions"
  : "claude";

export const TERMINAL_BOOTSTRAP_COMMANDS: Record<string, string> = {
  codex: "codex",
  "claude-code": CLAUDE_BOOTSTRAP,
};
export const CLAUDE_BOOTSTRAP_COMMAND = CLAUDE_BOOTSTRAP;
export const TERMINAL_SESSION_IDLE_GRACE_MS = 5 * 60 * 1000;
export const TERMINAL_SCROLLBACK_MAX_BYTES = 512 * 1024;
export const TERMINAL_MAX_CONCURRENT_SESSIONS = 32;
export const DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
