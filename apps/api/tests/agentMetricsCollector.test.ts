import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentMetricsCollector } from "../src/agentMetricsCollector";
import type { PersistedTerminal } from "../src/terminalRuntime/types";

const temporaryDirectories: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-collector-"));
  temporaryDirectories.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of temporaryDirectories) {
    rmSync(dir, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
  vi.restoreAllMocks();
});

const makeTerminal = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "term-1",
  tentacleId: "tent-1",
  tentacleName: "Test Agent",
  createdAt: "2024-06-01T09:00:00.000Z",
  startedAt: "2024-06-01T09:00:00.000Z",
  workspaceMode: "shared",
  agentProvider: "claude-code",
  ...overrides,
});

const readJsonlLines = (filePath: string): unknown[] => {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as unknown);
};

// ---------------------------------------------------------------------------
// onSessionStart
// ---------------------------------------------------------------------------

describe("onSessionStart", () => {
  it("creates the accumulator for the terminal", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    // No error thrown means accumulator created
    collector.onSessionStart(terminal);
  });

  it("uses terminal.startedAt when available", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal({ startedAt: "2024-06-01T10:00:00.000Z" });
    collector.onSessionStart(terminal);
    // We verify via onSessionEnd — startedAt influences durationMs
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    const summaries = readJsonlLines(join(dir, "summaries.jsonl"));
    expect(summaries).toHaveLength(1);
    const s = summaries[0] as { startedAt: string };
    expect(s.startedAt).toBe("2024-06-01T10:00:00.000Z");
  });

  it("falls back to current time when startedAt is missing", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal({ startedAt: undefined });
    const before = new Date().toISOString();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    const summaries = readJsonlLines(join(dir, "summaries.jsonl"));
    const s = summaries[0] as { startedAt: string };
    expect(s.startedAt >= before).toBe(true);
  });

  it("overwrites an existing accumulator if called twice for the same terminal", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Total cost: $1.00"); // accumulates data
    collector.onSessionStart(terminal); // reset
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    const summaries = readJsonlLines(join(dir, "summaries.jsonl"));
    // cost should be 0 since second onSessionStart resets accumulator
    const s = summaries[0] as { tokenCostUsd: number };
    expect(s.tokenCostUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// onStateChange
// ---------------------------------------------------------------------------

describe("onStateChange", () => {
  it("no-ops silently for unknown terminalId", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    expect(() => collector.onStateChange("unknown-id", "processing")).not.toThrow();
  });

  it("no-ops when state does not change", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    // Initially idle → idle (no-op)
    collector.onStateChange(terminal.terminalId, "idle");
    const events = readJsonlLines(join(dir, `${encodeURIComponent(terminal.terminalId)}.jsonl`));
    expect(events).toHaveLength(0);
  });

  it("writes a state_change event when state transitions", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onStateChange(terminal.terminalId, "processing");
    const events = readJsonlLines(
      join(dir, `${encodeURIComponent(terminal.terminalId)}.jsonl`),
    ) as Array<{
      eventType: string;
      payload: { from: string; to: string };
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("state_change");
    expect(events[0]?.payload.from).toBe("idle");
    expect(events[0]?.payload.to).toBe("processing");
  });

  it("accumulates idleMs when transitioning out of idle state", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);

    // Use fake timers to control elapsed time
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T10:00:00.000Z"));
    collector.onSessionStart(terminal); // reset accumulator at known time

    vi.advanceTimersByTime(5_000); // advance 5s while idle
    collector.onStateChange(terminal.terminalId, "processing");

    vi.advanceTimersByTime(3_000); // 3s processing
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    vi.useRealTimers();

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      idleMs: number;
      processingMs: number;
    }>;
    // The second onSessionStart() at t=0, idle for 5s, then processing for 3s
    expect(summaries[0]?.idleMs).toBeGreaterThanOrEqual(5_000);
    expect(summaries[0]?.processingMs).toBeGreaterThanOrEqual(3_000);
  });

  it("accumulates processingMs when transitioning out of processing state", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T10:00:00.000Z"));
    collector.onSessionStart(terminal);

    collector.onStateChange(terminal.terminalId, "processing");
    vi.advanceTimersByTime(10_000);
    collector.onStateChange(terminal.terminalId, "idle");

    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    vi.useRealTimers();

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      processingMs: number;
    }>;
    expect(summaries[0]?.processingMs).toBeGreaterThanOrEqual(10_000);
  });
});

// ---------------------------------------------------------------------------
// onOutputChunk
// ---------------------------------------------------------------------------

describe("onOutputChunk", () => {
  it("no-ops silently for unknown terminalId", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    expect(() => collector.onOutputChunk("unknown-id", "some output")).not.toThrow();
  });

  it("parses total cost from output and writes token_usage event", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Total cost: $0.05");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      tokenCostUsd: number;
    }>;
    expect(summaries[0]?.tokenCostUsd).toBe(0.05);

    const events = readJsonlLines(
      join(dir, `${encodeURIComponent(terminal.terminalId)}.jsonl`),
    ) as Array<{
      eventType: string;
    }>;
    const tokenEvents = events.filter((e) => e.eventType === "token_usage");
    expect(tokenEvents.length).toBeGreaterThan(0);
  });

  it("handles cost with comma-separated thousands", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Total cost: $1,234.56");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      tokenCostUsd: number;
    }>;
    expect(summaries[0]?.tokenCostUsd).toBeCloseTo(1234.56);
  });

  it("parses input token count from output", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Input tokens: 1,500");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      tokenIn: number;
    }>;
    expect(summaries[0]?.tokenIn).toBe(1500);
  });

  it("parses output token count from output", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Output tokens: 500");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      tokenOut: number;
    }>;
    expect(summaries[0]?.tokenOut).toBe(500);
  });

  it("detects tool invocations in output and writes events", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Bash(echo hello)\nRead(file.ts)");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      toolsUsed: string[];
    }>;
    expect(summaries[0]?.toolsUsed).toContain("Bash");
    expect(summaries[0]?.toolsUsed).toContain("Read");
  });

  it("does not emit duplicate tool_invocation events for repeated tool calls", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Bash(echo 1)");
    collector.onOutputChunk(terminal.terminalId, "Bash(echo 2)");

    const events = readJsonlLines(
      join(dir, `${encodeURIComponent(terminal.terminalId)}.jsonl`),
    ) as Array<{
      eventType: string;
      payload: { tool: string };
    }>;
    const bashInvocations = events.filter(
      (e) => e.eventType === "tool_invocation" && e.payload.tool === "Bash",
    );
    expect(bashInvocations).toHaveLength(1);
  });

  it("detects errors in output and increments errorCount", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Error: something went wrong");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      errorCount: number;
    }>;
    expect(summaries[0]?.errorCount).toBe(1);
  });

  it("detects multiple errors in separate chunks", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Error: first problem");
    collector.onOutputChunk(terminal.terminalId, "FAILED: second problem");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      errorCount: number;
    }>;
    expect(summaries[0]?.errorCount).toBe(2);
  });

  it("strips ANSI codes before parsing", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    // ANSI-wrapped cost line
    collector.onOutputChunk(terminal.terminalId, "[32mTotal cost: $0.10[0m");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      tokenCostUsd: number;
    }>;
    expect(summaries[0]?.tokenCostUsd).toBeCloseTo(0.1);
  });

  it("does not write token_usage event when cost is 0", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Total cost: $0.00");

    const events = readJsonlLines(
      join(dir, `${encodeURIComponent(terminal.terminalId)}.jsonl`),
    ) as Array<{
      eventType: string;
    }>;
    const tokenEvents = events.filter((e) => e.eventType === "token_usage");
    expect(tokenEvents).toHaveLength(0);
  });

  it("does not accumulate tokenIn when count is 0", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Input tokens: 0");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      tokenIn: number;
    }>;
    expect(summaries[0]?.tokenIn).toBe(0);
  });

  it("stops writing events after MAX_EVENTS_PER_TERMINAL (10000)", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);

    // Each chunk with Error: triggers one error_detected event
    // Write 10001 chunks — the 10001st should be silently dropped
    for (let i = 0; i < 10_001; i++) {
      collector.onOutputChunk(terminal.terminalId, `Error: problem ${i}`);
    }

    const events = readJsonlLines(join(dir, `${encodeURIComponent(terminal.terminalId)}.jsonl`));
    expect(events).toHaveLength(10_000);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// onSessionEnd
// ---------------------------------------------------------------------------

describe("onSessionEnd", () => {
  it("no-ops silently for unknown terminalId", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    expect(() => collector.onSessionEnd("unknown-id", 0, undefined, "session_close")).not.toThrow();
  });

  it("writes a summary to summaries.jsonl", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      terminalId: string;
    }>;
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.terminalId).toBe(terminal.terminalId);
  });

  it("removes the accumulator after writing summary", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    // Calling onSessionEnd again should be a no-op (accumulator removed)
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl"));
    expect(summaries).toHaveLength(1);
  });

  it("infers outcome=success when exitCode=0 and reason=session_close", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      outcome: string;
    }>;
    expect(summaries[0]?.outcome).toBe("success");
  });

  it("infers outcome=error when exitCode is non-zero", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 1, undefined, "pty_exit");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      outcome: string;
    }>;
    expect(summaries[0]?.outcome).toBe("error");
  });

  it("infers outcome=stopped when reason=operator_stop", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, undefined, undefined, "operator_stop");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      outcome: string;
    }>;
    expect(summaries[0]?.outcome).toBe("stopped");
  });

  it("infers outcome=killed when reason=operator_kill", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 9, undefined, "operator_kill");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      outcome: string;
    }>;
    expect(summaries[0]?.outcome).toBe("killed");
  });

  it("infers outcome=unknown when exitCode is undefined and reason is session_close", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, undefined, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      outcome: string;
    }>;
    expect(summaries[0]?.outcome).toBe("unknown");
  });

  it("includes exitCode in summary when provided", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 42, undefined, "pty_exit");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      exitCode?: number;
    }>;
    expect(summaries[0]?.exitCode).toBe(42);
  });

  it("omits exitCode from summary when undefined", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, undefined, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<
      Record<string, unknown>
    >;
    expect("exitCode" in (summaries[0] ?? {})).toBe(false);
  });

  it("includes exitSignal in summary when provided", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, undefined, "SIGTERM", "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      exitSignal?: string;
    }>;
    expect(summaries[0]?.exitSignal).toBe("SIGTERM");
  });

  it("omits exitSignal from summary when undefined", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<
      Record<string, unknown>
    >;
    expect("exitSignal" in (summaries[0] ?? {})).toBe(false);
  });

  it("defaults agentProvider to claude-code when terminal has no provider", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const base = makeTerminal();
    const { agentProvider: _dropped, ...terminalWithoutProvider } = base;
    const terminal = terminalWithoutProvider as typeof base;
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      agentProvider: string;
    }>;
    expect(summaries[0]?.agentProvider).toBe("claude-code");
  });

  it("includes collected toolsUsed as an array", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onOutputChunk(terminal.terminalId, "Write(file.ts)\nEdit(file.ts)");
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      toolsUsed: string[];
    }>;
    expect(summaries[0]?.toolsUsed).toContain("Write");
    expect(summaries[0]?.toolsUsed).toContain("Edit");
  });

  it("accumulates final idle or processing time at end of session", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal = makeTerminal();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T10:00:00.000Z"));
    collector.onSessionStart(terminal);

    vi.advanceTimersByTime(8_000); // 8s idle before end
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    vi.useRealTimers();

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      idleMs: number;
    }>;
    expect(summaries[0]?.idleMs).toBeGreaterThanOrEqual(8_000);
  });

  it("creates the metricsDir if it does not exist before writing", () => {
    const baseDir = makeTempDir();
    const metricsDir = join(baseDir, "nested", "metrics");
    const collector = createAgentMetricsCollector(metricsDir);
    const terminal = makeTerminal();
    collector.onSessionStart(terminal);
    collector.onSessionEnd(terminal.terminalId, 0, undefined, "session_close");
    expect(existsSync(join(metricsDir, "summaries.jsonl"))).toBe(true);
  });

  it("multiple terminals write independent summaries", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal1 = makeTerminal({ terminalId: "t-a", tentacleId: "tent-a" });
    const terminal2 = makeTerminal({ terminalId: "t-b", tentacleId: "tent-b" });

    collector.onSessionStart(terminal1);
    collector.onSessionStart(terminal2);
    collector.onSessionEnd("t-a", 0, undefined, "session_close");
    collector.onSessionEnd("t-b", 1, undefined, "pty_exit");

    const summaries = readJsonlLines(join(dir, "summaries.jsonl")) as Array<{
      terminalId: string;
      outcome: string;
    }>;
    expect(summaries).toHaveLength(2);
    const a = summaries.find((s) => s.terminalId === "t-a");
    const b = summaries.find((s) => s.terminalId === "t-b");
    expect(a?.outcome).toBe("success");
    expect(b?.outcome).toBe("error");
  });

  it("eventIds are globally unique across sessions", () => {
    const dir = makeTempDir();
    const collector = createAgentMetricsCollector(dir);
    const terminal1 = makeTerminal({ terminalId: "t-x", tentacleId: "tent-x" });
    const terminal2 = makeTerminal({ terminalId: "t-y", tentacleId: "tent-y" });

    collector.onSessionStart(terminal1);
    collector.onSessionStart(terminal2);
    collector.onStateChange("t-x", "processing");
    collector.onStateChange("t-y", "processing");

    const eventsX = readJsonlLines(join(dir, `${encodeURIComponent("t-x")}.jsonl`)) as Array<{
      eventId: string;
    }>;
    const eventsY = readJsonlLines(join(dir, `${encodeURIComponent("t-y")}.jsonl`)) as Array<{
      eventId: string;
    }>;

    const allIds = [...eventsX.map((e) => e.eventId), ...eventsY.map((e) => e.eventId)];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
