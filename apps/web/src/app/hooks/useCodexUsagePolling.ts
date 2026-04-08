import { buildCodexUsageUrl } from "../../runtime/runtimeEndpoints";
import { CODEX_USAGE_SCAN_INTERVAL_MS } from "../constants";
import { normalizeCodexUsageSnapshot } from "../usageNormalizers";
import type { CodexUsageSnapshot } from "../types";
import { usePollingData } from "./usePollingData";

const fallback = (): CodexUsageSnapshot => ({
  status: "error",
  source: "none",
  fetchedAt: new Date().toISOString(),
});

export const useCodexUsagePolling = () => {
  const { data, refresh } = usePollingData<CodexUsageSnapshot>({
    fetchUrl: buildCodexUsageUrl(),
    intervalMs: CODEX_USAGE_SCAN_INTERVAL_MS,
    normalize: normalizeCodexUsageSnapshot,
    fallback,
  });

  return { codexUsageSnapshot: data, refreshCodexUsage: refresh };
};
