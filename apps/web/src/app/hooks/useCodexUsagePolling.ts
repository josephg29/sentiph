import { useEffect, useState } from "react";

import { buildCodexUsageUrl } from "../../runtime/runtimeEndpoints";
import { CODEX_USAGE_SCAN_INTERVAL_MS } from "../constants";
import { normalizeCodexUsageSnapshot } from "../normalizers";
import type { CodexUsageSnapshot } from "../types";

const buildFallbackSnapshot = (): CodexUsageSnapshot => ({
  status: "error",
  source: "none",
  fetchedAt: new Date().toISOString(),
});

export const useCodexUsagePolling = () => {
  const [codexUsageSnapshot, setCodexUsageSnapshot] = useState<CodexUsageSnapshot | null>(null);

  useEffect(() => {
    let isDisposed = false;
    let isInFlight = false;

    const syncCodexUsage = async () => {
      if (isDisposed || isInFlight) {
        return;
      }
      isInFlight = true;
      try {
        const response = await fetch(buildCodexUsageUrl(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Unable to read codex usage (${response.status})`);
        }

        const parsed = normalizeCodexUsageSnapshot(await response.json());
        if (!isDisposed) {
          setCodexUsageSnapshot(parsed ?? buildFallbackSnapshot());
        }
      } catch {
        if (!isDisposed) {
          setCodexUsageSnapshot(buildFallbackSnapshot());
        }
      } finally {
        isInFlight = false;
      }
    };

    void syncCodexUsage();
    const timerId = window.setInterval(() => {
      void syncCodexUsage();
    }, CODEX_USAGE_SCAN_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(timerId);
    };
  }, []);

  return codexUsageSnapshot;
};
