import { describe, expect, it } from "vitest";

import { asNumber, asRecord, asString } from "../src/util/typeCoercion";

describe("asRecord", () => {
  it("returns a plain object unchanged", () => {
    const obj = { foo: "bar", count: 42 };
    const result = asRecord(obj);
    expect(result).toBe(obj);
  });

  it("returns an empty object", () => {
    const obj = {};
    const result = asRecord(obj);
    expect(result).toBe(obj);
  });

  it("returns null for null", () => {
    expect(asRecord(null)).toBeNull();
  });

  it("returns null for an array", () => {
    expect(asRecord([1, 2, 3])).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(asRecord([])).toBeNull();
  });

  it("returns null for a string", () => {
    expect(asRecord("hello")).toBeNull();
  });

  it("returns null for a number", () => {
    expect(asRecord(42)).toBeNull();
  });

  it("returns null for a boolean", () => {
    expect(asRecord(true)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(asRecord(undefined)).toBeNull();
  });

  it("returns a nested object", () => {
    const nested = { a: { b: 1 } };
    expect(asRecord(nested)).toBe(nested);
  });

  it("preserves object with null values inside", () => {
    const obj = { key: null };
    const result = asRecord(obj);
    expect(result).toBe(obj);
    expect((result as Record<string, unknown>).key).toBeNull();
  });
});

describe("asString", () => {
  it("returns a non-empty string unchanged", () => {
    expect(asString("hello")).toBe("hello");
  });

  it("returns an empty string", () => {
    expect(asString("")).toBe("");
  });

  it("returns a string with whitespace", () => {
    expect(asString("  ")).toBe("  ");
  });

  it("returns a unicode string", () => {
    expect(asString("emoji 🎉")).toBe("emoji 🎉");
  });

  it("returns null for a number", () => {
    expect(asString(42)).toBeNull();
  });

  it("returns null for null", () => {
    expect(asString(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(asString(undefined)).toBeNull();
  });

  it("returns null for a boolean", () => {
    expect(asString(true)).toBeNull();
  });

  it("returns null for an object", () => {
    expect(asString({})).toBeNull();
  });

  it("returns null for an array", () => {
    expect(asString(["a"])).toBeNull();
  });
});

describe("asNumber", () => {
  it("returns a plain integer", () => {
    expect(asNumber(42)).toBe(42);
  });

  it("returns zero", () => {
    expect(asNumber(0)).toBe(0);
  });

  it("returns a negative number", () => {
    expect(asNumber(-7.5)).toBe(-7.5);
  });

  it("returns a float", () => {
    expect(asNumber(3.14)).toBe(3.14);
  });

  it("coerces a numeric string to a number", () => {
    expect(asNumber("42")).toBe(42);
  });

  it("coerces a float string", () => {
    expect(asNumber("3.14")).toBe(3.14);
  });

  it("coerces a negative numeric string", () => {
    expect(asNumber("-100")).toBe(-100);
  });

  it("returns null for Infinity", () => {
    expect(asNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns null for -Infinity", () => {
    expect(asNumber(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(asNumber(Number.NaN)).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(asNumber("abc")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(asNumber("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(asNumber(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(asNumber(undefined)).toBeNull();
  });

  it("returns null for a boolean", () => {
    expect(asNumber(true)).toBeNull();
  });

  it("returns null for an object", () => {
    expect(asNumber({})).toBeNull();
  });

  it("returns null for an array", () => {
    expect(asNumber([1])).toBeNull();
  });

  it("returns null for Infinity string", () => {
    // parseFloat("Infinity") === Infinity which is not finite
    expect(asNumber("Infinity")).toBeNull();
  });
});
