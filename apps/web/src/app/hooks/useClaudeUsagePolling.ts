import { useEffect, useState } from "react";

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

  useEffect(() => {
    let isDisposed = false;
    let isInFlight = false;

    const syncClaudeUsage = async () => {
      if (isDisposed || isInFlight) {
        return;
      }
      isInFlight = true;
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
        if (!isDisposed) {
          setClaudeUsageSnapshot(parsed ?? buildFallbackSnapshot());
        }
      } catch {
        if (!isDisposed) {
          setClaudeUsageSnapshot(buildFallbackSnapshot());
        }
      } finally {
        isInFlight = false;
      }
    };

    void syncClaudeUsage();
    const timerId = window.setInterval(() => {
      void syncClaudeUsage();
    }, CODEX_USAGE_SCAN_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(timerId);
    };
  }, []);

  return claudeUsageSnapshot;
};
