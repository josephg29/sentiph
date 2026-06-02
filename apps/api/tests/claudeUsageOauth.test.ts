/**
 * Unit tests for claudeUsageOauth.ts
 *
 * Tests readOauthUsageSnapshot and readDefaultCredentialsJson via dependency
 * injection of readCredentialsJson and fetchImpl.
 */
import { describe, expect, it, vi } from "vitest";

import { readOauthUsageSnapshot } from "../src/claudeUsageOauth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = new Date("2026-03-03T12:00:00.000Z");

const validCredentials = (overrides: Record<string, unknown> = {}) => ({
  claudeAiOauth: {
    accessToken: "test-access-token",
    scopes: ["user:profile", "offline_access"],
    ...overrides,
  },
});

const makeResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const okUsageBody = {
  plan_type: "Claude Pro",
  five_hour: { used_percent: 25, reset_at: "2026-03-03T15:00:00.000Z" },
  seven_day: { used_percent: 60, reset_at: 1_772_539_200 },
  seven_day_sonnet: { used_percent: 10, reset_at: 1_772_711_999 },
};

// ---------------------------------------------------------------------------
// readOauthUsageSnapshot — credential reading
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot – credential errors", () => {
  it("returns unavailable with login hint when credentials file is not found (ENOENT)", async () => {
    const readCredentialsJson = async () => {
      const err = new Error("ENOENT: no such file");
      Object.assign(err, { code: "ENOENT" });
      throw err;
    };

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/credentials not found/i);
    expect(snapshot.source).toBe("none");
  });

  it("returns error when credentials file throws a non-ENOENT error", async () => {
    const readCredentialsJson = async () => {
      throw new Error("disk read failure");
    };

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to read/i);
  });

  it("returns unavailable when credentials json has no claudeAiOauth field", async () => {
    const readCredentialsJson = async () => ({ unrelated: true });

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/access token.*missing|missing.*access token/i);
  });

  it("returns unavailable when claudeAiOauth has no accessToken", async () => {
    const readCredentialsJson = async () => ({
      claudeAiOauth: { scopes: ["user:profile"] },
    });

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/access token.*missing|missing.*access token/i);
  });

  it("recognises snake_case field names (claude_ai_oauth / access_token / scope)", async () => {
    // Supports both camelCase and snake_case for credentials
    const readCredentialsJson = async () => ({
      claude_ai_oauth: { access_token: "snake-token", scope: "user:profile offline_access" },
    });

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeResponse(okUsageBody));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    // Successfully recognised snake_case format and reached the API
    expect(snapshot.status).toBe("ok");
    const [, opts] = fetchImpl.mock.calls[0] ?? [];
    expect((opts?.headers as Record<string, string>)?.Authorization).toBe("Bearer snake-token");
  });

  it("returns unavailable when user:profile scope is absent", async () => {
    const readCredentialsJson = async () => validCredentials({ scopes: ["offline_access"] });

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/user:profile/i);
  });

  it("accepts scopes as a space-separated string rather than an array", async () => {
    const readCredentialsJson = async () => ({
      claudeAiOauth: {
        accessToken: "test-token",
        scopes: "user:profile offline_access",
      },
    });

    // Will hit the fetch path — mock it to return 200
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeResponse(okUsageBody));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// readOauthUsageSnapshot — HTTP response handling
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot – HTTP responses", () => {
  it("returns ok snapshot on successful 200 response", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeResponse(okUsageBody));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("oauth-api");
    expect(snapshot.planType).toBe("Claude Pro");
    expect(snapshot.primaryUsedPercent).toBe(25);
    expect(snapshot.primaryResetAt).toBe("2026-03-03T15:00:00.000Z");
    expect(snapshot.secondaryUsedPercent).toBe(60);
    expect(snapshot.sonnetUsedPercent).toBe(10);
    expect(snapshot.fetchedAt).toBe(NOW.toISOString());
  });

  it("includes correct Authorization and beta headers", async () => {
    const readCredentialsJson = async () => validCredentials({ accessToken: "my-secret-token" });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeResponse(okUsageBody));

    await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    const [url, opts] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/api/oauth/usage");
    expect((opts?.headers as Record<string, string>)?.Authorization).toBe("Bearer my-secret-token");
    expect((opts?.headers as Record<string, string>)?.["anthropic-beta"]).toBe("oauth-2025-04-20");
  });

  it("returns unavailable on 401 Unauthorized", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/expired|unauthorized/i);
  });

  it("returns unavailable on 403 Forbidden", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/expired|unauthorized/i);
  });

  it("returns unavailable on 429 with rate limit message from JSON body", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse({ error: { message: "Too many requests." } }, 429));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/too many requests|rate limit/i);
  });

  it("returns unavailable on 429 with retry-after header included in message", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Rate limited." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/30s|rate limit/i);
  });

  it("returns error with HTTP status code on non-200 non-401/403/429 failure", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Internal Error", { status: 500 }));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/500/);
  });

  it("includes error message from JSON body in error response", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse({ message: "Service degraded." }, 503));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/service degraded/i);
  });

  it("returns error when fetch itself throws (network failure)", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network unreachable"));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to read/i);
  });

  it("returns error when usage response body is not valid JSON", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }),
      );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    // The module tries JSON.parse on text/plain — catches and returns error
    expect(snapshot.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// readOauthUsageSnapshot — usage payload field mapping
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot – usage payload mapping", () => {
  it("resolves usage windows from nested rate_limits object", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        rate_limits: {
          five_hour: { used_percent: 30, reset_at: "2026-03-03T15:00:00.000Z" },
          seven_day: { used_percent: 70 },
        },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBe(30);
    expect(snapshot.secondaryUsedPercent).toBe(70);
  });

  it("resolves seven_day_opus as secondary window fallback", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { used_percent: 10 },
        seven_day_opus: { used_percent: 80 },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.secondaryUsedPercent).toBe(80);
  });

  it("resolves usedPercent camelCase field as primary used percent", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { usedPercent: 45, resetAt: "2026-03-03T15:00:00.000Z" },
        seven_day: { usedPercent: 20 },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBe(45);
    expect(snapshot.primaryResetAt).toBe("2026-03-03T15:00:00.000Z");
  });

  it("resolves utilization field as used percent when used_percent is absent", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { utilization: 55 },
        seven_day: { utilization: 90 },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBe(55);
    expect(snapshot.secondaryUsedPercent).toBe(90);
  });

  it("resets_at camelCase variant is accepted as reset time", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { used_percent: 10, resets_at: "2026-03-03T20:00:00.000Z" },
        seven_day: {},
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.primaryResetAt).toBe("2026-03-03T20:00:00.000Z");
  });

  it("null window fields result in null snapshot fields", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: null,
        seven_day: null,
        seven_day_sonnet: null,
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBeNull();
    expect(snapshot.secondaryUsedPercent).toBeNull();
    expect(snapshot.sonnetUsedPercent).toBeNull();
  });

  it("extra_usage costs are mapped from cents to dollars when enabled", async () => {
    const readCredentialsJson = async () =>
      validCredentials({ rateLimitTier: "default_claude_max_5x" });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { used_percent: 0 },
        seven_day: { used_percent: 0 },
        extra_usage: {
          is_enabled: true,
          used_credits: 500,
          monthly_limit: 2000,
        },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.extraUsageCostUsed).toBe(5);
    expect(snapshot.extraUsageCostLimit).toBe(20);
    expect(snapshot.planType).toBe("Claude Max");
  });

  it("extra_usage camelCase fields (isEnabled/usedCredits/monthlyLimit) are also recognised", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { used_percent: 0 },
        extraUsage: {
          isEnabled: true,
          usedCredits: 1000,
          monthlyLimit: 4000,
        },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.extraUsageCostUsed).toBe(10);
    expect(snapshot.extraUsageCostLimit).toBe(40);
  });

  it("extra_usage is ignored when is_enabled is false", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        five_hour: { used_percent: 5 },
        extra_usage: {
          is_enabled: false,
          used_credits: 1000,
          monthly_limit: 4000,
        },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.extraUsageCostUsed).toBeNull();
    expect(snapshot.extraUsageCostLimit).toBeNull();
  });

  it("throws an error on invalid usage payload (non-object response JSON)", async () => {
    const readCredentialsJson = async () => validCredentials();
    // Return an array instead of object — the module should catch and return error
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    // mapUsageSnapshot throws "invalid_usage_payload" which is caught
    expect(snapshot.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// readOauthUsageSnapshot — plan type inference
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot – plan type inference", () => {
  const planTierCases: Array<[string, string]> = [
    ["default_claude_max_5x", "Claude Max"],
    ["pro_tier", "Claude Pro"],
    ["team_workspace", "Claude Team"],
    ["enterprise_plan", "Claude Enterprise"],
  ];

  it.each(planTierCases)(
    "infers plan type '%s' from rateLimitTier '%s'",
    async (tier, expectedPlan) => {
      const readCredentialsJson = async () => validCredentials({ rateLimitTier: tier });
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(makeResponse({ five_hour: { used_percent: 0 } }));

      const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

      expect(snapshot.status).toBe("ok");
      expect(snapshot.planType).toBe(expectedPlan);
    },
  );

  it("uses plan_type from response body when present (overrides rateLimitTier inference)", async () => {
    const readCredentialsJson = async () => validCredentials({ rateLimitTier: "pro_tier" });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeResponse({
        plan_type: "Custom Plan",
        five_hour: { used_percent: 0 },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.planType).toBe("Custom Plan");
  });

  it("planType is null when neither plan_type nor matching rateLimitTier are present", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeResponse({ five_hour: { used_percent: 0 } }));

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.planType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readOauthUsageSnapshot — 429 body: plain text error message
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot – 429 plain text body", () => {
  it("uses plain text body as error message when content-type is not JSON", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("You are being rate limited.", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/rate limited/i);
  });

  it("falls back to generic rate limit message when body is empty", async () => {
    const readCredentialsJson = async () => validCredentials();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Content-Type": "text/plain" } }),
      );

    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/rate limit/i);
  });
});
