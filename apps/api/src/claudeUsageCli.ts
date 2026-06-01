import { execFileSync } from "node:child_process";

import { stripAnsiCodes } from "./claudeUsageParsing";
import { logVerbose } from "./logging";

const CLI_PTY_TIMEOUT_MS = 25_000;
const CLI_PTY_SETTLE_MS = 3_500;
const CLI_PTY_ENTER_INTERVAL_MS = 600;
const CLI_PTY_POST_USAGE_GRACE_MS = 2_500;
const CLI_PTY_READY_DELAY_MS = 900;
const CLI_PTY_USAGE_RETRY_MS = 3_000;
const CLI_PTY_COLS = 160;
const CLI_PTY_ROWS = 50;

const STOP_NEEDLES = [
  "current week (all models)",
  "current week (opus)",
  "current week (sonnet only)",
  "current week (sonnet)",
  "current session",
  "failed to load usage data",
];

const USAGE_COMMAND_NEEDLES = ["/usage", "current week", "current session"];

const resolveClaudeBinary = (): string | null => {
  try {
    const result = execFileSync("which", ["claude"], {
      timeout: 3_000,
      encoding: "utf8",
    }).trim();
    return result || null;
  } catch {
    return null;
  }
};

const scrubbedEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "CLAUDECODE") continue;
    if (key.startsWith("ANTHROPIC_")) continue;
    if (value !== undefined) env[key] = value;
  }
  return env;
};

// ---------------------------------------------------------------------------
// CLI PTY spawn — fresh process each time, results cached
// ---------------------------------------------------------------------------

// Patterns that indicate the CLI welcome screen has fully rendered.
// After ANSI stripping, cursor-movement codes collapse spaces, so we
// match with all whitespace removed (e.g. "tipsforgettingstarted").
const READY_NEEDLES = [
  "tipsforgettingstarted",
  "recentactivity",
  "welcomeback",
  "whatcanihelpyouwith",
];

const isClaudeCliReady = (normalized: string, collapsed: string): boolean => {
  if (READY_NEEDLES.some((needle) => collapsed.includes(needle))) {
    return true;
  }

  // Claude Code v2.1.x can land directly on the shell prompt instead of the
  // older welcome copy. In that mode we see the product header and a visible
  // prompt glyph, but none of the historical ready markers.
  return collapsed.includes("claudecodev") && normalized.includes("❯");
};

const spawnCliAndCapture = (binary: string): Promise<string | null> =>
  new Promise<string | null>((resolve) => {
    import("node-pty")
      .then((pty) => {
        let buffer = "";
        let usageBuffer = "";
        let done = false;
        let phase: "waiting" | "capturing" = "waiting";
        let settleTimer: ReturnType<typeof setTimeout> | null = null;
        let enterTimer: ReturnType<typeof setInterval> | null = null;
        let usageRetryTimer: ReturnType<typeof setTimeout> | null = null;
        let usageSentAt = 0;
        let usageSendCount = 0;

        const term = pty.spawn(binary, ["--allowed-tools", ""], {
          name: "xterm-256color",
          cols: CLI_PTY_COLS,
          rows: CLI_PTY_ROWS,
          env: scrubbedEnv(),
        });

        const finish = (result: string | null) => {
          if (done) return;
          done = true;
          if (deadlineTimer) clearTimeout(deadlineTimer);
          if (settleTimer) clearTimeout(settleTimer);
          if (enterTimer) clearInterval(enterTimer);
          if (usageRetryTimer) clearTimeout(usageRetryTimer);
          try {
            term.kill();
          } catch {
            /* already dead */
          }
          resolve(result);
        };

        const deadlineTimer = setTimeout(() => {
          finish(usageBuffer.length > 0 ? usageBuffer : buffer.length > 0 ? buffer : null);
        }, CLI_PTY_TIMEOUT_MS);

        const sendUsageCommand = () => {
          if (phase === "waiting") {
            phase = "capturing";
          }

          // Capture only the latest /usage render, not the startup shell.
          usageBuffer = "";
          usageSentAt = Date.now();
          usageSendCount += 1;
          logVerbose("[claude-usage] CLI ready, sending /usage");
          try {
            term.write("/usage\r");
          } catch {
            finish(null);
            return;
          }
          // Periodic Enter presses to refresh TUI render
          enterTimer = setInterval(() => {
            try {
              term.write("\r");
            } catch {
              /* ignore */
            }
          }, CLI_PTY_ENTER_INTERVAL_MS);

          if (usageRetryTimer) clearTimeout(usageRetryTimer);
          usageRetryTimer = setTimeout(() => {
            const usageCollapsed = stripAnsiCodes(usageBuffer).toLowerCase().replace(/\s+/gu, "");
            const sawStopNeedle = STOP_NEEDLES.some((needle) =>
              usageCollapsed.includes(needle.replace(/\s+/gu, "")),
            );
            if (!done && usageSendCount < 2 && !sawStopNeedle) {
              logVerbose("[claude-usage] CLI usage view did not render yet, retrying /usage");
              sendUsageCommand();
            }
          }, CLI_PTY_USAGE_RETRY_MS);
        };

        term.onData((data: string) => {
          buffer += data;
          if (phase === "capturing") {
            usageBuffer += data;
          }

          const normalized = stripAnsiCodes(buffer).toLowerCase();

          const collapsed = normalized.replace(/\s+/gu, "");

          // Handle trust prompts
          if (collapsed.includes("doyoutrust")) {
            try {
              term.write("y\r");
            } catch {
              /* ignore */
            }
            return;
          }

          // Phase 1: wait for welcome screen to render, then send /usage
          if (phase === "waiting") {
            if (isClaudeCliReady(normalized, collapsed)) {
              phase = "capturing";
              usageBuffer = "";
              setTimeout(() => {
                if (!done && phase === "capturing" && usageSendCount === 0) {
                  sendUsageCommand();
                }
              }, CLI_PTY_READY_DELAY_MS);
            }
            return;
          }

          // Phase 2: capturing /usage output — look for stop needles
          const usageCollapsed = stripAnsiCodes(usageBuffer).toLowerCase().replace(/\s+/gu, "");
          const sawUsageCommand = USAGE_COMMAND_NEEDLES.some((needle) =>
            usageCollapsed.includes(needle.replace(/\s+/gu, "")),
          );
          const usageGraceElapsed = Date.now() - usageSentAt >= CLI_PTY_POST_USAGE_GRACE_MS;
          if (
            !settleTimer &&
            usageGraceElapsed &&
            sawUsageCommand &&
            STOP_NEEDLES.some((n) => usageCollapsed.includes(n.replace(/\s+/gu, "")))
          ) {
            settleTimer = setTimeout(() => finish(usageBuffer), CLI_PTY_SETTLE_MS);
          }
        });

        term.onExit(() =>
          finish(usageBuffer.length > 0 ? usageBuffer : buffer.length > 0 ? buffer : null),
        );
      })
      .catch(() => resolve(null));
  });

export const spawnDefaultCliUsage = async (): Promise<string | null> => {
  const binary = resolveClaudeBinary();
  if (!binary) return null;
  return spawnCliAndCapture(binary);
};
