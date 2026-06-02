import { existsSync } from "node:fs";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { logWarn } from "../logging";

const TURNS_SUFFIX = ".claude-turns.json";

type ListConversationOptions = {
  limit?: number;
  offset?: number;
};

type ConversationTurn = { role: string; content: string; startedAt: string; endedAt: string };

const logFileError = (action: string, file: string, error: unknown): void => {
  logWarn(
    `[conversation-store] ${action} failed for ${file}: ${error instanceof Error ? error.message : String(error)}`,
  );
};

/**
 * Parses a JSONL transcript body into structured events. Per-line JSON.parse
 * failures are expected for blank/partial lines, so they are silently dropped
 * and counted; a single warning per file is emitted only when lines were skipped.
 */
const parseTranscriptEvents = (raw: string, file: string): Record<string, unknown>[] => {
  let skipped = 0;
  const events = raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return null;
      }
      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        skipped += 1;
        return null;
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null);

  if (skipped > 0) {
    logWarn(`[conversation-store] skipped ${skipped} unparseable line(s) in ${file}`);
  }

  return events;
};

/**
 * Conversation transcript read/search/export helpers. These operate purely on
 * the on-disk transcript files under `<stateDir>/state/transcripts` and hold no
 * runtime closure state, so they are factored out of the terminal runtime. All
 * file access is asynchronous (node:fs/promises) so it never blocks the event loop.
 */
export const createConversationStore = (stateDir: string) => {
  const transcriptDir = join(stateDir, "state", "transcripts");

  const readTurns = async (sessionId: string): Promise<ConversationTurn[]> => {
    const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}${TURNS_SUFFIX}`);
    try {
      const raw = await readFile(turnsPath, "utf8");
      return JSON.parse(raw) as ConversationTurn[];
    } catch (error) {
      // ENOENT is the common "no turns file yet" case; only warn for genuine
      // read/parse failures so the log isn't noisy for sessions without turns.
      if (!(typeof error === "object" && error && "code" in error && error.code === "ENOENT")) {
        logFileError("read turns", `${sessionId}${TURNS_SUFFIX}`, error);
      }
      return [];
    }
  };

  const buildSummary = async (file: string): Promise<Record<string, unknown> | null> => {
    const sessionId = decodeURIComponent(file.slice(0, -6));
    let raw: string;
    try {
      raw = (await readFile(join(transcriptDir, file), "utf8")).trim();
    } catch (error) {
      logFileError("read transcript", file, error);
      return null;
    }
    if (!raw) {
      return null;
    }

    const events = parseTranscriptEvents(raw, file);
    const startEvent = events.find((e) => e.type === "session_start");
    const endEvent = events.find((e) => e.type === "session_end");
    if (!startEvent) {
      return null;
    }

    const turns = await readTurns(sessionId);
    const userTurns = turns.filter((t) => t.role === "user");
    const assistantTurns = turns.filter((t) => t.role === "assistant");

    const lastTimestamp = endEvent?.timestamp ?? events[events.length - 1]?.timestamp;
    return {
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
    };
  };

  return {
    /**
     * Returns conversation summaries (a bare array). When `options` is omitted the
     * full set is returned (legacy behavior). When a limit/offset is supplied the
     * window is selected by mtime (cheap stat) BEFORE reading/parsing transcript
     * bodies, so only the windowed files are read off disk.
     */
    async listConversationSessions(options?: ListConversationOptions): Promise<unknown[]> {
      if (!existsSync(transcriptDir)) return [];

      let entries: { file: string; mtimeMs: number }[];
      try {
        const files = (await readdir(transcriptDir)).filter((f) => f.endsWith(".jsonl"));
        entries = await Promise.all(
          files.map(async (file) => {
            try {
              const stats = await stat(join(transcriptDir, file));
              return { file, mtimeMs: stats.mtimeMs };
            } catch (error) {
              logFileError("stat", file, error);
              return { file, mtimeMs: 0 };
            }
          }),
        );
      } catch (error) {
        logFileError("list transcripts", transcriptDir, error);
        return [];
      }

      // Sort newest-first so pagination returns the most recent sessions.
      entries.sort((a, b) => b.mtimeMs - a.mtimeMs);

      const windowed =
        options && (options.limit !== undefined || options.offset !== undefined)
          ? entries.slice(
              options.offset ?? 0,
              (options.offset ?? 0) + (options.limit ?? entries.length),
            )
          : entries;

      const summaries: unknown[] = [];
      for (const { file } of windowed) {
        const summary = await buildSummary(file);
        if (summary) {
          summaries.push(summary);
        }
      }
      return summaries;
    },

    async readConversationSession(sessionId: string): Promise<unknown> {
      const transcriptPath = join(transcriptDir, `${encodeURIComponent(sessionId)}.jsonl`);
      let raw: string;
      try {
        raw = (await readFile(transcriptPath, "utf8")).trim();
      } catch (error) {
        if (!(typeof error === "object" && error && "code" in error && error.code === "ENOENT")) {
          logFileError("read transcript", `${sessionId}.jsonl`, error);
        }
        return null;
      }
      if (!raw) return null;

      const events = parseTranscriptEvents(raw, `${sessionId}.jsonl`);
      const turns = await readTurns(sessionId);

      const startEvent = events.find((e) => e.type === "session_start");
      return {
        sessionId,
        tentacleId: startEvent?.tentacleId ?? sessionId,
        turnCount: turns.length,
        events,
        turns,
      };
    },

    async exportConversationSession(
      sessionId: string,
      format: "md" | "json",
    ): Promise<string | null> {
      const turnsPath = join(transcriptDir, `${encodeURIComponent(sessionId)}${TURNS_SUFFIX}`);
      let turns: Array<{ role: string; content: string }>;
      try {
        turns = JSON.parse(await readFile(turnsPath, "utf8")) as typeof turns;
      } catch (error) {
        if (!(typeof error === "object" && error && "code" in error && error.code === "ENOENT")) {
          logFileError("read turns", `${sessionId}${TURNS_SUFFIX}`, error);
        }
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

    async deleteConversationSession(sessionId: string): Promise<void> {
      const base = join(transcriptDir, encodeURIComponent(sessionId));
      for (const ext of [".jsonl", TURNS_SUFFIX]) {
        const path = `${base}${ext}`;
        try {
          await rm(path, { force: true });
        } catch (error) {
          logFileError("delete", `${sessionId}${ext}`, error);
        }
      }
    },

    async deleteAllConversationSessions(): Promise<void> {
      if (!existsSync(transcriptDir)) return;
      let files: string[];
      try {
        files = await readdir(transcriptDir);
      } catch (error) {
        logFileError("list transcripts", transcriptDir, error);
        return;
      }
      for (const file of files) {
        try {
          await rm(join(transcriptDir, file), { force: true });
        } catch (error) {
          logFileError("delete", file, error);
        }
      }
    },

    async searchConversations(query: string): Promise<unknown[]> {
      const q = query.toLowerCase();
      if (!existsSync(transcriptDir)) return [];
      let files: string[];
      try {
        files = (await readdir(transcriptDir)).filter((f) => f.endsWith(TURNS_SUFFIX));
      } catch (error) {
        logFileError("list transcripts", transcriptDir, error);
        return [];
      }

      const results: unknown[] = [];
      for (const file of files) {
        const sessionId = decodeURIComponent(file.slice(0, -TURNS_SUFFIX.length));
        let turns: Array<{ role: string; content: string }>;
        try {
          turns = JSON.parse(await readFile(join(transcriptDir, file), "utf8")) as typeof turns;
        } catch (error) {
          logFileError("read turns", file, error);
          continue;
        }
        if (turns.some((t) => t.content.toLowerCase().includes(q))) {
          results.push({ sessionId });
        }
      }
      return results;
    },
  };
};
