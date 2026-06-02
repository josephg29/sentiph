import { describe, expect, it } from "vitest";

import {
  parseBoundedInt,
  parseEnum,
  parseRequiredString,
} from "../src/createApiServer/queryParsers";

const params = (init: Record<string, string> = {}): URLSearchParams => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(init)) p.set(k, v);
  return p;
};

describe("parseRequiredString", () => {
  it("returns the raw value when present", () => {
    expect(parseRequiredString(params({ q: "hello" }), "q", "missing")).toEqual({
      value: "hello",
      error: null,
    });
  });

  it("returns the missing message when absent", () => {
    expect(parseRequiredString(params(), "q", "missing")).toEqual({
      value: null,
      error: "missing",
    });
  });

  it("returns the missing message for whitespace-only values", () => {
    expect(parseRequiredString(params({ q: "   " }), "q", "missing").error).toBe("missing");
  });
});

describe("parseEnum", () => {
  const allowed = ["all", "project"] as const;

  it("returns the value when it is in the allowed set", () => {
    expect(parseEnum(params({ scope: "project" }), "scope", allowed)).toEqual({
      value: "project",
      error: null,
    });
  });

  it("falls back to the default when absent", () => {
    expect(parseEnum(params(), "scope", allowed, { default: "all" })).toEqual({
      value: "all",
      error: null,
    });
  });

  it("returns null value when absent and no default given", () => {
    expect(parseEnum(params(), "scope", allowed)).toEqual({ value: null, error: null });
  });

  it("returns invalidMessage when present-but-invalid and message supplied", () => {
    expect(
      parseEnum(params({ format: "txt" }), "format", ["json", "md"] as const, {
        invalidMessage: "bad format",
      }),
    ).toEqual({ value: null, error: "bad format" });
  });

  it("falls back to default when present-but-invalid and no message supplied", () => {
    expect(parseEnum(params({ scope: "weird" }), "scope", allowed, { default: "all" })).toEqual({
      value: "all",
      error: null,
    });
  });
});

describe("parseBoundedInt", () => {
  const opts = { min: 1, max: 90, default: 7 };

  it("returns the default when absent", () => {
    expect(parseBoundedInt(params(), "days", opts)).toEqual({ value: 7, error: null });
  });

  it("parses a valid integer", () => {
    expect(parseBoundedInt(params({ days: "30" }), "days", opts).value).toBe(30);
  });

  it("clamps to the minimum", () => {
    expect(parseBoundedInt(params({ days: "-5" }), "days", opts).value).toBe(1);
  });

  it("clamps to the maximum", () => {
    expect(parseBoundedInt(params({ days: "200" }), "days", opts).value).toBe(90);
  });

  it("falls back to default for non-numeric values before clamping", () => {
    expect(parseBoundedInt(params({ days: "abc" }), "days", opts).value).toBe(7);
  });

  it("treats an explicit zero default as the NaN fallback", () => {
    // raw="abc" → parseInt NaN → `|| default(0)` → 0, clamped within [0, 500]
    expect(
      parseBoundedInt(params({ limit: "abc" }), "limit", { min: 0, max: 500, default: 0 }).value,
    ).toBe(0);
  });
});
