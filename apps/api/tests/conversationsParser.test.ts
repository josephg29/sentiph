import { describe, expect, it } from "vitest";

import {
  type ConversationTranscriptEvent,
  type ConversationTranscriptEventPayload,
  assembleConversationTurns,
} from "../src/terminalRuntime/conversations";

const baseEvent = (
  event: ConversationTranscriptEventPayload,
  index: number,
): ConversationTranscriptEvent => ({
  ...event,
  sessionId: "tentacle-1-root",
  tentacleId: "tentacle-1",
  eventId: `tentacle-1-root:${index}`,
});

describe("assembleConversationTurns", () => {
  it("merges assistant output chunks until processing transitions to idle", () => {
    const events: ConversationTranscriptEvent[] = [
      baseEvent(
        {
          type: "session_start",
          timestamp: "2026-03-05T10:00:00.000Z",
        },
        0,
      ),
      baseEvent(
        {
          type: "state_change",
          state: "processing",
          timestamp: "2026-03-05T10:00:01.000Z",
        },
        1,
      ),
      baseEvent(
        {
          type: "output_chunk",
          chunkId: "chunk-1",
          text: "Hello",
          timestamp: "2026-03-05T10:00:02.000Z",
        },
        2,
      ),
      baseEvent(
        {
          type: "output_chunk",
          chunkId: "chunk-2",
          text: " world",
          timestamp: "2026-03-05T10:00:03.000Z",
        },
        3,
      ),
      baseEvent(
        {
          type: "state_change",
          state: "idle",
          timestamp: "2026-03-05T10:00:04.000Z",
        },
        4,
      ),
    ];

    expect(assembleConversationTurns(events)).toEqual([
      {
        turnId: "turn-1",
        role: "assistant",
        content: "Hello world",
        startedAt: "2026-03-05T10:00:01.000Z",
        endedAt: "2026-03-05T10:00:04.000Z",
      },
    ]);
  });

  it("creates user turns from input_submit and finalizes assistant on session_end", () => {
    const events: ConversationTranscriptEvent[] = [
      baseEvent(
        {
          type: "input_submit",
          submitId: "submit-1",
          text: "write tests",
          timestamp: "2026-03-05T10:00:01.000Z",
        },
        0,
      ),
      baseEvent(
        {
          type: "state_change",
          state: "processing",
          timestamp: "2026-03-05T10:00:02.000Z",
        },
        1,
      ),
      baseEvent(
        {
          type: "output_chunk",
          chunkId: "chunk-1",
          text: "Sure, adding tests now.",
          timestamp: "2026-03-05T10:00:03.000Z",
        },
        2,
      ),
      baseEvent(
        {
          type: "session_end",
          reason: "pty_exit",
          exitCode: 0,
          signal: 0,
          timestamp: "2026-03-05T10:00:04.000Z",
        },
        3,
      ),
    ];

    expect(assembleConversationTurns(events)).toEqual([
      {
        turnId: "turn-1",
        role: "user",
        content: "write tests",
        startedAt: "2026-03-05T10:00:01.000Z",
        endedAt: "2026-03-05T10:00:01.000Z",
      },
      {
        turnId: "turn-2",
        role: "assistant",
        content: "Sure, adding tests now.",
        startedAt: "2026-03-05T10:00:02.000Z",
        endedAt: "2026-03-05T10:00:04.000Z",
      },
    ]);
  });

  it("closes the current assistant turn when a new input_submit arrives", () => {
    const events: ConversationTranscriptEvent[] = [
      baseEvent(
        {
          type: "state_change",
          state: "processing",
          timestamp: "2026-03-05T10:00:01.000Z",
        },
        0,
      ),
      baseEvent(
        {
          type: "output_chunk",
          chunkId: "chunk-1",
          text: "Thinking...",
          timestamp: "2026-03-05T10:00:02.000Z",
        },
        1,
      ),
      baseEvent(
        {
          type: "input_submit",
          submitId: "submit-1",
          text: "continue",
          timestamp: "2026-03-05T10:00:03.000Z",
        },
        2,
      ),
    ];

    expect(assembleConversationTurns(events)).toEqual([
      {
        turnId: "turn-1",
        role: "assistant",
        content: "Thinking...",
        startedAt: "2026-03-05T10:00:01.000Z",
        endedAt: "2026-03-05T10:00:03.000Z",
      },
      {
        turnId: "turn-2",
        role: "user",
        content: "continue",
        startedAt: "2026-03-05T10:00:03.000Z",
        endedAt: "2026-03-05T10:00:03.000Z",
      },
    ]);
  });
});
