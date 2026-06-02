import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentMetricsEvent, AgentRunSummary } from "@sentiph/core";
import { createAgentMetricsStore } from "../src/agentMetricsStore";

const temporaryDirectories: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-metrics-store-"));
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

const makeSummary = (overrides: Partial<AgentRunSummary> = {}): AgentRunSummary => ({
  terminalId: "terminal-1",
  tentacleId: "tentacle-1",
  tentacleName: "Agent One",
  agentProvider: "claude-code",
  startedAt: "2024-06-01T10:00:00.000Z",
  endedAt: "2024-06-01T10:01:00.000Z",
  durationMs: 60_000,
  outcome: "success",
  tokenIn: 100,
  tokenOut: 200,
  tokenCostUsd: 0.01,
  idleMs: 10_000,
  processingMs: 50_000,
  errorCount: 0,
  toolsUsed: ["Bash", "Read"],
  ...overrides,
});

const writeSummariesJsonl = (dir: string, summaries: AgentRunSummary[]) => {
  const lines = `${summaries.map((s) => JSON.stringify(s)).join("\n")}\n`;
  writeFileSync(join(dir, "summaries.jsonl"), lines, "utf8");
};

const writeEventsJsonl = (dir: string, terminalId: string, events: AgentMetricsEvent[]) => {
  const lines = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
  writeFileSync(join(dir, `${encodeURIComponent(terminalId)}.jsonl`), lines, "utf8");
};

// ---------------------------------------------------------------------------
// readSummaries
// ---------------------------------------------------------------------------

describe("readSummaries", () => {
  it("returns empty array when summaries.jsonl does not exist", () => {
    const dir = makeTempDir();
    const store = createAgentMetricsStore(dir);
    expect(store.readSummaries()).toEqual([]);
  });

  it("parses a single valid summary", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [makeSummary()]);
    const store = createAgentMetricsStore(dir);
    const result = store.readSummaries();
    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe("terminal-1");
  });

  it("skips malformed JSONL lines", () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "summaries.jsonl"),
      `${JSON.stringify(makeSummary())}\nNOT_JSON\n${JSON.stringify(makeSummary({ terminalId: "terminal-2" }))}\n`,
      "utf8",
    );
    const store = createAgentMetricsStore(dir);
    const result = store.readSummaries();
    expect(result).toHaveLength(2);
  });

  it("skips entries missing required fields", () => {
    const dir = makeTempDir();
    const bad = { terminalId: "t1", tentacleId: "x" }; // incomplete
    writeFileSync(
      join(dir, "summaries.jsonl"),
      `${JSON.stringify(bad)}\n${JSON.stringify(makeSummary())}\n`,
      "utf8",
    );
    const store = createAgentMetricsStore(dir);
    expect(store.readSummaries()).toHaveLength(1);
  });

  it("skips entries where toolsUsed is not an array", () => {
    const dir = makeTempDir();
    const bad = { ...makeSummary(), toolsUsed: "Bash" }; // string, not array
    writeFileSync(join(dir, "summaries.jsonl"), `${JSON.stringify(bad)}\n`, "utf8");
    const store = createAgentMetricsStore(dir);
    expect(store.readSummaries()).toHaveLength(0);
  });

  it("filters by provider", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", agentProvider: "claude-code" }),
      makeSummary({ terminalId: "t2", agentProvider: "codex" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readSummaries({ provider: "claude-code" });
    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe("t1");
  });

  it("filters by tentacleId", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", tentacleId: "tentacle-a" }),
      makeSummary({ terminalId: "t2", tentacleId: "tentacle-b" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readSummaries({ tentacleId: "tentacle-b" });
    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe("t2");
  });

  it("filters by since timestamp", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "old", startedAt: "2024-01-01T00:00:00.000Z" }),
      makeSummary({ terminalId: "new", startedAt: "2024-12-01T00:00:00.000Z" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readSummaries({ since: "2024-06-01T00:00:00.000Z" });
    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe("new");
  });

  it("skips blank lines in jsonl file", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "summaries.jsonl"), `\n\n${JSON.stringify(makeSummary())}\n\n`, "utf8");
    const store = createAgentMetricsStore(dir);
    expect(store.readSummaries()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// readTerminalSummaries (aggregation per terminal)
// ---------------------------------------------------------------------------

describe("readTerminalSummaries", () => {
  it("returns one entry per terminal when each has only one run", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1" }),
      makeSummary({ terminalId: "t2" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readTerminalSummaries();
    expect(result).toHaveLength(2);
  });

  it("collapses multiple runs for the same terminal", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T10:00:00.000Z",
        endedAt: "2024-06-01T10:01:00.000Z",
        durationMs: 60_000,
        tokenIn: 100,
        tokenOut: 200,
        tokenCostUsd: 0.01,
        idleMs: 10_000,
        processingMs: 50_000,
        errorCount: 0,
        toolsUsed: ["Bash"],
      }),
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T11:00:00.000Z",
        endedAt: "2024-06-01T11:02:00.000Z",
        durationMs: 120_000,
        tokenIn: 300,
        tokenOut: 400,
        tokenCostUsd: 0.02,
        idleMs: 20_000,
        processingMs: 100_000,
        errorCount: 1,
        toolsUsed: ["Read"],
      }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readTerminalSummaries();
    expect(result).toHaveLength(1);
    const agg = result[0];
    if (!agg) throw new Error("expected an aggregate row");
    expect(agg.durationMs).toBe(180_000);
    expect(agg.tokenIn).toBe(400);
    expect(agg.tokenOut).toBe(600);
    expect(agg.tokenCostUsd).toBeCloseTo(0.03);
    expect(agg.idleMs).toBe(30_000);
    expect(agg.processingMs).toBe(150_000);
    expect(agg.errorCount).toBe(1);
    expect(agg.toolsUsed).toContain("Bash");
    expect(agg.toolsUsed).toContain("Read");
  });

  it("uses most recent run for outcome and provider fields", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T10:00:00.000Z",
        outcome: "error",
        agentProvider: "claude-code",
      }),
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T11:00:00.000Z",
        outcome: "success",
        agentProvider: "codex",
      }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readTerminalSummaries();
    expect(result[0]?.outcome).toBe("success");
    expect(result[0]?.agentProvider).toBe("codex");
  });

  it("uses earliest start and latest end across runs", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T11:00:00.000Z",
        endedAt: "2024-06-01T11:30:00.000Z",
      }),
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T10:00:00.000Z",
        endedAt: "2024-06-01T12:00:00.000Z",
      }),
    ]);
    const store = createAgentMetricsStore(dir);
    const result = store.readTerminalSummaries();
    expect(result[0]?.startedAt).toBe("2024-06-01T10:00:00.000Z");
    expect(result[0]?.endedAt).toBe("2024-06-01T12:00:00.000Z");
  });

  it("deduplicates tools used across runs", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", toolsUsed: ["Bash", "Read"] }),
      makeSummary({
        terminalId: "t1",
        startedAt: "2024-06-01T11:00:00.000Z",
        toolsUsed: ["Bash", "Write"],
      }),
    ]);
    const store = createAgentMetricsStore(dir);
    const [agg] = store.readTerminalSummaries();
    const bashCount = agg?.toolsUsed.filter((t) => t === "Bash").length ?? 0;
    expect(bashCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// readSummaryById
// ---------------------------------------------------------------------------

describe("readSummaryById", () => {
  it("returns null when terminal does not exist", () => {
    const dir = makeTempDir();
    const store = createAgentMetricsStore(dir);
    expect(store.readSummaryById("missing")).toBeNull();
  });

  it("returns the aggregated summary for a known terminal", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [makeSummary({ terminalId: "t-known" })]);
    const store = createAgentMetricsStore(dir);
    const result = store.readSummaryById("t-known");
    expect(result).not.toBeNull();
    expect(result?.terminalId).toBe("t-known");
  });
});

// ---------------------------------------------------------------------------
// readEvents
// ---------------------------------------------------------------------------

describe("readEvents", () => {
  it("returns empty array when events file does not exist", () => {
    const dir = makeTempDir();
    const store = createAgentMetricsStore(dir);
    expect(store.readEvents("non-existent-terminal")).toEqual([]);
  });

  it("returns parsed events from the terminal's jsonl file", () => {
    const dir = makeTempDir();
    const event: AgentMetricsEvent = {
      eventId: "t1:1",
      terminalId: "t1",
      tentacleId: "tent1",
      eventType: "state_change",
      timestamp: new Date().toISOString(),
      payload: { from: "idle", to: "processing" },
    };
    writeEventsJsonl(dir, "t1", [event]);
    const store = createAgentMetricsStore(dir);
    const events = store.readEvents("t1");
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("state_change");
  });

  it("URL-encodes the terminalId for the file path", () => {
    const dir = makeTempDir();
    const terminalId = "term/with:special chars";
    const event: AgentMetricsEvent = {
      eventId: "e:1",
      terminalId,
      tentacleId: "t",
      eventType: "token_usage",
      timestamp: new Date().toISOString(),
      payload: { costUsd: 0.01 },
    };
    writeEventsJsonl(dir, terminalId, [event]);
    const store = createAgentMetricsStore(dir);
    const events = store.readEvents(terminalId);
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// readAggregate
// ---------------------------------------------------------------------------

describe("readAggregate", () => {
  it("returns zeroed aggregate when no summaries exist", () => {
    const dir = makeTempDir();
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.totalRuns).toBe(0);
    expect(agg.successCount).toBe(0);
    expect(agg.errorCount).toBe(0);
    expect(agg.stoppedCount).toBe(0);
    expect(agg.successRate).toBe(0);
    expect(agg.avgDurationMs).toBe(0);
    expect(agg.totalTokenIn).toBe(0);
    expect(agg.totalTokenOut).toBe(0);
    expect(agg.totalTokenCostUsd).toBe(0);
    expect(agg.byProvider).toEqual({});
    expect(agg.byTentacleName).toEqual({});
    expect(agg.fetchedAt).toBeTruthy();
  });

  it("counts outcomes correctly", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", outcome: "success" }),
      makeSummary({ terminalId: "t2", outcome: "error" }),
      makeSummary({ terminalId: "t3", outcome: "stopped" }),
      makeSummary({ terminalId: "t4", outcome: "killed" }),
      makeSummary({ terminalId: "t5", outcome: "unknown" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.totalRuns).toBe(5);
    expect(agg.successCount).toBe(1);
    expect(agg.errorCount).toBe(1);
    expect(agg.stoppedCount).toBe(2); // stopped + killed
  });

  it("computes successRate correctly", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", outcome: "success" }),
      makeSummary({ terminalId: "t2", outcome: "success" }),
      makeSummary({ terminalId: "t3", outcome: "error" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.successRate).toBeCloseTo(2 / 3);
  });

  it("sums token counts correctly", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", tokenIn: 100, tokenOut: 200, tokenCostUsd: 0.01 }),
      makeSummary({ terminalId: "t2", tokenIn: 300, tokenOut: 400, tokenCostUsd: 0.02 }),
    ]);
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.totalTokenIn).toBe(400);
    expect(agg.totalTokenOut).toBe(600);
    expect(agg.totalTokenCostUsd).toBeCloseTo(0.03);
  });

  it("computes avgDurationMs", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", durationMs: 60_000 }),
      makeSummary({ terminalId: "t2", durationMs: 120_000 }),
    ]);
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.avgDurationMs).toBe(90_000);
  });

  it("groups stats byProvider", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({
        terminalId: "t1",
        agentProvider: "claude-code",
        outcome: "success",
        durationMs: 60_000,
        tokenCostUsd: 0.01,
      }),
      makeSummary({
        terminalId: "t2",
        agentProvider: "claude-code",
        outcome: "error",
        durationMs: 120_000,
        tokenCostUsd: 0.02,
      }),
      makeSummary({
        terminalId: "t3",
        agentProvider: "codex",
        outcome: "success",
        durationMs: 30_000,
        tokenCostUsd: 0.005,
      }),
    ]);
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.byProvider["claude-code"]?.runs).toBe(2);
    expect(agg.byProvider["claude-code"]?.successCount).toBe(1);
    expect(agg.byProvider["claude-code"]?.errorCount).toBe(1);
    expect(agg.byProvider.codex?.runs).toBe(1);
  });

  it("groups stats byTentacleName", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", tentacleName: "Agent Alpha", outcome: "success" }),
      makeSummary({ terminalId: "t2", tentacleName: "Agent Alpha", outcome: "error" }),
      makeSummary({ terminalId: "t3", tentacleName: "Agent Beta", outcome: "success" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const agg = store.readAggregate();
    expect(agg.byTentacleName["Agent Alpha"]?.runs).toBe(2);
    expect(agg.byTentacleName["Agent Beta"]?.runs).toBe(1);
  });

  it("includes fetchedAt timestamp", () => {
    const dir = makeTempDir();
    const store = createAgentMetricsStore(dir);
    const before = Date.now();
    const agg = store.readAggregate();
    const after = Date.now();
    const fetchedAtMs = new Date(agg.fetchedAt).getTime();
    expect(fetchedAtMs).toBeGreaterThanOrEqual(before);
    expect(fetchedAtMs).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// readHeatmap
// ---------------------------------------------------------------------------

describe("readHeatmap", () => {
  it("returns empty array when no summaries exist", () => {
    const dir = makeTempDir();
    const store = createAgentMetricsStore(dir);
    expect(store.readHeatmap()).toEqual([]);
  });

  it("buckets runs by hour", () => {
    const dir = makeTempDir();
    const recentStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", startedAt: recentStart, outcome: "success" }),
      makeSummary({ terminalId: "t2", startedAt: recentStart, outcome: "error" }),
    ]);
    const store = createAgentMetricsStore(dir);
    const heatmap = store.readHeatmap(7);
    expect(heatmap.length).toBeGreaterThan(0);
    const bucket = heatmap[0];
    if (!bucket) throw new Error("expected a heatmap bucket");
    expect(bucket.runCount).toBe(2);
    expect(bucket.errorCount).toBe(1);
  });

  it("excludes runs older than the cutoff", () => {
    const dir = makeTempDir();
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "old", startedAt: "2020-01-01T00:00:00.000Z" }),
    ]);
    const store = createAgentMetricsStore(dir);
    expect(store.readHeatmap(7)).toEqual([]);
  });

  it("returns results sorted by timestamp ascending", () => {
    const dir = makeTempDir();
    const baseMs = Date.now() - 5 * 60 * 60 * 1000;
    writeSummariesJsonl(dir, [
      makeSummary({ terminalId: "t1", startedAt: new Date(baseMs).toISOString() }),
      makeSummary({
        terminalId: "t2",
        startedAt: new Date(baseMs - 2 * 60 * 60 * 1000).toISOString(),
      }),
    ]);
    const store = createAgentMetricsStore(dir);
    const heatmap = store.readHeatmap(7);
    for (let i = 1; i < heatmap.length; i++) {
      const curr = heatmap[i];
      const prev = heatmap[i - 1];
      if (!curr || !prev) throw new Error("Unexpected undefined heatmap entry");
      expect(curr.timestamp >= prev.timestamp).toBe(true);
    }
  });

  it("counts error events from per-terminal event files", () => {
    const dir = makeTempDir();
    const recentTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const errorEvent: AgentMetricsEvent = {
      eventId: "t1:1",
      terminalId: "t1",
      tentacleId: "tent1",
      eventType: "error_detected",
      timestamp: recentTimestamp,
      payload: { snippet: "Error: something failed" },
    };
    const stateEvent: AgentMetricsEvent = {
      eventId: "t1:2",
      terminalId: "t1",
      tentacleId: "tent1",
      eventType: "state_change",
      timestamp: recentTimestamp,
      payload: { from: "idle", to: "processing" },
    };
    writeEventsJsonl(dir, "t1", [errorEvent, stateEvent]);

    const store = createAgentMetricsStore(dir);
    const heatmap = store.readHeatmap(7);
    const totalErrors = heatmap.reduce((sum, b) => sum + b.errorCount, 0);
    expect(totalErrors).toBeGreaterThanOrEqual(1);
  });

  it("ignores non-error events in per-terminal files for error count", () => {
    const dir = makeTempDir();
    const recentTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const stateEvent: AgentMetricsEvent = {
      eventId: "t1:1",
      terminalId: "t1",
      tentacleId: "tent1",
      eventType: "state_change",
      timestamp: recentTimestamp,
      payload: { from: "idle", to: "processing" },
    };
    writeEventsJsonl(dir, "t1", [stateEvent]);

    const store = createAgentMetricsStore(dir);
    const heatmap = store.readHeatmap(7);
    const totalErrors = heatmap.reduce((sum, b) => sum + b.errorCount, 0);
    expect(totalErrors).toBe(0);
  });

  it("uses custom days window", () => {
    const dir = makeTempDir();
    // 3 days ago — should appear in 7-day window but not 1-day
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    writeSummariesJsonl(dir, [makeSummary({ terminalId: "t1", startedAt: threeDaysAgo })]);
    const store = createAgentMetricsStore(dir);
    expect(store.readHeatmap(7)).toHaveLength(1);
    expect(store.readHeatmap(1)).toHaveLength(0);
  });
});
