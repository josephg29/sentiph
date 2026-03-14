import { useCallback, useEffect, useRef, useState } from "react";

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
  const isInFlightRef = useRef(false);
  const isDisposedRef = useRef(false);

  const syncCodexUsage = useCallback(async () => {
    if (isDisposedRef.current || isInFlightRef.current) {
      return;
    }
    isInFlightRef.current = true;
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
      if (!isDisposedRef.current) {
        setCodexUsageSnapshot(parsed ?? buildFallbackSnapshot());
      }
    } catch {
      if (!isDisposedRef.current) {
        setCodexUsageSnapshot(buildFallbackSnapshot());
      }
    } finally {
      isInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    isDisposedRef.current = false;

    void syncCodexUsage();
    const timerId = window.setInterval(() => {
      void syncCodexUsage();
    }, CODEX_USAGE_SCAN_INTERVAL_MS);

    return () => {
      isDisposedRef.current = true;
      window.clearInterval(timerId);
    };
  }, [syncCodexUsage]);

  const refresh = useCallback(() => {
    void syncCodexUsage();
  }, [syncCodexUsage]);

  return { codexUsageSnapshot, refreshCodexUsage: refresh };
};
