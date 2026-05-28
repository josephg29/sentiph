import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export const createShellEnvironment = (options?: {
  sentiphSessionId?: string;
  maxThinkingTokens?: number;
}) => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  // Disable shell idle-exit timers so PTY sessions survive when no client is connected.
  env.TMOUT = "0";
  if (options?.sentiphSessionId) {
    env.SENTIPH_SESSION_ID = options.sentiphSessionId;
  }
  if (options?.maxThinkingTokens !== undefined && Number.isFinite(options.maxThinkingTokens)) {
    env.MAX_THINKING_TOKENS = String(Math.max(0, Math.floor(options.maxThinkingTokens)));
  }
  return env;
};

export const ensureNodePtySpawnHelperExecutable = () => {
  if (process.platform === "win32") {
    return;
  }

  try {
    const packageJsonPath = require.resolve("node-pty/package.json");
    const packageDir = dirname(packageJsonPath);
    const helperCandidates = [
      join(packageDir, "build", "Release", "spawn-helper"),
      join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    ];

    for (const helperPath of helperCandidates) {
      if (!existsSync(helperPath)) {
        continue;
      }

      const currentMode = statSync(helperPath).mode;
      if ((currentMode & 0o111) !== 0) {
        continue;
      }

      chmodSync(helperPath, currentMode | 0o755);
    }
  } catch {
    // Let node-pty throw the actionable error if helper lookup/setup fails.
  }
};
