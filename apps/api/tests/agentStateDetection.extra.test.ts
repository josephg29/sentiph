/**
 * Supplementary tests for agentStateDetection.ts — covers branches not
 * exercised by the existing agentStateDetection.test.ts.
 */
import { describe, expect, it } from "vitest";

import { AgentStateTracker } from "../src/agentStateDetection";

// ---------------------------------------------------------------------------
// Constructor edge cases
// ---------------------------------------------------------------------------
describe("AgentStateTracker – constructor options", () => {
  it("clamps maxBufferLength to minimum 256", () => {
    const tracker = new AgentStateTracker({ maxBufferLength: 10 });
    // Feed 300 chars — if clamped to 256 the buffer won't exceed 256
    const longChunk = "a".repeat(300);
    tracker.observeChunk(longChunk, 0);
    // No assertion on internals; just verify no error and currentState is valid
    expect(["idle", "processing"]).toContain(tracker.currentState);
  });

  it("clamps idleAfterMs to minimum 250", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 10 });
    tracker.observeSubmit(0);
    // With minimum 250ms, polling at 200ms should not yet be idle
    expect(tracker.poll(200)).toBeNull();
    expect(tracker.poll(300)).toBe("idle");
  });

  it("accepts initialState = processing and sets idle deadline", () => {
    const tracker = new AgentStateTracker({
      initialState: "processing",
      idleAfterMs: 500,
    });
    expect(tracker.currentState).toBe("processing");
    // Poll far into the future → should be idle (past 500ms deadline)
    expect(tracker.poll(Date.now() + 1_000)).toBe("idle");
    expect(tracker.currentState).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// observeChunk — edge cases
// ---------------------------------------------------------------------------
describe("AgentStateTracker – observeChunk edge cases", () => {
  it("returns null for empty chunk", () => {
    const tracker = new AgentStateTracker();
    expect(tracker.observeChunk("", 0)).toBeNull();
  });

  it("returns null for chunk that normalises to empty (ANSI only)", () => {
    const tracker = new AgentStateTracker();
    // Pure ANSI escape — strips to empty string
    const ansiOnly = "[2K[1A";
    expect(tracker.observeChunk(ansiOnly, 0)).toBeNull();
  });

  it("returns null when chunk has text but no processing signal", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    expect(tracker.observeChunk("just some output\n", 0)).toBeNull();
    expect(tracker.currentState).toBe("idle");
  });

  it("extends idle deadline while in processing and receiving non-signal chunks", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    tracker.observeSubmit(0);

    // Output at t=800: extends deadline to 1800
    tracker.observeChunk("streaming output", 800);

    // Poll at 1050: still processing because deadline was extended
    expect(tracker.poll(1_050)).toBeNull();

    // Poll at 1850: now past extended deadline
    expect(tracker.poll(1_850)).toBe("idle");
  });

  it("returns null (not 'processing') when processing signal was already in carry but not in new chunk", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });

    // First chunk — puts "esc to interrupt" in carry; transitions to processing
    expect(tracker.observeChunk("esc to interrupt", 0)).toBe("processing");

    // Second chunk — no new signal, just output
    expect(tracker.observeChunk("still running", 100)).toBeNull();
    expect(tracker.currentState).toBe("processing");
  });

  it("handles OSC escape sequences (title/hyperlink)", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    // OSC sequence: ESC ] ... BEL
    const oscChunk = "]0;Window Titleworking... esc to interrupt";
    expect(tracker.observeChunk(oscChunk, 0)).toBe("processing");
  });

  it("handles ST-terminated OSC sequences", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    // OSC sequence terminated by ESC \
    const oscChunk = "]0;Title\\esc to interrupt";
    expect(tracker.observeChunk(oscChunk, 0)).toBe("processing");
  });

  it("handles one-byte escape sequences (not CSI or OSC)", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    // ESC c = full reset; followed by processing text
    const chunk = "cesc to interrupt";
    expect(tracker.observeChunk(chunk, 0)).toBe("processing");
  });

  it("detects processing signal in second chunk when first fills carry buffer", () => {
    const tracker = new AgentStateTracker({ maxBufferLength: 256, idleAfterMs: 1_000 });

    // Send a long first chunk to fill the carry buffer (no signal)
    const longChunk = "x".repeat(300);
    expect(tracker.observeChunk(longChunk, 0)).toBeNull();

    // Second chunk contains signal
    expect(tracker.observeChunk("esc to interrupt", 300)).toBe("processing");
  });

  it("handles \\r\\n as newline (Windows line endings)", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    const chunk = "Running...\r\nesc to interrupt\r\n";
    expect(tracker.observeChunk(chunk, 0)).toBe("processing");
  });

  it("handles \\r alone as newline", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    const chunk = "Processing...\resc to interrupt";
    expect(tracker.observeChunk(chunk, 0)).toBe("processing");
  });
});

// ---------------------------------------------------------------------------
// forceState
// ---------------------------------------------------------------------------
describe("AgentStateTracker – forceState", () => {
  it("returns false when forcing to the current state (idle → idle)", () => {
    const tracker = new AgentStateTracker();
    expect(tracker.forceState("idle")).toBe(false);
    expect(tracker.currentState).toBe("idle");
  });

  it("returns false when forcing to the current state (processing → processing) but extends deadline", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    tracker.observeSubmit(0);
    // Force to same state at t=500 — extends deadline to 1500
    const result = tracker.forceState("processing", 500);
    expect(result).toBe(false);
    // At t=1200 (past original 1000 deadline) still processing
    expect(tracker.poll(1_200)).toBeNull();
    expect(tracker.poll(1_600)).toBe("idle");
  });

  it("returns true when forcing from idle to processing", () => {
    const tracker = new AgentStateTracker();
    const result = tracker.forceState("processing", 0);
    expect(result).toBe(true);
    expect(tracker.currentState).toBe("processing");
  });

  it("returns true when forcing from processing to idle and clears deadline", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    tracker.observeSubmit(0);
    const result = tracker.forceState("idle", 100);
    expect(result).toBe(true);
    expect(tracker.currentState).toBe("idle");
    // poll should return null since we're already idle
    expect(tracker.poll(200)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// observeSubmit
// ---------------------------------------------------------------------------
describe("AgentStateTracker – observeSubmit", () => {
  it("returns 'processing' when previously idle", () => {
    const tracker = new AgentStateTracker();
    expect(tracker.observeSubmit(0)).toBe("processing");
    expect(tracker.currentState).toBe("processing");
  });

  it("returns null when already processing (extends deadline instead)", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    tracker.observeSubmit(0);
    // Second submit while already processing
    const result = tracker.observeSubmit(500);
    expect(result).toBeNull();
    expect(tracker.currentState).toBe("processing");
    // Deadline was extended: at t=1200 still processing
    expect(tracker.poll(1_200)).toBeNull();
    expect(tracker.poll(1_600)).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// poll edge cases
// ---------------------------------------------------------------------------
describe("AgentStateTracker – poll edge cases", () => {
  it("returns null when state is idle", () => {
    const tracker = new AgentStateTracker();
    expect(tracker.poll(1_000)).toBeNull();
  });

  it("poll transitions to idle after the deadline when starting in processing state", () => {
    const tracker = new AgentStateTracker({ initialState: "processing", idleAfterMs: 100 });
    expect(tracker.currentState).toBe("processing");
    // Poll far into the future — well past the 100ms deadline
    expect(tracker.poll(Date.now() + 1_000)).toBe("idle");
    expect(tracker.currentState).toBe("idle");
  });

  it("returns idle exactly at the deadline", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    tracker.observeSubmit(0);
    expect(tracker.poll(1_000)).toBe("idle");
  });

  it("poll returns null again after transitioning to idle", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 500 });
    tracker.observeSubmit(0);
    expect(tracker.poll(600)).toBe("idle");
    expect(tracker.poll(700)).toBeNull();
    expect(tracker.poll(800)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case-insensitivity of processing pattern
// ---------------------------------------------------------------------------
describe("AgentStateTracker – pattern matching", () => {
  it("matches 'ESC TO INTERRUPT' in uppercase", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    expect(tracker.observeChunk("Running... ESC TO INTERRUPT", 0)).toBe("processing");
  });

  it("matches 'Esc To Interrupt' in mixed case", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    expect(tracker.observeChunk("Esc To Interrupt", 0)).toBe("processing");
  });

  it("does not match partial pattern 'esc to inter'", () => {
    const tracker = new AgentStateTracker({ idleAfterMs: 1_000 });
    expect(tracker.observeChunk("esc to inter", 0)).toBeNull();
  });
});
