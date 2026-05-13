export type AgentMetricsEventType =
  | "state_change"
  | "token_usage"
  | "tool_invocation"
  | "error_detected";

export type AgentMetricsEvent = {
  eventId: string;
  terminalId: string;
  tentacleId: string;
  eventType: AgentMetricsEventType;
  timestamp: string;
  payload: Record<string, unknown>;
};

export type AgentRunOutcome = "success" | "error" | "stopped" | "killed" | "unknown";

export type AgentRunSummary = {
  terminalId: string;
  tentacleId: string;
  tentacleName: string;
  agentProvider: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode?: number;
  exitSignal?: number | string;
  outcome: AgentRunOutcome;
  tokenIn: number;
  tokenOut: number;
  tokenCostUsd: number;
  idleMs: number;
  processingMs: number;
  errorCount: number;
  toolsUsed: string[];
};

export type AgentProviderStats = {
  runs: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  totalTokenCostUsd: number;
};

export type AgentMetricsAggregate = {
  fetchedAt: string;
  totalRuns: number;
  successCount: number;
  errorCount: number;
  stoppedCount: number;
  successRate: number;
  avgDurationMs: number;
  totalTokenIn: number;
  totalTokenOut: number;
  totalTokenCostUsd: number;
  byProvider: Record<string, AgentProviderStats>;
  byTentacleName: Record<string, AgentProviderStats>;
};

export type AgentMetricsHeatmapBucket = {
  timestamp: string;
  errorCount: number;
  runCount: number;
};
