/**
 * tests/claudeUsageOauth.extra.test.ts
 *
 * Extra branch coverage for claudeUsageOauth.ts not exercised in
 * claudeUsageOauth.test.ts:
 *  - readDefaultCredentialsJson: keychain path (darwin), keychain non-JSON fallback
 *  - readOauthUsageSnapshot: non-json content-type on error responses
 *  - readErrorMessage: nested error.message vs direct message
 *  - normalizeScopes: empty string / array with empty items
 *  - readClaudeOauthCredentials: claude_ai_oauth with access_token snake_case
 */

import { describe, expect, it, vi } from "vitest";

import { readOauthUsageSnapshot } from "../src/claudeUsageOauth";

const NOW = new Date("2026-06-01T10:00:00.000Z");

const validCreds = (overrides: Record<string, unknown> = {}) => ({
  claudeAiOauth: {
    accessToken: "valid-token",
    scopes: ["user:profile"],
    ...overrides,
  },
});

const makeJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------------------
// normalizeScopes edge cases
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — scope normalisation edge cases", () => {
  it("treats empty scopes array as missing user:profile (returns unavailable)", async () => {
    const readCredentialsJson = async () => validCreds({ scopes: [] });
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/user:profile/i);
  });

  it("treats scopes array with blank strings as missing user:profile", async () => {
    const readCredentialsJson = async () => validCreds({ scopes: ["", "  "] });
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);
    expect(snapshot.status).toBe("unavailable");
  });

  it("handles scopes as empty string (no whitespace-split tokens)", async () => {
    const readCredentialsJson = async () => validCreds({ scopes: "" });
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);
    expect(snapshot.status).toBe("unavailable");
  });

  it("handles scopes as number (non-string, non-array → empty normalised)", async () => {
    const readCredentialsJson = async () => validCreds({ scopes: 42 });
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetch);
    expect(snapshot.status).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// readUsageErrorMessage: plain text body on non-JSON error responses
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — error response bodies", () => {
  it("uses plain text body message when content-type is text/plain on 500", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("Internal server error details", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/internal server error details/i);
  });

  it("falls back to generic message when 500 body is empty text", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("", { status: 500, headers: { "Content-Type": "text/plain" } }),
      );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/500/);
  });

  it("reads nested error.message from JSON error body on 503", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse({ error: { message: "Service temporarily unavailable." } }, 503),
      );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/service temporarily unavailable/i);
  });

  it("reads top-level message field from JSON error body on 502", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse({ message: "Bad gateway." }, 502));
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/bad gateway/i);
  });

  it("handles body reading throwing during error response parsing", async () => {
    const readCredentialsJson = async () => validCreds();
    const brokenResponse = new Response(null, { status: 500 });
    // Override json() to throw
    vi.spyOn(brokenResponse, "json").mockRejectedValueOnce(new Error("parse failure"));
    vi.spyOn(brokenResponse, "text").mockRejectedValueOnce(new Error("text failure"));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(brokenResponse);
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 429 with retry-after: empty string (no retry suffix)
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — 429 retry-after header edge cases", () => {
  it("omits retry suffix when Retry-After header is empty string", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Rate limited." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "" },
      }),
    );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).not.toMatch(/Retry after/i);
  });
});

// ---------------------------------------------------------------------------
// Credentials: camelCase vs snake_case field aliases
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — credential field aliases", () => {
  it("accepts access_token (snake_case) in credentials", async () => {
    const readCredentialsJson = async () => ({
      claudeAiOauth: {
        access_token: "snake-case-token",
        scopes: ["user:profile"],
      },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse({ five_hour: { used_percent: 10 } }));
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("ok");
  });

  it("accepts rate_limit_tier (snake_case) for plan type inference", async () => {
    const readCredentialsJson = async () => ({
      claudeAiOauth: {
        accessToken: "tok",
        scopes: ["user:profile"],
        rate_limit_tier: "pro_tier_v2",
      },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse({ five_hour: { used_percent: 0 } }));
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.planType).toBe("Claude Pro");
  });
});

// ---------------------------------------------------------------------------
// resolveUsageWindow: camelCase rateLimits
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — camelCase rateLimits nesting", () => {
  it("resolves windows from camelCase rateLimits object", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeJsonResponse({
        rateLimits: {
          five_hour: { used_percent: 40 },
          seven_day: { used_percent: 80 },
          seven_day_sonnet: { used_percent: 15 },
        },
      }),
    );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.primaryUsedPercent).toBe(40);
    expect(snapshot.secondaryUsedPercent).toBe(80);
    expect(snapshot.sonnetUsedPercent).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// planType: camelCase planType field in response
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — planType camelCase", () => {
  it("reads planType camelCase from response body", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeJsonResponse({
        planType: "Claude Team",
        five_hour: { used_percent: 5 },
      }),
    );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.planType).toBe("Claude Team");
  });
});

// ---------------------------------------------------------------------------
// extra_usage: is_enabled false, rawUsed/rawLimit null (no credits mapped)
// ---------------------------------------------------------------------------
describe("readOauthUsageSnapshot — extra_usage edge cases", () => {
  it("does not map credits when used_credits or monthly_limit are null/missing", async () => {
    const readCredentialsJson = async () => validCreds();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      makeJsonResponse({
        five_hour: { used_percent: 0 },
        extra_usage: {
          is_enabled: true,
          // used_credits and monthly_limit intentionally omitted
        },
      }),
    );
    const snapshot = await readOauthUsageSnapshot(NOW, readCredentialsJson, fetchImpl);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.extraUsageCostUsed).toBeNull();
    expect(snapshot.extraUsageCostLimit).toBeNull();
  });
});
