import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseClaudeTranscript } from "./claudeTranscript";
import { storeClaudeTranscriptTurns } from "./conversations";
import { broadcastMessage } from "./protocol";
import type { PersistedTerminal, TerminalSession } from "./types";

const MAX_AUTO_NAME_LENGTH = 50;

const deriveTerminalNameFromPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_AUTO_NAME_LENGTH) {
    return normalized;
  }

  // Truncate at the last space before the limit to avoid cutting mid-word.
  const truncated = normalized.slice(0, MAX_AUTO_NAME_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? `${truncated.slice(0, lastSpace)}…` : `${truncated}…`;
};

export const createHookProcessor = (deps: {
  terminals: Map<string, PersistedTerminal>;
  sessions: Map<string, TerminalSession>;
  transcriptDirectoryPath: string;
  apiPort: string;
  workspaceCwd: string;
  persistRegistry: () => void;
  deliverChannelMessages: (terminalId: string) => void;
}) => {
  const {
    terminals,
    sessions,
    transcriptDirectoryPath,
    apiPort,
    workspaceCwd,
    persistRegistry,
    deliverChannelMessages,
  } = deps;

  const installHooksInDirectory = (targetCwd: string) => {
    const targetClaudeDir = join(targetCwd, ".claude");
    const targetSettingsPath = join(targetClaudeDir, "settings.json");

    const hooksConfig = {
      hooks: {
        SessionStart: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: `curl -s -X POST "http://localhost:${apiPort}/api/hooks/session-start?octogent_session=$OCTOGENT_SESSION_ID" -H 'Content-Type: application/json' -d @- || true`,
                timeout: 5,
              },
            ],
          },
        ],
        UserPromptSubmit: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: `curl -s -X POST "http://localhost:${apiPort}/api/hooks/user-prompt-submit?octogent_session=$OCTOGENT_SESSION_ID" -H 'Content-Type: application/json' -d @- || true`,
                timeout: 5,
              },
            ],
          },
        ],
        PreToolUse: [
          {
            matcher: "*",
            hooks: [
              {
                type: "http",
                url: `http://localhost:${apiPort}/api/hooks/pre-tool-use`,
                headers: { "X-Octogent-Session": "$OCTOGENT_SESSION_ID" },
                allowedEnvVars: ["OCTOGENT_SESSION_ID"],
                timeout: 5,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "http",
                url: `http://localhost:${apiPort}/api/code-intel/events`,
                headers: { "X-Octogent-Session": "$OCTOGENT_SESSION_ID" },
                allowedEnvVars: ["OCTOGENT_SESSION_ID"],
                timeout: 5,
              },
            ],
          },
        ],
        Notification: [
          {
            matcher: "*",
            hooks: [
              {
                type: "http",
                url: `http://localhost:${apiPort}/api/hooks/notification`,
                headers: { "X-Octogent-Session": "$OCTOGENT_SESSION_ID" },
                allowedEnvVars: ["OCTOGENT_SESSION_ID"],
                timeout: 5,
              },
            ],
          },
        ],
        Stop: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: `curl -s -X POST "http://localhost:${apiPort}/api/hooks/stop?octogent_session=$OCTOGENT_SESSION_ID" -H 'Content-Type: application/json' -d @- || true`,
                timeout: 15,
              },
            ],
          },
        ],
      },
    };

    try {
      mkdirSync(targetClaudeDir, { recursive: true });
      writeFileSync(targetSettingsPath, `${JSON.stringify(hooksConfig, null, 2)}\n`, "utf8");
    } catch {
      // Best-effort
    }
  };

  const handleHook = (
    hookName: string,
    payload: unknown,
    octogentSessionId?: string,
  ): { ok: boolean } => {
    console.log(
      `[Hook] Received hook: ${hookName} octogentSession=${octogentSessionId ?? "(none)"}`,
      JSON.stringify(payload),
    );

    if (!payload || typeof payload !== "object") {
      return { ok: true };
    }

    const hookPayloadRecord = payload as Record<string, unknown>;

    if (hookName === "notification") {
      if (!octogentSessionId) {
        return { ok: true };
      }
      const session = sessions.get(octogentSessionId);
      if (!session) {
        console.log(`[Hook] notification: no session for ${octogentSessionId}, skipping.`);
        return { ok: true };
      }

      const notificationType =
        typeof hookPayloadRecord.notification_type === "string"
          ? hookPayloadRecord.notification_type
          : null;

      console.log(`[Hook] notification: type=${notificationType} session=${octogentSessionId}`);

      if (notificationType === "permission_prompt") {
        session.agentState = "waiting_for_permission";
        session.stateTracker.forceState("waiting_for_permission");
        broadcastMessage(session, {
          type: "state",
          state: "waiting_for_permission",
          ...(session.lastToolName ? { toolName: session.lastToolName } : {}),
        });
      } else if (notificationType === "idle_prompt") {
        session.agentState = "idle";
        session.stateTracker.forceState("idle");
        broadcastMessage(session, { type: "state", state: "idle" });

        // Deliver any queued channel messages now that the agent is idle.
        deliverChannelMessages(octogentSessionId);
      }

      return { ok: true };
    }

    if (hookName === "pre-tool-use") {
      if (!octogentSessionId) {
        return { ok: true };
      }
      const session = sessions.get(octogentSessionId);
      if (!session) {
        return { ok: true };
      }

      const toolName =
        typeof hookPayloadRecord.tool_name === "string" ? hookPayloadRecord.tool_name : null;

      console.log(`[Hook] pre-tool-use: tool=${toolName} session=${octogentSessionId}`);

      if (toolName) {
        session.lastToolName = toolName;
      }

      if (toolName === "AskUserQuestion") {
        session.agentState = "waiting_for_user";
        session.stateTracker.forceState("waiting_for_user");
        broadcastMessage(session, { type: "state", state: "waiting_for_user" });
      }

      return { ok: true };
    }

    if (hookName === "user-prompt-submit") {
      if (!octogentSessionId) {
        return { ok: true };
      }

      const terminal = terminals.get(octogentSessionId);
      if (!terminal) {
        return { ok: true };
      }

      // Update last-active timestamp (determines active/inactive on the canvas).
      terminal.lastActiveAt = new Date().toISOString();

      // The user submitted a prompt, so the agent is about to start processing.
      // Transition state out of waiting/idle to processing immediately.
      const activitySession = sessions.get(terminal.terminalId);
      if (activitySession) {
        activitySession.agentState = "processing";
        delete activitySession.lastToolName;
        activitySession.stateTracker.forceState("processing");
        broadcastMessage(activitySession, { type: "state", state: "processing" });
        broadcastMessage(activitySession, { type: "activity" });
      }

      // Auto-name the terminal from the first prompt when it still has its default name.
      if (terminal.tentacleName === terminal.terminalId) {
        const prompt =
          typeof hookPayloadRecord.prompt === "string" ? hookPayloadRecord.prompt.trim() : "";
        if (prompt.length > 0) {
          const derived = deriveTerminalNameFromPrompt(prompt);
          terminal.tentacleName = derived;
          console.log(`[Hook] Auto-named terminal ${terminal.terminalId} → "${derived}"`);

          const session = sessions.get(terminal.terminalId);
          if (session) {
            broadcastMessage(session, { type: "rename", tentacleName: derived });
          }
        }
      }

      persistRegistry();
      return { ok: true };
    }

    if (hookName !== "stop") {
      return { ok: true };
    }

    const hookPayload = payload as Record<string, unknown>;
    const transcriptPath =
      typeof hookPayload.transcript_path === "string" ? hookPayload.transcript_path : null;
    const hookCwd = typeof hookPayload.cwd === "string" ? hookPayload.cwd : null;

    console.log(`[Hook] Stop hook: transcriptPath=${transcriptPath}, hookCwd=${hookCwd}`);

    if (!transcriptPath || !hookCwd) {
      console.log("[Hook] Missing transcriptPath or hookCwd, skipping.");
      return { ok: true };
    }

    let matchedSessionId: string | null = null;

    if (octogentSessionId && sessions.has(octogentSessionId)) {
      matchedSessionId = octogentSessionId;
      console.log(`[Hook] Matched session by octogent_session param: ${matchedSessionId}`);
    } else if (octogentSessionId) {
      console.log(
        `[Hook] octogent_session=${octogentSessionId} not found in active sessions, skipping.`,
      );
      return { ok: true };
    } else {
      console.log("[Hook] No octogent_session param — ignoring hook from external Claude session.");
      return { ok: true };
    }

    console.log(`[Hook] Matched session: ${matchedSessionId}, parsing transcript...`);
    const turns = parseClaudeTranscript(transcriptPath);
    console.log(`[Hook] Parsed ${turns?.length ?? 0} turns from transcript.`);

    const lastAssistantMessage =
      typeof hookPayload.last_assistant_message === "string"
        ? hookPayload.last_assistant_message.trim()
        : null;

    if (lastAssistantMessage && lastAssistantMessage.length > 0) {
      const effectiveTurns = turns ?? [];
      const lastTurn = effectiveTurns.length > 0 ? effectiveTurns[effectiveTurns.length - 1] : null;

      if (!lastTurn || lastTurn.role !== "assistant" || lastTurn.content !== lastAssistantMessage) {
        const now = new Date().toISOString();
        effectiveTurns.push({
          turnId: `turn-${effectiveTurns.length + 1}`,
          role: "assistant",
          content: lastAssistantMessage,
          startedAt: now,
          endedAt: now,
        });
        console.log("[Hook] Appended last_assistant_message as final turn.");
      }

      if (effectiveTurns.length > 0) {
        storeClaudeTranscriptTurns(transcriptDirectoryPath, matchedSessionId, effectiveTurns);
        console.log(
          `[Hook] Stored ${effectiveTurns.length} turns for session ${matchedSessionId}.`,
        );
      }
    } else if (turns && turns.length > 0) {
      storeClaudeTranscriptTurns(transcriptDirectoryPath, matchedSessionId, turns);
      console.log(`[Hook] Stored ${turns.length} turns for session ${matchedSessionId}.`);
    }

    // Deliver any queued channel messages now that the agent is idle.
    if (matchedSessionId) {
      deliverChannelMessages(matchedSessionId);
    }

    return { ok: true };
  };

  return { handleHook, installHooksInDirectory };
};
