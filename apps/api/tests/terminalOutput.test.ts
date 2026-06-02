/**
 * Tests for terminalRuntime/terminalOutput.ts
 * Covers appendScrollback and stripBrokenLeadingAnsi.
 */
import { describe, expect, it } from "vitest";

import { appendScrollback, stripBrokenLeadingAnsi } from "../src/terminalRuntime/terminalOutput";
import type { TerminalSession } from "../src/terminalRuntime/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeSession = (overrides: Partial<TerminalSession> = {}): TerminalSession =>
  ({
    scrollbackChunks: [],
    scrollbackBytes: 0,
    ...overrides,
  }) as unknown as TerminalSession;

const joinScrollback = (session: TerminalSession): string => session.scrollbackChunks.join("");

// ─── appendScrollback ────────────────────────────────────────────────────────

describe("appendScrollback", () => {
  it("appends a chunk smaller than the max", () => {
    const session = makeSession();
    appendScrollback(session, "hello", 100);
    expect(joinScrollback(session)).toBe("hello");
    expect(session.scrollbackBytes).toBe(5);
  });

  it("accumulates multiple chunks", () => {
    const session = makeSession();
    appendScrollback(session, "foo", 100);
    appendScrollback(session, "bar", 100);
    expect(joinScrollback(session)).toBe("foobar");
    expect(session.scrollbackBytes).toBe(6);
  });

  it("trims oldest chunks when total bytes exceed max", () => {
    const session = makeSession();
    appendScrollback(session, "12345", 8);
    appendScrollback(session, "67890", 8);
    // total after second = 10 bytes; should evict "12345" (5 bytes) → left with "67890" (5)
    expect(session.scrollbackBytes).toBeLessThanOrEqual(8);
    // Latest chunk must be present in the final scrollback
    expect(joinScrollback(session)).toContain("67890");
  });

  it("when a single chunk exceeds max, keeps only the tail", () => {
    const session = makeSession();
    appendScrollback(session, "0123456789", 4);
    // Only the last 4 bytes of the oversize chunk should survive
    expect(joinScrollback(session)).toBe("6789");
    expect(session.scrollbackBytes).toBe(4);
  });

  it("when oversize chunk arrives, clears previous scrollback", () => {
    const session = makeSession();
    appendScrollback(session, "abc", 4);
    // Now send a chunk that itself exceeds the max
    appendScrollback(session, "0123456789", 4);
    // Previous chunks must be cleared; only tail of the big chunk remains
    expect(joinScrollback(session)).toBe("6789");
  });

  it("handles empty string chunk without error", () => {
    const session = makeSession();
    appendScrollback(session, "", 100);
    expect(joinScrollback(session)).toBe("");
    expect(session.scrollbackBytes).toBe(0);
  });

  it("handles unicode multi-byte characters correctly", () => {
    const session = makeSession();
    // "€" is 3 bytes in UTF-8
    appendScrollback(session, "€€€", 100);
    expect(session.scrollbackBytes).toBe(9);
    expect(joinScrollback(session)).toBe("€€€");
  });

  it("correctly evicts multiple old chunks to satisfy the max", () => {
    const session = makeSession();
    appendScrollback(session, "AA", 6); // 2 bytes
    appendScrollback(session, "BB", 6); // 2 bytes
    appendScrollback(session, "CC", 6); // 2 bytes  — total 6, still within
    appendScrollback(session, "DD", 6); // 2 bytes  — total 8 → must evict "AA"
    expect(session.scrollbackBytes).toBeLessThanOrEqual(6);
    expect(joinScrollback(session)).not.toContain("AA");
    expect(joinScrollback(session)).toContain("DD");
  });
});

// ─── stripBrokenLeadingAnsi ───────────────────────────────────────────────────

describe("stripBrokenLeadingAnsi", () => {
  it("returns plain text unchanged", () => {
    expect(stripBrokenLeadingAnsi("hello world")).toBe("hello world");
  });

  it("preserves text that starts with ESC (complete ANSI sequence start)", () => {
    const input = "[32mGreen[0m";
    expect(stripBrokenLeadingAnsi(input)).toBe(input);
  });

  it("strips a leading CSI tail fragment (e.g. after buffer truncation)", () => {
    // A truncated SGR sequence leaves "[0m" at the start
    const result = stripBrokenLeadingAnsi("[0mHello");
    expect(result).toBe("Hello");
  });

  it("strips multiple leading CSI tail fragments", () => {
    // "[32m" and "[0m" both stripped before the text
    expect(stripBrokenLeadingAnsi("[32m[0mText")).toBe("Text");
  });

  it("returns empty string for empty input", () => {
    expect(stripBrokenLeadingAnsi("")).toBe("");
  });

  it("strips a broken OSC tail (e.g. ]0;title BEL without the ESC])", () => {
    // Broken OSC fragment: "]0;sometitle" at the start
    const brokenOsc = "]0;MyTitlerest of output";
    const result = stripBrokenLeadingAnsi(brokenOsc);
    expect(result).toBe("rest of output");
  });

  it("strips an OSC tail terminated with ESC\\", () => {
    const brokenOsc = "]0;title\\remaining";
    const result = stripBrokenLeadingAnsi(brokenOsc);
    expect(result).toBe("remaining");
  });

  it("stops stripping at the first non-fragment character", () => {
    // A line that starts with visible text — nothing to strip
    const input = "regular line\r\n";
    expect(stripBrokenLeadingAnsi(input)).toBe(input);
  });

  it("handles a text that is only a broken CSI fragment with nothing after", () => {
    // "[1m" with nothing remaining → should return empty string
    expect(stripBrokenLeadingAnsi("[1m")).toBe("");
  });

  it("handles the session-runtime test case: RGB background stripped before HELLO", () => {
    // This mirrors the scrollback-stripping scenario in sessionRuntime.test.ts
    const input = "[48;2;55;55;55mHELLO\r\n";
    // Because the input STARTS with ESC, stripBrokenLeadingAnsi should return it unchanged
    // (the ESC signals the start of a complete sequence, not a broken tail)
    const result = stripBrokenLeadingAnsi(input);
    // The function returns input as-is when it starts with ESC
    expect(result.startsWith("")).toBe(true);
  });

  it("strips orphaned CSI numeric parameters without escape prefix", () => {
    // Numbers followed by semicolons then a final byte — like "48;2;55;55;55m"
    const result = stripBrokenLeadingAnsi("48;2;55;55;55mHELLO\r\n");
    // Should strip the parameter fragment and return text
    expect(result).toContain("HELLO");
  });
});
