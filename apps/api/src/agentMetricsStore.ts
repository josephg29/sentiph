import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

const msOf = (iso: string): number => {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Collapse the append-only run log into one summary per terminal.
 *
 * `summaries.jsonl` records one entry per agent *run*, so a single terminal can
 * appear many times. The observability tables render one row per terminal and key
 * by `terminalId`, so they need a deduplicated, per-terminal view. Cumulative
 * fields (duration, tokens, idle/processing time, error count) are summed across
 * runs; identity and outcome fields come from the most recent run; the run window
 * spans the earliest start to the latest end; tools are unioned.
 */
const aggregateByTerminal = (runs: AgentRunSummary[]): AgentRunSummary[] => {
  const byTerminal = new Map<string, AgentRunSummary>();
  const latestStartMs = new Map<string, number>();

  for (const run of runs) {
    const acc = byTerminal.get(run.terminalId);
    if (!acc) {
      byTerminal.set(run.terminalId, { ...run, toolsUsed: [...new Set(run.toolsUsed)] });
      latestStartMs.set(run.terminalId, msOf(run.startedAt));
      continue;
    }

    const runIsLatest = msOf(run.startedAt) >= (latestStartMs.get(run.terminalId) ?? 0);
    byTerminal.set(run.terminalId, {
      ...acc,
      ...(runIsLatest
        ? {
            tentacleId: run.tentacleId,
            tentacleName: run.tentacleName,
            agentProvider: run.agentProvider,
            outcome: run.outcome,
            exitCode: run.exitCode,
            exitSignal: run.exitSignal,
          }
        : {}),
      startedAt: msOf(run.startedAt) < msOf(acc.startedAt) ? run.startedAt : acc.startedAt,
      endedAt: msOf(run.endedAt) > msOf(acc.endedAt) ? run.endedAt : acc.endedAt,
      durationMs: acc.durationMs + run.durationMs,
      tokenIn: acc.tokenIn + run.tokenIn,
      tokenOut: acc.tokenOut + run.tokenOut,
      tokenCostUsd: acc.tokenCostUsd + run.tokenCostUsd,
      idleMs: acc.idleMs + run.idleMs,
      processingMs: acc.processingMs + run.processingMs,
      errorCount: acc.errorCount + run.errorCount,
      toolsUsed: [...new Set([...acc.toolsUsed, ...run.toolsUsed])],
    });
    if (runIsLatest) {
      latestStartMs.set(run.terminalId, msOf(run.startedAt));
    }
  }

  return [...byTerminal.values()];
};

export type AgentMetricsStore = ReturnType<typeof createAgentMetricsStore>;

export const createAgentMetricsStore = (metricsDir: string) => {
  const summariesPath = join(metricsDir, "summaries.jsonl");

  // The observability surface polls aggregate, summaries, and heatmap on the same
  // interval, each of which previously re-read and re-parsed the full summaries.jsonl.
  // Memoize the parsed log keyed on the file's mtime+size (same invalidation strategy
  // used for git reads) so one poll cycle parses it at most once; any write to the
  // log changes mtime/size and busts the cache.
  let summariesCache: { key: string; summaries: AgentRunSummary[] } | null = null;

  const loadAllSummaries = (): AgentRunSummary[] => {
    let key = "absent";
    try {
      const stat = statSync(summariesPath);
      key = `${stat.mtimeMs}:${stat.size}`;
    } catch {
      // Missing file → stable "absent" key; tryParseJsonl returns [] below.
    }

    if (summariesCache && summariesCache.key === key) {
      return summariesCache.summaries;
    }

    const parsed: AgentRunSummary[] = [];
    for (const item of tryParseJsonl<unknown>(summariesPath)) {
      const summary = parseSummary(item);
      if (summary) {
        parsed.push(summary);
      }
    }
    summariesCache = { key, summaries: parsed };
    return parsed;
  };

  const readSummaries = (opts?: {
    provider?: string;
    tentacleId?: string;
    since?: string;
  }): AgentRunSummary[] => {
    const summaries: AgentRunSummary[] = [];
    const sinceMs = opts?.since ? new Date(opts.since).getTime() : 0;

    for (const summary of loadAllSummaries()) {
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

  // Per-terminal view of the run log (one entry per terminal). Internal callers
  // (readAggregate / readHeatmap) keep using readSummaries for per-run stats.
  const readTerminalSummaries = (opts?: {
    provider?: string;
    tentacleId?: string;
    since?: string;
  }): AgentRunSummary[] => aggregateByTerminal(readSummaries(opts));

  const readSummaryById = (terminalId: string): AgentRunSummary | null =>
    readTerminalSummaries().find((s) => s.terminalId === terminalId) ?? null;

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

  return {
    readSummaries,
    readTerminalSummaries,
    readSummaryById,
    readEvents,
    readAggregate,
    readHeatmap,
  };
};
