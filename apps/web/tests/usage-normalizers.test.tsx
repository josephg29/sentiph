import { describe, expect, it } from "vitest";

import {
  normalizeClaudeUsageSnapshot,
  normalizeCodexUsageSnapshot,
} from "../src/app/usageNormalizers";

describe("normalizeCodexUsageSnapshot", () => {
  it("returns null for non-object or unrecognized status", () => {
    expect(normalizeCodexUsageSnapshot(null)).toBeNull();
    expect(normalizeCodexUsageSnapshot({ status: "weird" })).toBeNull();
  });

  it("normalizes a valid ok snapshot and defaults the source to none", () => {
    const result = normalizeCodexUsageSnapshot({ status: "ok", primaryUsedPercent: 42 });
    expect(result?.status).toBe("ok");
    expect(result?.source).toBe("none");
    expect(result?.primaryUsedPercent).toBe(42);
    expect(typeof result?.fetchedAt).toBe("string");
  });

  it("preserves a recognized source", () => {
    expect(normalizeCodexUsageSnapshot({ status: "ok", source: "oauth-api" })?.source).toBe(
      "oauth-api",
    );
  });
});

describe("normalizeClaudeUsageSnapshot", () => {
  it("returns null for bad status or non-object input", () => {
    expect(normalizeClaudeUsageSnapshot({ status: "nope" })).toBeNull();
    expect(normalizeClaudeUsageSnapshot(7)).toBeNull();
  });

  it("recognizes the cli-pty source", () => {
    const result = normalizeClaudeUsageSnapshot({ status: "ok", source: "cli-pty" });
    expect(result?.status).toBe("ok");
    expect(result?.source).toBe("cli-pty");
  });

  it("defaults an unknown source to none", () => {
    expect(normalizeClaudeUsageSnapshot({ status: "unavailable", source: "??" })?.source).toBe(
      "none",
    );
  });
});
