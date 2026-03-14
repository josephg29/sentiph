import { useCallback, useEffect, useRef, useState } from "react";

import { buildClaudeUsageUrl } from "../../runtime/runtimeEndpoints";
import { CODEX_USAGE_SCAN_INTERVAL_MS } from "../constants";
import { normalizeClaudeUsageSnapshot } from "../normalizers";
import type { ClaudeUsageSnapshot } from "../types";

const buildFallbackSnapshot = (): ClaudeUsageSnapshot => ({
  status: "error",
  source: "none",
  fetchedAt: new Date().toISOString(),
});

export const useClaudeUsagePolling = () => {
  const [claudeUsageSnapshot, setClaudeUsageSnapshot] = useState<ClaudeUsageSnapshot | null>(null);
  const isInFlightRef = useRef(false);
  const isDisposedRef = useRef(false);

  const syncClaudeUsage = useCallback(async () => {
    if (isDisposedRef.current || isInFlightRef.current) {
      return;
    }
    isInFlightRef.current = true;
    try {
      const response = await fetch(buildClaudeUsageUrl(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to read Claude usage (${response.status})`);
      }

      const parsed = normalizeClaudeUsageSnapshot(await response.json());
      if (!isDisposedRef.current) {
        setClaudeUsageSnapshot(parsed ?? buildFallbackSnapshot());
      }
    } catch {
      if (!isDisposedRef.current) {
        setClaudeUsageSnapshot(buildFallbackSnapshot());
      }
    } finally {
      isInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    isDisposedRef.current = false;

    void syncClaudeUsage();
    const timerId = window.setInterval(() => {
      void syncClaudeUsage();
    }, CODEX_USAGE_SCAN_INTERVAL_MS);

    return () => {
      isDisposedRef.current = true;
      window.clearInterval(timerId);
    };
  }, [syncClaudeUsage]);

  const refresh = useCallback(() => {
    void syncClaudeUsage();
  }, [syncClaudeUsage]);

  return { claudeUsageSnapshot, refreshClaudeUsage: refresh };
};
