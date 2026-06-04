import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  CLAUDE_MODEL_FLAG_VALUE,
  DEFAULT_AGENT_PROVIDER,
  SENTIPH_TENTACLE_ID,
  TERMINAL_BOOTSTRAP_COMMANDS,
} from "./constants";
import type { PersistedTerminal, TerminalAgentProvider } from "./types";

export type ClaudeBootstrapPlan = {
  flags: string[];
  banner?: string;
  sessionIdToPersist?: string;
};

export type BuildBootstrapCommandOptions = {
  provider: TerminalAgentProvider;
  tentacleId: string;
  isGroupLeader?: boolean;
  claudeBootstrapFlags?: string[];
  sentiphMcpConfigPath?: string;
  sentiphSystemPromptPath?: string;
  // Shell token used to invoke Claude Code. Defaults to the bare `claude`
  // word; callers pass a resolved, shell-executable path (see
  // resolveClaudeCommand) so the command works in the spawned PTY shell —
  // notably cmd.exe on Windows, which cannot launch a bare `claude`.
  claudeExecutable?: string;
};

export const buildBootstrapCommand = ({
  provider,
  tentacleId,
  isGroupLeader,
  claudeBootstrapFlags,
  sentiphMcpConfigPath,
  sentiphSystemPromptPath,
  claudeExecutable,
}: BuildBootstrapCommandOptions): string => {
  // Split the configured base command into the executable head and its static
  // flags, then swap the head for the resolved executable when provided. The
  // resolved path may contain spaces (already quoted), so it is kept as a
  // single token rather than re-split.
  const baseTokens = (TERMINAL_BOOTSTRAP_COMMANDS[DEFAULT_AGENT_PROVIDER] ?? "claude")
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const head = claudeExecutable ?? baseTokens[0] ?? "claude";
  const baseFlags = baseTokens.slice(1);
  const baseCommand = [head, ...baseFlags].join(" ");

  if (tentacleId === SENTIPH_TENTACLE_ID) {
    const flags: string[] = [];
    if (sentiphMcpConfigPath) {
      flags.push(`--mcp-config "${sentiphMcpConfigPath}"`);
    }
    if (sentiphSystemPromptPath) {
      // The prompt file is authored to avoid bash double-quoted special
      // characters (verified at write time), so the substitution is safe.
      // The inner quotes around the path tolerate spaces in stateDir.
      flags.push(`--append-system-prompt "$(cat "${sentiphSystemPromptPath}")"`);
    }
    return flags.length > 0 ? `${baseCommand} ${flags.join(" ")}` : baseCommand;
  }
  if (provider === "claude-code" && isGroupLeader && sentiphMcpConfigPath) {
    const resumeFlags = claudeBootstrapFlags ?? [];
    return [head, ...resumeFlags, `--mcp-config "${sentiphMcpConfigPath}"`, ...baseFlags].join(" ");
  }
  if (provider === "claude-code") {
    const resumeFlags = claudeBootstrapFlags ?? [];
    return [head, ...resumeFlags, ...baseFlags].join(" ");
  }
  return TERMINAL_BOOTSTRAP_COMMANDS[provider] ?? baseCommand;
};

const claudeProjectsDir = (): string => {
  const override = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (override && override.length > 0) {
    return join(override, "projects");
  }
  return join(homedir(), ".claude", "projects");
};

const encodeClaudeProjectDirectoryName = (cwd: string): string => cwd.replace(/\//g, "-");

const claudeSessionFileExists = (cwd: string, sessionId: string): boolean => {
  try {
    const path = join(
      claudeProjectsDir(),
      encodeClaudeProjectDirectoryName(cwd),
      `${sessionId}.jsonl`,
    );
    return existsSync(path);
  } catch {
    return false;
  }
};

export const planClaudeBootstrap = (
  terminalRecord: PersistedTerminal | undefined,
  cwd: string,
): ClaudeBootstrapPlan => {
  if (!terminalRecord || terminalRecord.tentacleId === SENTIPH_TENTACLE_ID) {
    return { flags: [] };
  }

  const provider = terminalRecord.agentProvider ?? DEFAULT_AGENT_PROVIDER;
  if (provider !== "claude-code") {
    return { flags: [] };
  }

  const modelFlags: string[] = [];
  if (terminalRecord.model) {
    const modelId = CLAUDE_MODEL_FLAG_VALUE[terminalRecord.model];
    if (modelId) {
      modelFlags.push("--model", modelId);
    }
  }
  const withModel = (flags: string[]): string[] =>
    modelFlags.length > 0 ? [...modelFlags, ...flags] : flags;

  const existingSessionId = terminalRecord.claudeSessionId;
  if (existingSessionId) {
    if (claudeSessionFileExists(cwd, existingSessionId)) {
      return {
        flags: withModel(["--resume", existingSessionId]),
        banner: "[Sentiph: resuming previous Claude session…]",
      };
    }
    // The persisted session ID has no transcript on disk in this cwd.
    // Reusing `--session-id <same>` after a failed bootstrap (e.g. credits
    // exhausted, Fast mode disabled) causes Claude CLI to abort with
    // "session already exists". Allocate a fresh ID and persist it so the
    // retry — and any parallel worker spawn — can succeed.
    const replacementSessionId = randomUUID();
    return {
      flags: withModel(["--session-id", replacementSessionId]),
      sessionIdToPersist: replacementSessionId,
    };
  }

  const priorLifecycle = terminalRecord.lifecycleState;
  const hadPriorSession =
    priorLifecycle === "stopped" || priorLifecycle === "exited" || priorLifecycle === "stale";

  if (hadPriorSession) {
    return {
      flags: withModel(["--continue"]),
      banner: "[Sentiph: resuming previous Claude session…]",
    };
  }

  const newSessionId = randomUUID();
  return {
    flags: withModel(["--session-id", newSessionId]),
    sessionIdToPersist: newSessionId,
  };
};
