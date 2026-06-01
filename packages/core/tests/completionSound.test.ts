import { describe, expect, it } from "vitest";

import {
  TERMINAL_COMPLETION_SOUND_IDS,
  isTerminalCompletionSoundId,
} from "../src/domain/completionSound";

describe("TERMINAL_COMPLETION_SOUND_IDS", () => {
  it('contains "soft-chime"', () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toContain("soft-chime");
  });

  it('contains "retro-beep"', () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toContain("retro-beep");
  });

  it('contains "double-beep"', () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toContain("double-beep");
  });

  it('contains "bell"', () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toContain("bell");
  });

  it('contains "pop"', () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toContain("pop");
  });

  it('contains "silent"', () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toContain("silent");
  });

  it("has exactly 6 entries", () => {
    expect(TERMINAL_COMPLETION_SOUND_IDS).toHaveLength(6);
  });
});

describe("isTerminalCompletionSoundId", () => {
  it('returns true for "soft-chime"', () => {
    expect(isTerminalCompletionSoundId("soft-chime")).toBe(true);
  });

  it('returns true for "retro-beep"', () => {
    expect(isTerminalCompletionSoundId("retro-beep")).toBe(true);
  });

  it('returns true for "double-beep"', () => {
    expect(isTerminalCompletionSoundId("double-beep")).toBe(true);
  });

  it('returns true for "bell"', () => {
    expect(isTerminalCompletionSoundId("bell")).toBe(true);
  });

  it('returns true for "pop"', () => {
    expect(isTerminalCompletionSoundId("pop")).toBe(true);
  });

  it('returns true for "silent"', () => {
    expect(isTerminalCompletionSoundId("silent")).toBe(true);
  });

  it("returns false for an unknown string", () => {
    expect(isTerminalCompletionSoundId("ding")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isTerminalCompletionSoundId("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTerminalCompletionSoundId(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTerminalCompletionSoundId(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isTerminalCompletionSoundId(1)).toBe(false);
  });

  it("returns false for an object", () => {
    expect(isTerminalCompletionSoundId({ id: "bell" })).toBe(false);
  });

  it("is case-sensitive — returns false for 'Bell'", () => {
    expect(isTerminalCompletionSoundId("Bell")).toBe(false);
  });

  it("returns false for an array containing a valid id", () => {
    expect(isTerminalCompletionSoundId(["bell"])).toBe(false);
  });

  it("verifies every id in the constant passes the guard", () => {
    for (const id of TERMINAL_COMPLETION_SOUND_IDS) {
      expect(isTerminalCompletionSoundId(id)).toBe(true);
    }
  });
});
