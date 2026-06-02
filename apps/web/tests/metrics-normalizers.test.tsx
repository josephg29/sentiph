import { describe, expect, it } from "vitest";

import {
  normalizeAgentMetricsAggregate,
  normalizeAgentMetricsEvents,
  normalizeAgentMetricsHeatmap,
  normalizeAgentRunSummaries,
} from "../src/app/metricsNormalizers";

const validSummary = {
  terminalId: "t1",
  tentacleId: "te1",
  tentacleName: "Agent",
  agentProvider: "claude",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:01:00.000Z",
  durationMs: 60000,
  outcome: "success",
  tokenIn: 10,
  tokenOut: 20,
  tokenCostUsd: 0.01,
  idleMs: 0,
  processingMs: 60000,
  errorCount: 0,
  toolsUsed: [],
};

describe("normalizeAgentRunSummaries", () => {
  it("returns [] for non-array input", () => {
    expect(normalizeAgentRunSummaries(null)).toEqual([]);
    expect(normalizeAgentRunSummaries({})).toEqual([]);
  });

  it("keeps valid entries and drops malformed ones", () => {
    const result = normalizeAgentRunSummaries([validSummary, { terminalId: "x" }, null]);
    expect(result).toHaveLength(1);
    expect(result[0]?.terminalId).toBe("t1");
  });
});

describe("normalizeAgentMetricsAggregate", () => {
  it("returns null for non-object or missing fields", () => {
    expect(normalizeAgentMetricsAggregate(null)).toBeNull();
    expect(normalizeAgentMetricsAggregate({ totalRuns: 1 })).toBeNull();
  });

  it("accepts a fully-formed aggregate", () => {
    const agg = {
      fetchedAt: "2026-01-01T00:00:00.000Z",
      totalRuns: 2,
      successCount: 1,
      errorCount: 1,
      stoppedCount: 0,
      successRate: 0.5,
      avgDurationMs: 100,
      totalTokenIn: 5,
      totalTokenOut: 6,
      totalTokenCostUsd: 0.5,
    };
    expect(normalizeAgentMetricsAggregate(agg)).toEqual(agg);
  });
});

describe("normalizeAgentMetricsHeatmap", () => {
  it("filters to well-formed buckets", () => {
    const result = normalizeAgentMetricsHeatmap([
      { timestamp: "2026-01-01T00:00:00.000Z", errorCount: 0, runCount: 3 },
      { timestamp: 5, errorCount: 0, runCount: 3 },
      "nope",
    ]);
    expect(result).toHaveLength(1);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeAgentMetricsHeatmap(null)).toEqual([]);
  });
});

describe("normalizeAgentMetricsEvents", () => {
  it("filters to well-formed events", () => {
    const result = normalizeAgentMetricsEvents([
      {
        eventId: "e1",
        terminalId: "t1",
        eventType: "state",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      { eventId: "e2" },
    ]);
    expect(result).toHaveLength(1);
  });
});
