import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimits } from "../src/createApiServer/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterEach(() => {
    resetRateLimits();
  });

  it("allows requests up to the default create limit (120/min) then rejects", () => {
    const client = "10.0.0.1";
    const now = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 120; i++) {
      if (checkRateLimit("create", client, now)) allowed += 1;
    }
    expect(allowed).toBe(120);
    // The 121st request within the same window is rejected.
    expect(checkRateLimit("create", client, now)).toBe(false);
  });

  it("starts a fresh window after the create window elapses", () => {
    const client = "10.0.0.2";
    for (let i = 0; i < 120; i++) checkRateLimit("create", client, 0);
    expect(checkRateLimit("create", client, 0)).toBe(false);
    // 60s later the window resets.
    expect(checkRateLimit("create", client, 60_000)).toBe(true);
  });

  it("tracks buckets independently per client", () => {
    for (let i = 0; i < 120; i++) checkRateLimit("create", "client-a", 0);
    expect(checkRateLimit("create", "client-a", 0)).toBe(false);
    // A different client has its own fresh budget.
    expect(checkRateLimit("create", "client-b", 0)).toBe(true);
  });

  it("tracks the input bucket separately from the create bucket", () => {
    for (let i = 0; i < 120; i++) checkRateLimit("create", "c", 0);
    expect(checkRateLimit("create", "c", 0)).toBe(false);
    // Input bucket (600/10s) is unaffected by create-bucket exhaustion.
    expect(checkRateLimit("input", "c", 0)).toBe(true);
  });

  it("allows up to the default input limit (600 per 10s) then rejects", () => {
    const client = "10.0.0.3";
    let allowed = 0;
    for (let i = 0; i < 600; i++) {
      if (checkRateLimit("input", client, 5_000)) allowed += 1;
    }
    expect(allowed).toBe(600);
    expect(checkRateLimit("input", client, 5_000)).toBe(false);
  });

  it("collapses missing clients to a shared global bucket", () => {
    for (let i = 0; i < 120; i++) checkRateLimit("create", undefined, 0);
    expect(checkRateLimit("create", undefined, 0)).toBe(false);
    expect(checkRateLimit("create", "", 0)).toBe(false);
  });

  it("respects env overrides for the create limit", () => {
    const previous = process.env.SENTIPH_RATELIMIT_CREATE_PER_MIN;
    process.env.SENTIPH_RATELIMIT_CREATE_PER_MIN = "2";
    try {
      const client = "env-client";
      expect(checkRateLimit("create", client, 0)).toBe(true);
      expect(checkRateLimit("create", client, 0)).toBe(true);
      expect(checkRateLimit("create", client, 0)).toBe(false);
    } finally {
      if (previous === undefined) {
        // biome-ignore lint/performance/noDelete: restoring original env requires removing the key, not setting it to "undefined".
        delete process.env.SENTIPH_RATELIMIT_CREATE_PER_MIN;
      } else {
        process.env.SENTIPH_RATELIMIT_CREATE_PER_MIN = previous;
      }
    }
  });
});
