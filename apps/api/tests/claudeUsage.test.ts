import { describe, expect, it, vi } from "vitest";

import { readClaudeUsageSnapshot } from "../src/claudeUsage";

describe("readClaudeUsageSnapshot", () => {
  it("returns unavailable when Claude credentials file does not exist", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readFileText: async () => {
        const error = new Error("missing");
        Object.assign(error, { code: "ENOENT" });
        throw error;
      },
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/claude credentials not found/i);
  });

  it("returns unavailable when OAuth token is missing", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readFileText: async () =>
        JSON.stringify({
          claudeAiOauth: {
            scopes: ["user:profile"],
          },
        }),
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/access token.*missing/i);
  });

  it("returns unavailable when required user:profile scope is missing", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readFileText: async () =>
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "oauth-token",
            scopes: ["offline_access"],
          },
        }),
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/user:profile/i);
  });

  it("maps usage windows from OAuth API", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          plan_type: "pro",
          five_hour: {
            used_percent: 14,
            reset_at: "2026-03-03T15:00:00.000Z",
          },
          seven_day: {
            used_percent: 52,
            reset_at: 1_772_539_200,
          },
          seven_day_sonnet: {
            used_percent: 33,
            reset_at: 1_772_711_999,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readFileText: async () =>
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "oauth-token",
            scopes: ["user:profile", "offline_access"],
          },
        }),
      fetchImpl: fetchMock,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: "ok",
        source: "oauth-api",
        planType: "pro",
        primaryUsedPercent: 14,
        primaryResetAt: "2026-03-03T15:00:00.000Z",
        secondaryUsedPercent: 52,
        secondaryResetAt: "2026-03-03T12:00:00.000Z",
        sonnetUsedPercent: 33,
        sonnetResetAt: "2026-03-05T11:59:59.000Z",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/api/oauth/usage");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer oauth-token",
          "anthropic-beta": "oauth-2025-04-20",
        }),
      }),
    );
  });

  it("returns unavailable on oauth unauthorized response", async () => {
    const snapshot = await readClaudeUsageSnapshot({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      readFileText: async () =>
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "oauth-token",
            scopes: ["user:profile"],
          },
        }),
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/expired|unauthorized/i);
  });
});
