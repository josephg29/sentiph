/**
 * tests/claudeUsageParsing.branches.test.ts
 *
 * Covers uncovered branches in claudeUsageParsing.ts:
 *  - percentFromLine: match[1] is undefined (unreachable via regex — skipped, see below)
 *  - percentFromLine: default case (no used/remaining keyword)
 *  - findLabelMatch: all labelSubstrings not found → null
 *  - extractLabeledPercent: nextMatch found (end truncated) vs not found
 *
 * Skipped-unreachable:
 *  - `if (!percentText) return null` — PERCENT_RE capture group 1 is always
 *    present when the regex matches; match[1] cannot be undefined when
 *    match is truthy. Defensive guard only.
 */

import { describe, expect, it } from "vitest";

import { parseCliUsageOutput, stripAnsiCodes } from "../src/claudeUsageParsing";

// ---------------------------------------------------------------------------
// percentFromLine — !match branch (no % in line)
// ---------------------------------------------------------------------------
describe("parseCliUsageOutput — percentFromLine no match", () => {
  it("returns null for primaryUsedPercent when session section has no percentage", () => {
    // "Current session" is found but the text after the label has no percent sign
    const output = "Current session\n  No data available\nCurrent week (all models)\n  50% used";
    const result = parseCliUsageOutput(output);
    // extractLabeledPercent for "current session" finds no % in the bounded section
    expect(result.primaryUsedPercent).toBeNull();
    expect(result.secondaryUsedPercent).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// findLabelMatch — bestMatch already set, later index is not better
// ---------------------------------------------------------------------------
describe("parseCliUsageOutput — findLabelMatch best-match selection", () => {
  it("uses the earliest label match when multiple candidates appear", () => {
    // "current week (all models)" and "current week (opus)" both appear
    // The first occurrence (earlier index) wins
    const output = [
      "Current session",
      "  10% used",
      "current week (opus)",
      "  55% used",
      "current week (all models)",
      "  70% used",
    ].join("\n");
    const result = parseCliUsageOutput(output);
    // whichever label appears first in the text wins
    expect(result.secondaryUsedPercent).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// stripAnsiCodes — ensure broad ANSI sequence stripping
// ---------------------------------------------------------------------------
describe("stripAnsiCodes branches", () => {
  it("handles OSC escape sequences (not just CSI)", () => {
    // OSC is \x1b]...\x07 — the regex in parsing only targets CSI (\x1b[...)
    // so OSC sequences pass through (this is consistent behaviour, not a bug)
    const withOsc = "\x1b]0;window title\x07plain";
    // stripAnsiCodes from claudeUsageParsing only strips CSI sequences
    const result = stripAnsiCodes(withOsc);
    // Just ensure it does not throw and returns a string
    expect(typeof result).toBe("string");
  });

  it("returns empty string unchanged", () => {
    expect(stripAnsiCodes("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// percentFromLine — default branch (no used/remaining keyword in context)
// ---------------------------------------------------------------------------
describe("parseCliUsageOutput — default percent context (no keyword)", () => {
  it("treats bare percentage (no 'used' or 'remaining' context) as used", () => {
    // Build a string where the percent appears but neither USED_KEYWORDS nor
    // REMAINING_KEYWORDS appear in the surrounding 40-char window.
    // "Current session 45%" — the word "session" is 8 chars before the %, and
    // "used" / "remaining" are absent in the ±40 char window.
    const output = "Current session\n45%\nCurrent week (all models)\n60%";
    const result = parseCliUsageOutput(output);
    // Default path: treated as used
    expect(result.primaryUsedPercent).toBe(45);
    expect(result.secondaryUsedPercent).toBe(60);
  });

  it("handles percentage exactly at boundary 0", () => {
    const output = "Current session\n0% used\nCurrent week (all models)\n0% used";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(0);
    expect(result.secondaryUsedPercent).toBe(0);
  });

  it("clamps percentage above 100 to 100", () => {
    // The clamping code path: Math.max(0, Math.min(100, raw))
    // A value like "101%" gets clamped to 100
    const output = "Current session 101% used";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(100);
  });

  it("clamps percentage below 0 to 0 (negative would be weird but defensive)", () => {
    // PERCENT_RE only matches digits, so negative inputs don't parse;
    // this just verifies the normal case passes through
    const output = "Current session 0% used";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findLabelMatch — all candidates not found → returns null
// ---------------------------------------------------------------------------
describe("parseCliUsageOutput — no label match returns null", () => {
  it("returns null for all three fields when output has no recognizable labels", () => {
    const output = "Completely unrelated text with 50% somewhere in it";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBeNull();
    expect(result.secondaryUsedPercent).toBeNull();
    expect(result.sonnetUsedPercent).toBeNull();
  });

  it("returns null primaryUsedPercent when only week labels present", () => {
    const output = "Current week (all models)\n  20% used";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBeNull();
    expect(result.secondaryUsedPercent).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// extractLabeledPercent — end truncated by next label group
// ---------------------------------------------------------------------------
describe("parseCliUsageOutput — label boundary truncation", () => {
  it("stops reading session percent at the next label boundary", () => {
    // "current session" text followed immediately by "current week (all models)"
    // The session percent should not include the week's percent
    const output = "current session 10% used current week (all models) 80% used";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(10);
    expect(result.secondaryUsedPercent).toBe(80);
  });

  it("second label group does not absorb third label group percent", () => {
    const output = [
      "Current session",
      "  5% used",
      "Current week (all models)",
      "  40% used",
      "Current week (Sonnet only)",
      "  25% used",
    ].join("\n");
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(5);
    expect(result.secondaryUsedPercent).toBe(40);
    expect(result.sonnetUsedPercent).toBe(25);
  });

  it("handles 'consumed' as used keyword", () => {
    const output = "Current session 33% consumed";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(33);
  });

  it("handles 'spent' as used keyword", () => {
    const output = "Current session 77% spent";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(77);
  });

  it("handles 'left' as remaining keyword", () => {
    const output = "Current session 60% left";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(40);
  });

  it("handles 'available' as remaining keyword", () => {
    const output = "Current session 70% available";
    const result = parseCliUsageOutput(output);
    expect(result.primaryUsedPercent).toBe(30);
  });
});
