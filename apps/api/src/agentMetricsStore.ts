import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type {
  AgentMetricsAggregate,
  AgentMetricsEvent,
  AgentMetricsHeatmapBucket,
  AgentProviderStats,
  AgentRunSummary,
} from "@sentiph/core";

const tryParseJsonl = <T>(filePath: string): T[] => {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const results: T[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        results.push(JSON.parse(trimmed) as T);
      } catch {
        // Skip malformed lines
      }
    }
    return results;
  } catch {
    return [];
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const parseSummary = (raw: unknown): AgentRunSummary | null => {
  if (!isRecord(raw)) {
    return null;
  }

  if (
    typeof raw.terminalId !== "string" ||
    typeof raw.tentacleId !== "string" ||
    typeof raw.tentacleName !== "string" ||
    typeof raw.agentProvider !== "string" ||
    typeof raw.startedAt !== "string" ||
    typeof raw.endedAt !== "string" ||
    typeof raw.durationMs !== "number" ||
    typeof raw.outcome !== "string" ||
    typeof raw.tokenIn !== "number" ||
    typeof raw.tokenOut !== "number" ||
    typeof raw.tokenCostUsd !== "number" ||
    typeof raw.idleMs !== "number" ||
    typeof raw.processingMs !== "number" ||
    typeof raw.errorCount !== "number" ||
    !Array.isArray(raw.toolsUsed)
  ) {
    return null;
  }

  return raw as unknown as AgentRunSummary;
};

const HOUR_MS = 60 * 60 * 1000;

export type AgentMetricsStore = ReturnType<typeof createAgentMetricsStore>;

export const createAgentMetricsStore = (metricsDir: string) => {
  const summariesPath = join(metricsDir, "summaries.jsonl");

  const readSummaries = (opts?: {
    provider?: string;
    tentacleId?: string;
    since?: string;
  }): AgentRunSummary[] => {
    const raw = tryParseJsonl<unknown>(summariesPath);
    const summaries: AgentRunSummary[] = [];
    const sinceMs = opts?.since ? new Date(opts.since).getTime() : 0;

    for (const item of raw) {
      const summary = parseSummary(item);
      if (!summary) {
        continue;
      }
      if (opts?.provider && summary.agentProvider !== opts.provider) {
        continue;
      }
      if (opts?.tentacleId && summary.tentacleId !== opts.tentacleId) {
        continue;
      }
      if (sinceMs > 0 && new Date(summary.startedAt).getTime() < sinceMs) {
        continue;
      }
      summaries.push(summary);
    }

    return summaries;
  };

  const readSummaryById = (terminalId: string): AgentRunSummary | null => {
    const all = readSummaries();
    let last: AgentRunSummary | null = null;
    for (const s of all) {
      if (s.terminalId === terminalId) {
        last = s;
      }
    }
    return last;
  };

  const readEvents = (terminalId: string): AgentMetricsEvent[] => {
    const eventsPath = join(metricsDir, `${encodeURIComponent(terminalId)}.jsonl`);
    return tryParseJsonl<AgentMetricsEvent>(eventsPath);
  };

  const readAggregate = (): AgentMetricsAggregate => {
    const summaries = readSummaries();
    const fetchedAt = new Date().toISOString();

    if (summaries.length === 0) {
      return {
        fetchedAt,
        totalRuns: 0,
        successCount: 0,
        errorCount: 0,
        stoppedCount: 0,
        successRate: 0,
        avgDurationMs: 0,
        totalTokenIn: 0,
        totalTokenOut: 0,
        totalTokenCostUsd: 0,
        byProvider: {},
        byTentacleName: {},
      };
    }

    let successCount = 0;
    let errorCount = 0;
    let stoppedCount = 0;
    let totalDurationMs = 0;
    let totalTokenIn = 0;
    let totalTokenOut = 0;
    let totalTokenCostUsd = 0;
    const byProvider: Record<string, AgentProviderStats> = {};
    const byTentacleName: Record<string, AgentProviderStats> = {};

    const updateStats = (
      map: Record<string, AgentProviderStats>,
      key: string,
      s: AgentRunSummary,
    ) => {
      const existing = map[key] ?? {
        runs: 0,
        successCount: 0,
        errorCount: 0,
        avgDurationMs: 0,
        totalTokenCostUsd: 0,
      };
      const runs = existing.runs + 1;
      map[key] = {
        runs,
        successCount: existing.successCount + (s.outcome === "success" ? 1 : 0),
        errorCount: existing.errorCount + (s.outcome === "error" ? 1 : 0),
        avgDurationMs: (existing.avgDurationMs * existing.runs + s.durationMs) / runs,
        totalTokenCostUsd: existing.totalTokenCostUsd + s.tokenCostUsd,
      };
    };

    for (const s of summaries) {
      if (s.outcome === "success") successCount++;
      else if (s.outcome === "error") errorCount++;
      else if (s.outcome === "stopped" || s.outcome === "killed") stoppedCount++;

      totalDurationMs += s.durationMs;
      totalTokenIn += s.tokenIn;
      totalTokenOut += s.tokenOut;
      totalTokenCostUsd += s.tokenCostUsd;

      updateStats(byProvider, s.agentProvider, s);
      updateStats(byTentacleName, s.tentacleName, s);
    }

    return {
      fetchedAt,
      totalRuns: summaries.length,
      successCount,
      errorCount,
      stoppedCount,
      successRate: summaries.length > 0 ? successCount / summaries.length : 0,
      avgDurationMs: summaries.length > 0 ? totalDurationMs / summaries.length : 0,
      totalTokenIn,
      totalTokenOut,
      totalTokenCostUsd,
      byProvider,
      byTentacleName,
    };
  };

  const readHeatmap = (days = 7): AgentMetricsHeatmapBucket[] => {
    const summaries = readSummaries();
    const nowMs = Date.now();
    const cutoffMs = nowMs - days * 24 * HOUR_MS;

    const buckets = new Map<string, { errorCount: number; runCount: number }>();

    for (const s of summaries) {
      const startMs = new Date(s.startedAt).getTime();
      if (startMs < cutoffMs) {
        continue;
      }

      const hourBucket = new Date(Math.floor(startMs / HOUR_MS) * HOUR_MS).toISOString();
      const existing = buckets.get(hourBucket) ?? { errorCount: 0, runCount: 0 };
      buckets.set(hourBucket, {
        runCount: existing.runCount + 1,
        errorCount: existing.errorCount + (s.outcome === "error" ? 1 : 0),
      });
    }

    // Also scan event files for in-progress errors
    if (existsSync(metricsDir)) {
      try {
        const files = readdirSync(metricsDir).filter(
          (f) => f.endsWith(".jsonl") && f !== "summaries.jsonl",
        );
        for (const file of files) {
          const events = tryParseJsonl<AgentMetricsEvent>(join(metricsDir, file));
          for (const ev of events) {
            if (ev.eventType !== "error_detected") {
              continue;
            }
            const startMs = new Date(ev.timestamp).getTime();
            if (startMs < cutoffMs) {
              continue;
            }
            const hourBucket = new Date(Math.floor(startMs / HOUR_MS) * HOUR_MS).toISOString();
            const existing = buckets.get(hourBucket) ?? { errorCount: 0, runCount: 0 };
            buckets.set(hourBucket, {
              ...existing,
              errorCount: existing.errorCount + 1,
            });
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, counts]) => ({ timestamp, ...counts }));
  };

  return { readSummaries, readSummaryById, readEvents, readAggregate, readHeatmap };
};
