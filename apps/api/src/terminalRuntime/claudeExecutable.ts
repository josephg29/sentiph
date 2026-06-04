import { existsSync } from "node:fs";
import { win32 as winPath } from "node:path";

// Windows wrappers cmd.exe can actually launch, in cmd.exe's default PATHEXT
// priority order. The extensionless `claude` bash shim and `claude.ps1` are
// deliberately excluded: cmd.exe cannot execute either and aborts the spawned
// terminal with "The system cannot execute the specified program." When a dev
// machine lists `.PS1` ahead of `.CMD` in PATHEXT, a bare `claude` resolves to
// `claude.ps1` and the worker never boots.
const WINDOWS_CLAUDE_FILENAMES = ["claude.com", "claude.exe", "claude.bat", "claude.cmd"] as const;

export type ResolveClaudeCommandOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  fileExists?: (candidatePath: string) => boolean;
};

// Wrap a path in double quotes only when it contains whitespace, so the
// resulting shell token stays a single argument (e.g. "C:\Program Files\...").
const quoteIfNeeded = (value: string): string => (/\s/.test(value) ? `"${value}"` : value);

/**
 * Resolves the shell token used to launch Claude Code inside a PTY.
 *
 * The PTY is a generic shell (cmd.exe on Windows), and the bootstrap command
 * is typed into it as text — so the token must be something that shell can
 * execute as written. On Windows that means an explicit `.cmd`/`.exe`/`.bat`
 * wrapper resolved against PATH, never the bare `claude` word (which may bind
 * to a `.ps1` or extensionless shim cmd.exe cannot run). POSIX shells resolve
 * a bare `claude` correctly, so it is returned unchanged there.
 *
 * `SENTIPH_CLAUDE_PATH` overrides resolution on every platform, giving
 * operators an escape hatch for non-standard installs.
 */
export const resolveClaudeCommand = (options: ResolveClaudeCommandOptions = {}): string => {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const fileExists = options.fileExists ?? existsSync;

  const override = env.SENTIPH_CLAUDE_PATH?.trim();
  if (override && override.length > 0) {
    return quoteIfNeeded(override);
  }

  if (platform !== "win32") {
    return "claude";
  }

  // process.env is case-insensitive on Windows, but an injected plain object
  // (tests) is not — probe the common spellings.
  const pathValue = env.PATH ?? env.Path ?? env.path ?? "";
  const pathDirs = pathValue
    .split(";")
    .map((dir) => dir.trim().replace(/^"(.*)"$/, "$1"))
    .filter((dir) => dir.length > 0);

  for (const dir of pathDirs) {
    for (const filename of WINDOWS_CLAUDE_FILENAMES) {
      const candidate = winPath.join(dir, filename);
      if (fileExists(candidate)) {
        return quoteIfNeeded(candidate);
      }
    }
  }

  // Nothing resolvable on PATH: fall back to the bare command so the failure
  // mode is no worse than before rather than throwing during bootstrap.
  return "claude";
};
