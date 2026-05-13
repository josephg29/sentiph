import { useCallback, useEffect, useState } from "react";

import type {
  AgentMetricsAggregate,
  AgentMetricsEvent,
  AgentMetricsHeatmapBucket,
  AgentRunSummary,
} from "@octogent/core";

import {
  buildMetricsAggregateUrl,
  buildMetricsEventsUrl,
  buildMetricsHeatmapUrl,
  buildMetricsSummariesUrl,
} from "../../runtime/runtimeEndpoints";
import {
  normalizeAgentMetricsAggregate,
  normalizeAgentMetricsEvents,
  normalizeAgentMetricsHeatmap,
  normalizeAgentRunSummaries,
} from "../metricsNormalizers";
import { usePollingData } from "./usePollingData";

const METRICS_POLL_INTERVAL_MS = 15_000;

const nullFallback = () => null;

export const useMetricsAggregatePolling = (enabled = true) => {
  const { data, isLoading, refresh } = usePollingData<AgentMetricsAggregate | null>({
    fetchUrl: buildMetricsAggregateUrl(),
    intervalMs: METRICS_POLL_INTERVAL_MS,
    normalize: normalizeAgentMetricsAggregate,
    fallback: nullFallback,
    enabled,
  });

  return { aggregate: data ?? null, isLoadingAggregate: isLoading, refreshAggregate: refresh };
};

export const useMetricsSummariesPolling = (enabled = true) => {
  const { data, isLoading, refresh } = usePollingData<AgentRunSummary[]>({
    fetchUrl: buildMetricsSummariesUrl(),
    intervalMs: METRICS_POLL_INTERVAL_MS,
    normalize: normalizeAgentRunSummaries,
    fallback: () => [],
    enabled,
  });

  return { summaries: data ?? [], isLoadingSummaries: isLoading, refreshSummaries: refresh };
};

export const useMetricsHeatmapPolling = (days = 7, enabled = true) => {
  const { data, isLoading, refresh } = usePollingData<AgentMetricsHeatmapBucket[]>({
    fetchUrl: buildMetricsHeatmapUrl(days),
    intervalMs: METRICS_POLL_INTERVAL_MS,
    normalize: normalizeAgentMetricsHeatmap,
    fallback: () => [],
    enabled,
  });

  return { heatmap: data ?? [], isLoadingHeatmap: isLoading, refreshHeatmap: refresh };
};

export const useMetricsEvents = (terminalId: string | null) => {
  const [events, setEvents] = useState<AgentMetricsEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const res = await globalThis.fetch(buildMetricsEventsUrl(id), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = normalizeAgentMetricsEvents(await res.json());
      setEvents(payload);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!terminalId) {
      setEvents([]);
      return;
    }
    void fetch(terminalId);
  }, [terminalId, fetch]);

  return { events, isLoadingEvents: isLoading };
};
