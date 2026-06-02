import { describe, expect, it } from "vitest";

import { areNumberRecordMapsEqual, areStringArraysEqual } from "../src/app/equalityUtils";

describe("areStringArraysEqual", () => {
  it("returns true for the same reference", () => {
    const arr = ["a", "b"];
    expect(areStringArraysEqual(arr, arr)).toBe(true);
  });

  it("treats undefined as an empty array", () => {
    expect(areStringArraysEqual(undefined, [])).toBe(true);
    expect(areStringArraysEqual([], undefined)).toBe(true);
    expect(areStringArraysEqual(undefined, undefined)).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(areStringArraysEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("returns false when any element differs", () => {
    expect(areStringArraysEqual(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("is order-sensitive", () => {
    expect(areStringArraysEqual(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("returns true for equal contents in order", () => {
    expect(areStringArraysEqual(["a", "b"], ["a", "b"])).toBe(true);
  });
});

describe("areNumberRecordMapsEqual", () => {
  it("returns true for the same reference", () => {
    const rec = { a: 1 };
    expect(areNumberRecordMapsEqual(rec, rec)).toBe(true);
  });

  it("treats undefined as an empty record", () => {
    expect(areNumberRecordMapsEqual(undefined, {})).toBe(true);
    expect(areNumberRecordMapsEqual(undefined, undefined)).toBe(true);
  });

  it("returns false when key counts differ", () => {
    expect(areNumberRecordMapsEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("returns false when a value differs", () => {
    expect(areNumberRecordMapsEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("returns false when a key is missing on the right", () => {
    expect(areNumberRecordMapsEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("returns true for equal maps regardless of key order", () => {
    expect(areNumberRecordMapsEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
});
