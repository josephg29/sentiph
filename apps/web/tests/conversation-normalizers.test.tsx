import { describe, expect, it } from "vitest";

import { normalizeConversationSessionSummary } from "../src/app/conversationNormalizers";

describe("normalizeConversationSessionSummary", () => {
  it("returns null without a sessionId", () => {
    expect(normalizeConversationSessionSummary(null)).toBeNull();
    expect(normalizeConversationSessionSummary({})).toBeNull();
    expect(normalizeConversationSessionSummary({ tentacleId: "x" })).toBeNull();
  });

  it("coerces counts to non-negative integers and preserves previews", () => {
    const result = normalizeConversationSessionSummary({
      sessionId: "s1",
      tentacleId: "te1",
      startedAt: "2026-01-01T00:00:00.000Z",
      eventCount: 3.9,
      turnCount: -2,
      userTurnCount: 5,
      firstUserTurnPreview: "hello",
    });

    expect(result?.sessionId).toBe("s1");
    expect(result?.tentacleId).toBe("te1");
    expect(result?.eventCount).toBe(3);
    expect(result?.turnCount).toBe(0);
    expect(result?.userTurnCount).toBe(5);
    expect(result?.firstUserTurnPreview).toBe("hello");
    expect(result?.endedAt).toBeNull();
  });
});
