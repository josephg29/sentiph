export const TERMINAL_ID_PREFIX = "terminal-";
export const SENTIPH_TENTACLE_ID = "__sentiph__";
export const TERMINAL_REGISTRY_VERSION = 3;
const TERMINAL_REGISTRY_RELATIVE_PATH = ".sentiph/state/tentacles.json";
const TERMINAL_TRANSCRIPT_RELATIVE_PATH = ".sentiph/state/transcripts";
const TENTACLE_WORKTREE_RELATIVE_PATH = ".sentiph/worktrees";
const TENTACLE_WORKTREE_BRANCH_PREFIX = "sentiph/";
export const DEFAULT_AGENT_PROVIDER = "claude-code" as const;

const CLAUDE_BOOTSTRAP = "claude --dangerously-skip-permissions";

export const TERMINAL_BOOTSTRAP_COMMANDS: Record<string, string> = {
  codex: "codex",
  "claude-code": CLAUDE_BOOTSTRAP,
};
const CLAUDE_BOOTSTRAP_COMMAND = CLAUDE_BOOTSTRAP;

// Maps the public model aliases that spawn_terminal accepts onto the
// CLI flag value Claude Code expects. Aliases keep the orchestrator's
// decision space small (3 options) while still letting us swap in
// specific point releases if a model is retired.
export const CLAUDE_MODEL_FLAG_VALUE: Record<"opus" | "sonnet" | "haiku", string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

// Effort maps to the Claude Code MAX_THINKING_TOKENS env var, which
// caps the extended-thinking budget for the spawned session. Low keeps
// responses fast; high reserves the full default budget for deep tasks.
export const CLAUDE_EFFORT_THINKING_TOKENS: Record<"low" | "medium" | "high", number> = {
  low: 4_000,
  medium: 16_000,
  high: 31_999,
};
export const TERMINAL_SESSION_IDLE_GRACE_MS = 5 * 60 * 1000;
export const TERMINAL_SCROLLBACK_MAX_BYTES = 512 * 1024;
export const TERMINAL_MAX_CONCURRENT_SESSIONS = 32;
export const DEFAULT_TERMINAL_INACTIVITY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
