import { useCallback, useEffect, useRef, useState } from "react";

import { buildUsageHeatmapUrl } from "../../runtime/runtimeEndpoints";

export type UsageHeatmapDay = {
  date: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  sessions: number;
};

export type UsageHeatmapData = {
  days: UsageHeatmapDay[];
  scope: "all" | "project";
  projectSlug: string | null;
};

const POLL_INTERVAL_MS = 120_000;

export const useUsageHeatmapPolling = (options: { enabled: boolean }) => {
  const [heatmapData, setHeatmapData] = useState<UsageHeatmapData | null>(null);
  const [heatmapScope, setHeatmapScope] = useState<"all" | "project">("project");
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const isInFlightRef = useRef(false);
  const isDisposedRef = useRef(false);

  const fetchHeatmap = useCallback(async (scope: "all" | "project") => {
    if (isDisposedRef.current || isInFlightRef.current) return;
    isInFlightRef.current = true;
    setIsLoadingHeatmap(true);

    try {
      const response = await fetch(buildUsageHeatmapUrl(scope), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Usage heatmap request failed (${response.status})`);
      }

      const parsed = (await response.json()) as UsageHeatmapData;
      if (!isDisposedRef.current) {
        setHeatmapData(parsed);
      }
    } catch {
      // silently ignore — data will remain null/stale
    } finally {
      isInFlightRef.current = false;
      if (!isDisposedRef.current) {
        setIsLoadingHeatmap(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!options.enabled) return;
    isDisposedRef.current = false;

    void fetchHeatmap(heatmapScope);
    const timerId = window.setInterval(() => {
      void fetchHeatmap(heatmapScope);
    }, POLL_INTERVAL_MS);

    return () => {
      isDisposedRef.current = true;
      window.clearInterval(timerId);
    };
  }, [options.enabled, heatmapScope, fetchHeatmap]);

  const changeScope = useCallback(
    (scope: "all" | "project") => {
      setHeatmapScope(scope);
      void fetchHeatmap(scope);
    },
    [fetchHeatmap],
  );

  const refresh = useCallback(() => {
    void fetchHeatmap(heatmapScope);
  }, [fetchHeatmap, heatmapScope]);

  return {
    heatmapData,
    heatmapScope,
    isLoadingHeatmap,
    changeHeatmapScope: changeScope,
    refreshHeatmap: refresh,
  };
};
