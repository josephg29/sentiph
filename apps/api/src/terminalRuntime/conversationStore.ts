import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Conversation transcript read/search/export helpers. These operate purely on
 * the on-disk transcript files under `<stateDir>/state/transcripts` and hold no
 * runtime closure state, so they are factored out of the terminal runtime.
 */
export const createConversationStore = (stateDir: string) => {
  const transcriptDir = join(stateDir, "state", "transcripts");

  return {
    listConversationSessions() {
      if (!existsSync(transcriptDir)) return [];
      const summaries: unknown[] = [];
      try {
        const files = readdirSync(transcriptDir).filter((f) => f.endsWith(".jsonl"));
        for (const file of files) {
          const sessionId = decodeURIComponent(file.slice(0, -6));
          const raw = readFileSync(join(transcriptDir, file), "utf8").trim();
          if (!raw) continue;
          const events = raw
            .split("\n")
            .map((l) => {
              try {
                return JSON.parse(l) as Record<string, unknown>;
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Record<string, unknown>[];

          const startEvent = events.find((e) => e.type === "session_start");
          const endEvent = events.find((e) => e.type === "session_end");
          if (!startEvent) continue;

          const turnsPath = join(
            transcriptDir,
            `${encodeURIComponent(sessionId)}.claude-turns.json`,
          );
          let turns: Array<{ role: string; content: string; startedAt: string; endedAt: string }> =
            [];
          if (existsSync(turnsPath)) {
            try {
              turns = JSON.parse(readFileSync(turnsPath, "utf8")) as typeof turns;
            } catch {
              /* ignore */
            }
          }
          const userTurns = turns.filter((t) => t.role === "user");
          const assistantTurns = turns.filter((t) => t.role === "assistant");

          const lastTimestamp = endEvent?.timestamp ?? events[events.length - 1]?.timestamp;
          summaries.push({
            sessionId,
            tentacleId: startEvent.tentacleId ?? sessionId,
            startedAt: startEvent.timestamp,
            endedAt: endEvent?.timestamp ?? null,
            lastEventAt: lastTimestamp ?? null,
            eventCount: events.length,
            turnCount: turns.length,
            userTurnCount: userTurns.length,
            assistantTurnCount: assistantTurns.length,
            firstUserTurnPreview: userTurns[0]?.content?.slice(0, 200) ?? null,
            lastUserTurnPreview: userTurns[userTurns.length - 1]?.content?.slice(0, 200) ?? null,
            lastAssistantTurnPreview:
              assistantTurns[assistantTurns.length - 1]?.content?.slice(0, 200) ?? null,
          });
        }
      } catch {
        /* ignore */
      }
      return summaries;
    },

    readConversationSession(sessionId: string) {
      const transcriptPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.jsonl`);
      if (!existsSync(transcriptPath)) return null;
      const raw = readFileSync(transcriptPath, "utf8").trim();
      if (!raw) return null;
      const events = raw
        .split("\n")
        .map((l) => {
          try {
            return JSON.parse(l) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.claude-turns.json`);
      let turns: unknown[] = [];
      if (existsSync(turnsPath)) {
        try {
          turns = JSON.parse(readFileSync(turnsPath, "utf8")) as unknown[];
        } catch {
          /* ignore */
        }
      }

      const startEvent = (events as Record<string, unknown>[]).find(
        (e) => e.type === "session_start",
      );
      return {
        sessionId,
        tentacleId: startEvent?.tentacleId ?? sessionId,
        turnCount: turns.length,
        events,
        turns,
      };
    },

    exportConversationSession(sessionId: string, format: "md" | "json") {
      const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.claude-turns.json`);
      if (!existsSync(turnsPath)) return null;
      let turns: Array<{ role: string; content: string }> = [];
      try {
        turns = JSON.parse(readFileSync(turnsPath, "utf8")) as typeof turns;
      } catch {
        return null;
      }

      if (format === "json") {
        return JSON.stringify({ sessionId, turnCount: turns.length, turns });
      }

      const lines: string[] = [];
      for (const turn of turns) {
        lines.push(`## ${turn.role === "user" ? "User" : "Assistant"}`);
        lines.push("");
        lines.push(turn.content);
        lines.push("");
      }
      return lines.join("\n");
    },

    deleteConversationSession(sessionId: string) {
      const base = join(transcriptDir, encodeURIComponent(sessionId));
      for (const ext of [".jsonl", ".claude-turns.json"]) {
        const path = `${base}${ext}`;
        if (existsSync(path)) {
          try {
            rmSync(path);
          } catch {
            /* ignore */
          }
        }
      }
    },

    deleteAllConversationSessions() {
      if (!existsSync(transcriptDir)) return;
      try {
        const files = readdirSync(transcriptDir);
        for (const file of files) {
          try {
            rmSync(join(transcriptDir, file));
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    },

    searchConversations(query: string) {
      const q = query.toLowerCase();
      if (!existsSync(transcriptDir)) return [];
      const results: unknown[] = [];
      try {
        const files = readdirSync(transcriptDir).filter((f) => f.endsWith(".claude-turns.json"));
        for (const file of files) {
          const sessionId = decodeURIComponent(file.slice(0, -".claude-turns.json".length));
          let turns: Array<{ role: string; content: string }> = [];
          try {
            turns = JSON.parse(readFileSync(join(transcriptDir, file), "utf8")) as typeof turns;
          } catch {
            continue;
          }
          if (turns.some((t) => t.content.toLowerCase().includes(q))) {
            results.push({ sessionId });
          }
        }
      } catch {
        /* ignore */
      }
      return results;
    },
  };
};
