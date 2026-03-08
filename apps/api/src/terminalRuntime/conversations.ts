import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { CodexRuntimeState } from "../codexStateDetection";

const ESCAPE_CODE = 27;
const BEL_CODE = 7;
const CSI_MARKER = 91;
const OSC_MARKER = 93;
const ST_MARKER = 92;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const parseRuntimeState = (value: unknown): CodexRuntimeState | null =>
  value === "idle" || value === "processing" ? value : null;

export type ConversationTranscriptEventBase = {
  eventId: string;
  sessionId: string;
  tentacleId: string;
  timestamp: string;
};

export type SessionStartTranscriptEvent = ConversationTranscriptEventBase & {
  type: "session_start";
};

export type InputSubmitTranscriptEvent = ConversationTranscriptEventBase & {
  type: "input_submit";
  submitId: string;
  text: string;
};

export type OutputChunkTranscriptEvent = ConversationTranscriptEventBase & {
  type: "output_chunk";
  chunkId: string;
  text: string;
};

export type StateChangeTranscriptEvent = ConversationTranscriptEventBase & {
  type: "state_change";
  state: CodexRuntimeState;
};

export type SessionEndTranscriptEvent = ConversationTranscriptEventBase & {
  type: "session_end";
  reason: "pty_exit" | "session_close";
  exitCode?: number;
  signal?: number;
};

export type ConversationTranscriptEvent =
  | SessionStartTranscriptEvent
  | InputSubmitTranscriptEvent
  | OutputChunkTranscriptEvent
  | StateChangeTranscriptEvent
  | SessionEndTranscriptEvent;

export type ConversationTranscriptEventPayload =
  | Omit<SessionStartTranscriptEvent, "eventId" | "sessionId" | "tentacleId">
  | Omit<InputSubmitTranscriptEvent, "eventId" | "sessionId" | "tentacleId">
  | Omit<OutputChunkTranscriptEvent, "eventId" | "sessionId" | "tentacleId">
  | Omit<StateChangeTranscriptEvent, "eventId" | "sessionId" | "tentacleId">
  | Omit<SessionEndTranscriptEvent, "eventId" | "sessionId" | "tentacleId">;

export type ConversationTurn = {
  turnId: string;
  role: "user" | "assistant";
  content: string;
  startedAt: string;
  endedAt: string;
};

export type ConversationSessionSummary = {
  sessionId: string;
  tentacleId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
  turnCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  lastUserTurnPreview: string | null;
  lastAssistantTurnPreview: string | null;
};

export type ConversationSessionDetail = ConversationSessionSummary & {
  turns: ConversationTurn[];
  events: ConversationTranscriptEvent[];
};

type ActiveAssistantTurn = {
  content: string;
  startedAt: string;
  endedAt: string;
};

const stripAnsiAndControlSequences = (value: string) => {
  let cleaned = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code !== ESCAPE_CODE) {
      cleaned += value[index] ?? "";
      continue;
    }

    const marker = value.charCodeAt(index + 1);
    if (marker === CSI_MARKER) {
      index += 2;
      while (index < value.length) {
        const csiCode = value.charCodeAt(index);
        if (csiCode >= 64 && csiCode <= 126) {
          break;
        }
        index += 1;
      }
      continue;
    }

    if (marker === OSC_MARKER) {
      index += 2;
      while (index < value.length) {
        const oscCode = value.charCodeAt(index);
        if (oscCode === BEL_CODE) {
          break;
        }
        if (oscCode === ESCAPE_CODE && value.charCodeAt(index + 1) === ST_MARKER) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    index += 1;
  }

  return cleaned;
};

const stripLineEditingControls = (value: string) => {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index] ?? "";
    const code = current.charCodeAt(0);
    if (code === 8 || code === 127) {
      result = result.slice(0, -1);
      continue;
    }

    if (code < 32 && code !== 9) {
      continue;
    }

    result += current;
  }

  return result;
};

export const normalizeTranscriptOutputChunk = (chunk: string): string =>
  stripAnsiAndControlSequences(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const normalizeInputSubmitText = (raw: string): string =>
  stripLineEditingControls(stripAnsiAndControlSequences(raw)).trim();

export const extractInputSubmitTexts = (
  pendingInput: string,
  inputChunk: string,
): {
  nextPendingInput: string;
  submittedTexts: string[];
} => {
  const combined = `${pendingInput}${inputChunk}`;
  if (combined.length === 0) {
    return {
      nextPendingInput: "",
      submittedTexts: [],
    };
  }

  const rawSubmittedLines: string[] = [];
  let segmentStart = 0;

  for (let index = 0; index < combined.length; index += 1) {
    const char = combined[index];
    if (char !== "\r" && char !== "\n") {
      continue;
    }

    rawSubmittedLines.push(combined.slice(segmentStart, index));
    if (char === "\r" && combined[index + 1] === "\n") {
      index += 1;
    }
    segmentStart = index + 1;
  }

  const submittedTexts = rawSubmittedLines
    .map((line) => normalizeInputSubmitText(line))
    .filter((line) => line.length > 0);

  return {
    nextPendingInput: combined.slice(segmentStart),
    submittedTexts,
  };
};

export const transcriptFilenameForSession = (sessionId: string) =>
  `${encodeURIComponent(sessionId)}.jsonl`;

const parseTranscriptEvent = (value: unknown): ConversationTranscriptEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  const eventType = asString(value.type);
  const eventId = asString(value.eventId);
  const sessionId = asString(value.sessionId);
  const tentacleId = asString(value.tentacleId);
  const timestamp = asString(value.timestamp);

  if (!eventType || !eventId || !sessionId || !tentacleId || !timestamp) {
    return null;
  }

  if (eventType === "session_start") {
    return {
      type: "session_start",
      eventId,
      sessionId,
      tentacleId,
      timestamp,
    };
  }

  if (eventType === "input_submit") {
    const submitId = asString(value.submitId);
    const text = asString(value.text);
    if (!submitId || text === null) {
      return null;
    }

    return {
      type: "input_submit",
      eventId,
      sessionId,
      tentacleId,
      timestamp,
      submitId,
      text,
    };
  }

  if (eventType === "output_chunk") {
    const chunkId = asString(value.chunkId);
    const text = asString(value.text);
    if (!chunkId || text === null) {
      return null;
    }

    return {
      type: "output_chunk",
      eventId,
      sessionId,
      tentacleId,
      timestamp,
      chunkId,
      text,
    };
  }

  if (eventType === "state_change") {
    const state = parseRuntimeState(value.state);
    if (!state) {
      return null;
    }

    return {
      type: "state_change",
      eventId,
      sessionId,
      tentacleId,
      timestamp,
      state,
    };
  }

  if (eventType === "session_end") {
    const reason = value.reason;
    if (reason !== "pty_exit" && reason !== "session_close") {
      return null;
    }

    const exitCode = typeof value.exitCode === "number" ? value.exitCode : undefined;
    const signal = typeof value.signal === "number" ? value.signal : undefined;

    return {
      type: "session_end",
      eventId,
      sessionId,
      tentacleId,
      timestamp,
      reason,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(signal !== undefined ? { signal } : {}),
    };
  }

  return null;
};

const createAssistantTurn = (timestamp: string): ActiveAssistantTurn => ({
  content: "",
  startedAt: timestamp,
  endedAt: timestamp,
});

const pushTurn = (
  turns: ConversationTurn[],
  turn: Omit<ConversationTurn, "turnId">,
): ConversationTurn[] => {
  const turnId = `turn-${turns.length + 1}`;
  turns.push({
    turnId,
    ...turn,
  });
  return turns;
};

const finalizeAssistantTurn = (
  turns: ConversationTurn[],
  activeAssistantTurn: ActiveAssistantTurn | null,
  timestamp: string,
): ActiveAssistantTurn | null => {
  if (!activeAssistantTurn) {
    return null;
  }

  const content = activeAssistantTurn.content.trim();
  if (content.length > 0) {
    pushTurn(turns, {
      role: "assistant",
      content,
      startedAt: activeAssistantTurn.startedAt,
      endedAt: timestamp,
    });
  }

  return null;
};

export const assembleConversationTurns = (
  events: ConversationTranscriptEvent[],
): ConversationTurn[] => {
  const turns: ConversationTurn[] = [];
  let activeAssistantTurn: ActiveAssistantTurn | null = null;

  for (const event of events) {
    if (event.type === "input_submit") {
      activeAssistantTurn = finalizeAssistantTurn(turns, activeAssistantTurn, event.timestamp);
      const content = event.text.trim();
      if (content.length > 0) {
        pushTurn(turns, {
          role: "user",
          content,
          startedAt: event.timestamp,
          endedAt: event.timestamp,
        });
      }
      continue;
    }

    if (event.type === "state_change") {
      if (event.state === "processing") {
        if (!activeAssistantTurn) {
          activeAssistantTurn = createAssistantTurn(event.timestamp);
        }
        activeAssistantTurn.endedAt = event.timestamp;
      } else {
        activeAssistantTurn = finalizeAssistantTurn(turns, activeAssistantTurn, event.timestamp);
      }
      continue;
    }

    if (event.type === "output_chunk") {
      if (!activeAssistantTurn) {
        activeAssistantTurn = createAssistantTurn(event.timestamp);
      }
      activeAssistantTurn.content += event.text;
      activeAssistantTurn.endedAt = event.timestamp;
      continue;
    }

    if (event.type === "session_end") {
      activeAssistantTurn = finalizeAssistantTurn(turns, activeAssistantTurn, event.timestamp);
    }
  }

  if (activeAssistantTurn) {
    finalizeAssistantTurn(turns, activeAssistantTurn, activeAssistantTurn.endedAt);
  }

  return turns;
};

const buildConversationSummary = (
  sessionId: string,
  events: ConversationTranscriptEvent[],
  turns: ConversationTurn[],
): ConversationSessionSummary => {
  const userTurns = turns.filter((turn) => turn.role === "user");
  const assistantTurns = turns.filter((turn) => turn.role === "assistant");
  const firstEvent = events[0] ?? null;
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastSessionEnd =
    [...events].reverse().find((event) => event.type === "session_end") ?? null;

  return {
    sessionId,
    tentacleId: firstEvent?.tentacleId ?? null,
    startedAt: firstEvent?.timestamp ?? null,
    endedAt: lastSessionEnd?.timestamp ?? null,
    lastEventAt: lastEvent?.timestamp ?? null,
    eventCount: events.length,
    turnCount: turns.length,
    userTurnCount: userTurns.length,
    assistantTurnCount: assistantTurns.length,
    lastUserTurnPreview:
      userTurns.length > 0 ? (userTurns[userTurns.length - 1]?.content ?? null) : null,
    lastAssistantTurnPreview:
      assistantTurns.length > 0
        ? (assistantTurns[assistantTurns.length - 1]?.content ?? null)
        : null,
  };
};

const parseTranscriptLines = (rawJsonl: string): ConversationTranscriptEvent[] => {
  const events: ConversationTranscriptEvent[] = [];
  const lines = rawJsonl.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const event = parseTranscriptEvent(parsed);
      if (event) {
        events.push(event);
      }
    } catch {
      // Ignore malformed lines to keep transcript parsing resilient.
    }
  }

  return events;
};

const readSessionEventsFromFile = (
  transcriptDirectoryPath: string,
  sessionId: string,
): ConversationTranscriptEvent[] => {
  const transcriptPath = join(transcriptDirectoryPath, transcriptFilenameForSession(sessionId));
  if (!existsSync(transcriptPath)) {
    return [];
  }

  const rawJsonl = readFileSync(transcriptPath, "utf8");
  return parseTranscriptLines(rawJsonl);
};

const parseSessionIdFromFilename = (filename: string): string | null => {
  if (!filename.endsWith(".jsonl")) {
    return null;
  }

  const basename = filename.slice(0, -".jsonl".length);
  if (basename.length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(basename);
  } catch {
    return null;
  }
};

const truncatePreview = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
};

export const readConversationSession = (
  transcriptDirectoryPath: string,
  sessionId: string,
): ConversationSessionDetail | null => {
  const events = readSessionEventsFromFile(transcriptDirectoryPath, sessionId);
  if (events.length === 0) {
    return null;
  }

  const turns = assembleConversationTurns(events);
  const summary = buildConversationSummary(sessionId, events, turns);

  return {
    ...summary,
    lastUserTurnPreview: truncatePreview(summary.lastUserTurnPreview),
    lastAssistantTurnPreview: truncatePreview(summary.lastAssistantTurnPreview),
    turns,
    events,
  };
};

export const listConversationSessions = (
  transcriptDirectoryPath: string,
): ConversationSessionSummary[] => {
  if (!existsSync(transcriptDirectoryPath)) {
    return [];
  }

  const sessionIds = readdirSync(transcriptDirectoryPath)
    .map((filename) => parseSessionIdFromFilename(filename))
    .filter((sessionId): sessionId is string => sessionId !== null);

  const summaries = sessionIds
    .map((sessionId) => {
      const detail = readConversationSession(transcriptDirectoryPath, sessionId);
      if (!detail) {
        return null;
      }

      return {
        sessionId: detail.sessionId,
        tentacleId: detail.tentacleId,
        startedAt: detail.startedAt,
        endedAt: detail.endedAt,
        lastEventAt: detail.lastEventAt,
        eventCount: detail.eventCount,
        turnCount: detail.turnCount,
        userTurnCount: detail.userTurnCount,
        assistantTurnCount: detail.assistantTurnCount,
        lastUserTurnPreview: detail.lastUserTurnPreview,
        lastAssistantTurnPreview: detail.lastAssistantTurnPreview,
      };
    })
    .filter((summary): summary is ConversationSessionSummary => summary !== null)
    .map((summary) => ({
      ...summary,
      lastUserTurnPreview: truncatePreview(summary.lastUserTurnPreview),
      lastAssistantTurnPreview: truncatePreview(summary.lastAssistantTurnPreview),
    }));

  return summaries.sort((left, right) => {
    const leftTime = left.lastEventAt ? Date.parse(left.lastEventAt) : 0;
    const rightTime = right.lastEventAt ? Date.parse(right.lastEventAt) : 0;
    return rightTime - leftTime;
  });
};

export const ensureTranscriptDirectory = (transcriptDirectoryPath: string) => {
  mkdirSync(transcriptDirectoryPath, { recursive: true });
};

export const conversationExportMarkdown = (conversation: ConversationSessionDetail): string => {
  const lines: string[] = [
    `# Conversation ${conversation.sessionId}`,
    "",
    `- Tentacle: ${conversation.tentacleId ?? "unknown"}`,
    `- Started: ${conversation.startedAt ?? "unknown"}`,
    `- Ended: ${conversation.endedAt ?? "active"}`,
    `- Turns: ${conversation.turnCount}`,
    "",
  ];

  for (const turn of conversation.turns) {
    const roleLabel = turn.role === "user" ? "User" : "Assistant";
    lines.push(`## ${roleLabel} (${turn.startedAt})`);
    lines.push("");
    lines.push(turn.content.length > 0 ? turn.content : "(empty)");
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
};
