import { buildClaudeUsageUrl } from "../../runtime/runtimeEndpoints";
import { CODEX_USAGE_SCAN_INTERVAL_MS } from "../constants";
import { normalizeClaudeUsageSnapshot } from "../usageNormalizers";
import type { ClaudeUsageSnapshot } from "../types";
import { usePollingData } from "./usePollingData";

const fallback = (): ClaudeUsageSnapshot => ({
  status: "error",
  source: "none",
  fetchedAt: new Date().toISOString(),
});

export const useClaudeUsagePolling = () => {
  const { data, refresh } = usePollingData<ClaudeUsageSnapshot>({
    fetchUrl: buildClaudeUsageUrl(),
    intervalMs: CODEX_USAGE_SCAN_INTERVAL_MS,
    normalize: normalizeClaudeUsageSnapshot,
    fallback,
  });

  return { claudeUsageSnapshot: data, refreshClaudeUsage: refresh };
};
