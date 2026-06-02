/**
 * Supplementary tests for codexUsage.ts — covers branches not exercised
 * by the existing codexUsage.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

import { readCodexUsageSnapshot } from "../src/codexUsage";

const NOW = () => new Date("2026-02-25T12:00:00.000Z");
const CODEX_HOME = "/fake/.codex";

const makeAuthJson = (overrides: Record<string, unknown> = {}) => ({
  tokens: {
    access_token: "valid-token",
    refresh_token: "valid-refresh",
    account_id: "acc-123",
  },
  last_refresh: "2026-02-24T00:00:00.000Z", // recent — no refresh needed
  ...overrides,
});

const makeUsageResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      plan_type: "pro",
      rate_limit: {
        primary_window: { used_percent: 10, reset_at: 1_766_948_068 },
        secondary_window: { used_percent: 20, reset_at: 1_767_407_914 },
      },
      credits: { has_credits: true, unlimited: true, balance: "999.99" },
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

// ---------------------------------------------------------------------------
// Error reading auth.json
// ---------------------------------------------------------------------------
describe("readCodexUsageSnapshot – auth file errors", () => {
  it("returns error when auth file read fails with non-ENOENT error", async () => {
    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => {
        throw new Error("permission denied");
      },
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to read codex auth/i);
  });

  it("returns error when auth.json content is not valid JSON", async () => {
    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => "{ broken json",
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/not valid json/i);
  });

  it("returns unavailable when auth.json has no recognised credential fields", async () => {
    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify({ unrelated: "data" }),
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/missing oauth credentials/i);
  });
});

// ---------------------------------------------------------------------------
// Credential loading variants
// ---------------------------------------------------------------------------
describe("readCodexUsageSnapshot – credential formats", () => {
  it("accepts OPENAI_API_KEY directly in auth.json", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify({ OPENAI_API_KEY: "sk-proj-abc123" }),
      fetchImpl,
    });

    expect(snapshot.status).toBe("ok");
    const [, opts] = fetchImpl.mock.calls[0] ?? [];
    // Authorization header should use the API key
    // The module builds a Headers instance, so access via Headers.get()
    const headers = opts?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer sk-proj-abc123");
  });

  it("uses CODEX_HOME env var to resolve auth path", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());
    let capturedPath = "";

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME: "/custom/codex" },
      readFileText: async (path: string) => {
        capturedPath = path;
        return JSON.stringify(makeAuthJson());
      },
      fetchImpl,
    });

    expect(capturedPath).toContain("/custom/codex");
    expect(snapshot.status).toBe("ok");
  });

  it("falls back to ~/.codex when CODEX_HOME is not set", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());
    let capturedPath = "";

    await readCodexUsageSnapshot({
      now: NOW,
      env: {},
      readFileText: async (path: string) => {
        capturedPath = path;
        return JSON.stringify(makeAuthJson());
      },
      fetchImpl,
    });

    expect(capturedPath).toMatch(/\.codex\/auth\.json$/);
    expect(capturedPath).not.toContain("/custom/codex");
  });

  it("ignores whitespace-only access_token values", async () => {
    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "   ", refresh_token: "r" },
        }),
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/missing oauth credentials/i);
  });

  it("omits ChatGPT-Account-Id header when accountId is null", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());

    await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "tok", refresh_token: null },
          last_refresh: new Date().toISOString(),
        }),
      fetchImpl,
    });

    const [url, opts] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://chatgpt.com/backend-api/wham/usage");
    // The module only sets ChatGPT-Account-Id when accountId is non-null
    // We verify it's absent by checking the Headers object
    const headers = opts?.headers as Headers;
    expect(headers.get("ChatGPT-Account-Id")).toBeNull();
  });

  it("includes ChatGPT-Account-Id header when accountId is present", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());

    await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    const [, opts] = fetchImpl.mock.calls[0] ?? [];
    const headers = opts?.headers as Headers;
    expect(headers.get("ChatGPT-Account-Id")).toBe("acc-123");
  });
});

// ---------------------------------------------------------------------------
// Token refresh paths
// ---------------------------------------------------------------------------
describe("readCodexUsageSnapshot – token refresh", () => {
  it("skips refresh when refreshToken is null", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "tok", refresh_token: null },
          last_refresh: null,
        }),
      fetchImpl,
    });

    // Only one fetch — no refresh call
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://chatgpt.com/backend-api/wham/usage");
    expect(snapshot.status).toBe("ok");
  });

  it("skips refresh when last_refresh is recent (< 8 days)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(makeUsageResponse());

    const recentRefresh = new Date(NOW().getTime() - 24 * 60 * 60 * 1000).toISOString();
    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "tok", refresh_token: "r" },
          last_refresh: recentRefresh,
        }),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(snapshot.status).toBe("ok");
  });

  it("triggers refresh when last_refresh is absent (null → should refresh)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "new-tok", refresh_token: "new-r" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(makeUsageResponse());

    const writeFileText = vi.fn<(p: string, c: string) => Promise<void>>();

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "old-tok", refresh_token: "old-r" },
          last_refresh: null,
        }),
      writeFileText,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://auth.openai.com/oauth/token");
    expect(snapshot.status).toBe("ok");
    expect(writeFileText).toHaveBeenCalledTimes(1);
  });

  it("returns unavailable when token refresh fails (non-200 response)", async () => {
    const staleRefresh = new Date(NOW().getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "tok", refresh_token: "r" },
          last_refresh: staleRefresh,
        }),
      fetchImpl,
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to refresh.*codex oauth/i);
  });

  it("returns unavailable when refresh response has no access_token", async () => {
    const staleRefresh = new Date(NOW().getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ refresh_token: "new-r" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "tok", refresh_token: "r" },
          last_refresh: staleRefresh,
        }),
      fetchImpl,
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to refresh/i);
  });

  it("falls back to old refresh token when refresh response omits refresh_token", async () => {
    const staleRefresh = new Date(NOW().getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        // Token refresh — no refresh_token in response → use old one
        new Response(JSON.stringify({ access_token: "new-access" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(makeUsageResponse());

    const writeFileText = vi.fn<(p: string, c: string) => Promise<void>>();

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () =>
        JSON.stringify({
          tokens: { access_token: "old-access", refresh_token: "keep-me" },
          last_refresh: staleRefresh,
        }),
      writeFileText,
      fetchImpl,
    });

    expect(snapshot.status).toBe("ok");
    const written = writeFileText.mock.calls[0]?.[1] ?? "";
    expect(written).toContain("keep-me");
    expect(written).toContain("new-access");
  });
});

// ---------------------------------------------------------------------------
// Usage API response paths
// ---------------------------------------------------------------------------
describe("readCodexUsageSnapshot – usage API responses", () => {
  it("returns unavailable on 401 from usage API", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/expired|codex login/i);
  });

  it("returns unavailable on 403 from usage API", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/expired|codex login/i);
  });

  it("returns error on non-ok status from usage API", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Server Error", { status: 503 }));

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/503/);
  });

  it("returns error when fetch throws (network error)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network unreachable"));

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to reach/i);
  });

  it("maps credits.unlimited=false correctly", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          plan_type: "free",
          rate_limit: {
            primary_window: { used_percent: 5 },
          },
          credits: { unlimited: false, balance: "0" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.creditsUnlimited).toBe(false);
    expect(snapshot.creditsBalance).toBe(0);
  });

  it("sets creditsUnlimited to null when credits field is absent", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ plan_type: "pro", rate_limit: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const snapshot = await readCodexUsageSnapshot({
      now: NOW,
      env: { CODEX_HOME },
      readFileText: async () => JSON.stringify(makeAuthJson()),
      fetchImpl,
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.creditsUnlimited).toBeNull();
    expect(snapshot.creditsBalance).toBeNull();
  });
});
