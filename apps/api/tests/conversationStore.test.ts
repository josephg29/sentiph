import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createConversationStore } from "../src/terminalRuntime/conversationStore";

const SESSION_ID = "session-abc";
const ENCODED = encodeURIComponent(SESSION_ID);

const makeStartEvent = (sessionId = SESSION_ID) =>
  JSON.stringify({
    type: "session_start",
    sessionId,
    tentacleId: "t1",
    timestamp: "2024-01-01T00:00:00Z",
  });

const makeEndEvent = (sessionId = SESSION_ID) =>
  JSON.stringify({
    type: "session_end",
    sessionId,
    reason: "session_close",
    timestamp: "2024-01-01T01:00:00Z",
  });

const makeOutputEvent = () =>
  JSON.stringify({ type: "output", text: "hello world", timestamp: "2024-01-01T00:30:00Z" });

const makeTurns = (overrides: Array<{ role: string; content: string }> = []) =>
  JSON.stringify([
    {
      role: "user",
      content: "What is 2+2?",
      startedAt: "2024-01-01T00:01:00Z",
      endedAt: "2024-01-01T00:01:01Z",
    },
    {
      role: "assistant",
      content: "The answer is 4.",
      startedAt: "2024-01-01T00:01:02Z",
      endedAt: "2024-01-01T00:01:05Z",
    },
    ...overrides,
  ]);

describe("createConversationStore", () => {
  const tmpDirs: string[] = [];
  let stateDir: string;
  let transcriptDir: string;
  let store: ReturnType<typeof createConversationStore>;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "conv-store-test-"));
    tmpDirs.push(stateDir);
    transcriptDir = join(stateDir, "state", "transcripts");
    mkdirSync(transcriptDir, { recursive: true });
    store = createConversationStore(stateDir);
  });

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  const writeTranscript = (sessionId: string, lines: string[]) => {
    const path = join(transcriptDir, `${encodeURIComponent(sessionId)}.jsonl`);
    writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  };

  const writeTurns = (sessionId: string, content: string) => {
    const path = join(transcriptDir, `${encodeURIComponent(sessionId)}.claude-turns.json`);
    writeFileSync(path, content, "utf8");
  };

  // ─── listConversationSessions ───────────────────────────────────────────────

  describe("listConversationSessions", () => {
    it("returns empty array when transcript directory does not exist", () => {
      const noDir = createConversationStore(join(stateDir, "nonexistent"));
      expect(noDir.listConversationSessions()).toEqual([]);
    });

    it("returns empty array when no .jsonl files are present", () => {
      expect(store.listConversationSessions()).toEqual([]);
    });

    it("skips files with no session_start event", () => {
      writeTranscript(SESSION_ID, [makeOutputEvent()]);
      expect(store.listConversationSessions()).toEqual([]);
    });

    it("returns a summary for a session with start and end events", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), makeOutputEvent(), makeEndEvent()]);
      const summaries = store.listConversationSessions();
      expect(summaries).toHaveLength(1);
      const s = summaries[0] as Record<string, unknown>;
      expect(s.sessionId).toBe(SESSION_ID);
      expect(s.tentacleId).toBe("t1");
      expect(s.eventCount).toBe(3);
    });

    it("includes turn counts when a .claude-turns.json file exists", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), makeEndEvent()]);
      writeTurns(SESSION_ID, makeTurns());
      const summaries = store.listConversationSessions();
      const s = summaries[0] as Record<string, unknown>;
      expect(s.turnCount).toBe(2);
      expect(s.userTurnCount).toBe(1);
      expect(s.assistantTurnCount).toBe(1);
    });

    it("includes first and last user turn previews (max 200 chars)", () => {
      const longContent = "A".repeat(300);
      writeTurns(
        SESSION_ID,
        JSON.stringify([
          { role: "user", content: longContent, startedAt: "t", endedAt: "t" },
          { role: "assistant", content: "reply", startedAt: "t", endedAt: "t" },
        ]),
      );
      writeTranscript(SESSION_ID, [makeStartEvent(), makeEndEvent()]);
      const s = store.listConversationSessions()[0] as Record<string, unknown>;
      expect((s.firstUserTurnPreview as string).length).toBe(200);
    });

    it("includes lastEventAt from end event timestamp when present", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), makeEndEvent()]);
      const s = store.listConversationSessions()[0] as Record<string, unknown>;
      expect(s.endedAt).toBe("2024-01-01T01:00:00Z");
      expect(s.lastEventAt).toBe("2024-01-01T01:00:00Z");
    });

    it("uses last event timestamp as lastEventAt when end event is absent", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), makeOutputEvent()]);
      const s = store.listConversationSessions()[0] as Record<string, unknown>;
      expect(s.endedAt).toBeNull();
      expect(s.lastEventAt).toBe("2024-01-01T00:30:00Z");
    });

    it("skips sessions with empty transcript files", () => {
      writeFileSync(join(transcriptDir, `${ENCODED}.jsonl`), "", "utf8");
      expect(store.listConversationSessions()).toEqual([]);
    });

    it("gracefully handles corrupted .jsonl lines", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), "not json {{{"]);
      const summaries = store.listConversationSessions();
      expect(summaries).toHaveLength(1);
      const s = summaries[0] as Record<string, unknown>;
      expect(s.eventCount).toBe(1); // only the valid line is counted
    });

    it("gracefully handles corrupted .claude-turns.json", () => {
      writeTranscript(SESSION_ID, [makeStartEvent()]);
      writeTurns(SESSION_ID, "not json {{{");
      const summaries = store.listConversationSessions();
      expect(summaries).toHaveLength(1);
      const s = summaries[0] as Record<string, unknown>;
      expect(s.turnCount).toBe(0);
    });
  });

  // ─── readConversationSession ────────────────────────────────────────────────

  describe("readConversationSession", () => {
    it("returns null when the transcript file does not exist", () => {
      expect(store.readConversationSession("nonexistent")).toBeNull();
    });

    it("returns null for an empty transcript file", () => {
      writeFileSync(join(transcriptDir, `${ENCODED}.jsonl`), "", "utf8");
      expect(store.readConversationSession(SESSION_ID)).toBeNull();
    });

    it("returns events and turns for a valid session", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), makeEndEvent()]);
      writeTurns(SESSION_ID, makeTurns());
      const result = store.readConversationSession(SESSION_ID);
      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe(SESSION_ID);
      expect(result?.tentacleId).toBe("t1");
      expect(result?.events).toHaveLength(2);
      expect(result?.turnCount).toBe(2);
    });

    it("returns empty turns array when no .claude-turns.json exists", () => {
      writeTranscript(SESSION_ID, [makeStartEvent()]);
      const result = store.readConversationSession(SESSION_ID);
      expect(result?.turns).toEqual([]);
    });

    it("uses sessionId as tentacleId when session_start lacks tentacleId field", () => {
      writeTranscript(SESSION_ID, [
        JSON.stringify({ type: "session_start", sessionId: SESSION_ID, timestamp: "t" }),
      ]);
      const result = store.readConversationSession(SESSION_ID);
      expect(result?.tentacleId).toBe(SESSION_ID);
    });

    it("filters out corrupted lines from events", () => {
      writeTranscript(SESSION_ID, [makeStartEvent(), "invalid{{{", makeEndEvent()]);
      const result = store.readConversationSession(SESSION_ID);
      expect(result?.events).toHaveLength(2);
    });

    it("handles corrupted turns JSON gracefully", () => {
      writeTranscript(SESSION_ID, [makeStartEvent()]);
      writeTurns(SESSION_ID, "not json {{{");
      const result = store.readConversationSession(SESSION_ID);
      expect(result?.turns).toEqual([]);
    });
  });

  // ─── exportConversationSession ──────────────────────────────────────────────

  describe("exportConversationSession", () => {
    it("returns null when .claude-turns.json does not exist", () => {
      expect(store.exportConversationSession(SESSION_ID, "json")).toBeNull();
    });

    it("returns null when .claude-turns.json is corrupted", () => {
      writeTurns(SESSION_ID, "not json {{{");
      expect(store.exportConversationSession(SESSION_ID, "json")).toBeNull();
    });

    it("exports as JSON with turn count", () => {
      writeTurns(SESSION_ID, makeTurns());
      const result = store.exportConversationSession(SESSION_ID, "json");
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result as string) as Record<string, unknown>;
      expect(parsed.sessionId).toBe(SESSION_ID);
      expect(parsed.turnCount).toBe(2);
      expect(Array.isArray(parsed.turns)).toBe(true);
    });

    it("exports as markdown with User/Assistant headings", () => {
      writeTurns(SESSION_ID, makeTurns());
      const result = store.exportConversationSession(SESSION_ID, "md");
      expect(result).toContain("## User");
      expect(result).toContain("## Assistant");
      expect(result).toContain("What is 2+2?");
      expect(result).toContain("The answer is 4.");
    });

    it("exports markdown with multiple turns in order", () => {
      writeTurns(
        SESSION_ID,
        JSON.stringify([
          { role: "user", content: "First question" },
          { role: "assistant", content: "First answer" },
          { role: "user", content: "Second question" },
          { role: "assistant", content: "Second answer" },
        ]),
      );
      const result = store.exportConversationSession(SESSION_ID, "md") as string;
      const userIdx1 = result.indexOf("First question");
      const userIdx2 = result.indexOf("Second question");
      expect(userIdx1).toBeLessThan(userIdx2);
    });
  });

  // ─── deleteConversationSession ──────────────────────────────────────────────

  describe("deleteConversationSession", () => {
    it("deletes transcript and turns files", () => {
      writeTranscript(SESSION_ID, [makeStartEvent()]);
      writeTurns(SESSION_ID, makeTurns());

      store.deleteConversationSession(SESSION_ID);
      expect(store.readConversationSession(SESSION_ID)).toBeNull();
      expect(store.exportConversationSession(SESSION_ID, "json")).toBeNull();
    });

    it("is a no-op when neither file exists", () => {
      expect(() => store.deleteConversationSession("nonexistent-session")).not.toThrow();
    });

    it("deletes only the jsonl file when turns file is absent", () => {
      writeTranscript(SESSION_ID, [makeStartEvent()]);
      store.deleteConversationSession(SESSION_ID);
      expect(store.readConversationSession(SESSION_ID)).toBeNull();
    });
  });

  // ─── deleteAllConversationSessions ─────────────────────────────────────────

  describe("deleteAllConversationSessions", () => {
    it("is a no-op when transcript dir does not exist", () => {
      const noDir = createConversationStore(join(stateDir, "nowhere"));
      expect(() => noDir.deleteAllConversationSessions()).not.toThrow();
    });

    it("removes all files in the transcript dir", () => {
      writeTranscript("session-1", [makeStartEvent("session-1")]);
      writeTranscript("session-2", [makeStartEvent("session-2")]);
      writeTurns("session-1", makeTurns());

      store.deleteAllConversationSessions();
      expect(store.listConversationSessions()).toEqual([]);
    });
  });

  // ─── searchConversations ────────────────────────────────────────────────────

  describe("searchConversations", () => {
    it("returns empty array when transcript dir does not exist", () => {
      const noDir = createConversationStore(join(stateDir, "nowhere"));
      expect(noDir.searchConversations("anything")).toEqual([]);
    });

    it("returns empty array when no turns files match the query", () => {
      writeTurns(SESSION_ID, makeTurns());
      expect(store.searchConversations("zzznomatch")).toEqual([]);
    });

    it("returns matching sessions (case-insensitive)", () => {
      writeTurns(SESSION_ID, makeTurns());
      const results = store.searchConversations("ANSWER IS 4");
      expect(results).toHaveLength(1);
      expect((results[0] as Record<string, unknown>).sessionId).toBe(SESSION_ID);
    });

    it("searches across multiple sessions", () => {
      writeTurns("session-a", JSON.stringify([{ role: "user", content: "unique-phrase-alpha" }]));
      writeTurns("session-b", JSON.stringify([{ role: "user", content: "unique-phrase-beta" }]));
      expect(store.searchConversations("unique-phrase-alpha")).toHaveLength(1);
      expect(store.searchConversations("unique-phrase")).toHaveLength(2);
    });

    it("gracefully handles corrupted turns JSON in search", () => {
      writeTurns("bad-session", "not json {{{");
      expect(() => store.searchConversations("anything")).not.toThrow();
    });
  });
});
