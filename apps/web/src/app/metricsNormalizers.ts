import type {
  AgentMetricsAggregate,
  AgentMetricsEvent,
  AgentMetricsHeatmapBucket,
  AgentRunSummary,
} from "@sentiph/core";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export const normalizeAgentRunSummary = (raw: unknown): AgentRunSummary | null => {
  if (!isRecord(raw)) return null;
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

export const normalizeAgentRunSummaries = (raw: unknown): AgentRunSummary[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAgentRunSummary).filter((s): s is AgentRunSummary => s !== null);
};

export const normalizeAgentMetricsAggregate = (raw: unknown): AgentMetricsAggregate | null => {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.fetchedAt !== "string" ||
    typeof raw.totalRuns !== "number" ||
    typeof raw.successCount !== "number" ||
    typeof raw.errorCount !== "number" ||
    typeof raw.stoppedCount !== "number" ||
    typeof raw.successRate !== "number" ||
    typeof raw.avgDurationMs !== "number" ||
    typeof raw.totalTokenIn !== "number" ||
    typeof raw.totalTokenOut !== "number" ||
    typeof raw.totalTokenCostUsd !== "number"
  ) {
    return null;
  }
  return raw as unknown as AgentMetricsAggregate;
};

export const normalizeAgentMetricsHeatmap = (raw: unknown): AgentMetricsHeatmapBucket[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is AgentMetricsHeatmapBucket =>
        isRecord(item) &&
        typeof item.timestamp === "string" &&
        typeof item.errorCount === "number" &&
        typeof item.runCount === "number",
    );
};

export const normalizeAgentMetricsEvents = (raw: unknown): AgentMetricsEvent[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is AgentMetricsEvent =>
      isRecord(item) &&
      typeof item.eventId === "string" &&
      typeof item.terminalId === "string" &&
      typeof item.eventType === "string" &&
      typeof item.timestamp === "string",
  );
};
