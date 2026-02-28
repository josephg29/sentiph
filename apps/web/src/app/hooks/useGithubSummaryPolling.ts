import { useCallback, useEffect, useRef, useState } from "react";

import { buildGithubSummaryUrl } from "../../runtime/runtimeEndpoints";
import { GITHUB_SUMMARY_SCAN_INTERVAL_MS } from "../constants";
import { normalizeGitHubRepoSummarySnapshot } from "../normalizers";
import type { GitHubRepoSummarySnapshot } from "../types";

type GithubSummaryPollingResult = {
  githubRepoSummary: GitHubRepoSummarySnapshot | null;
  isRefreshingGitHubSummary: boolean;
  refreshGitHubRepoSummary: () => Promise<void>;
};

const buildFallbackSummary = (message: string): GitHubRepoSummarySnapshot => ({
  status: "error",
  source: "none",
  fetchedAt: new Date().toISOString(),
  message,
  commitsPerDay: [],
});

export const useGithubSummaryPolling = (): GithubSummaryPollingResult => {
  const [githubRepoSummary, setGithubRepoSummary] = useState<GitHubRepoSummarySnapshot | null>(
    null,
  );
  const [isRefreshingGitHubSummary, setIsRefreshingGitHubSummary] = useState(false);
  const githubSummaryInFlightRef = useRef(false);

  const refreshGitHubRepoSummary = useCallback(async () => {
    if (githubSummaryInFlightRef.current) {
      return;
    }

    githubSummaryInFlightRef.current = true;
    setIsRefreshingGitHubSummary(true);
    try {
      const response = await fetch(buildGithubSummaryUrl(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to read github summary (${response.status})`);
      }

      const parsed = normalizeGitHubRepoSummarySnapshot(await response.json());
      setGithubRepoSummary(parsed ?? buildFallbackSummary("GitHub summary payload is invalid."));
    } catch {
      setGithubRepoSummary(buildFallbackSummary("Unable to read GitHub summary."));
    } finally {
      githubSummaryInFlightRef.current = false;
      setIsRefreshingGitHubSummary(false);
    }
  }, []);

  useEffect(() => {
    void refreshGitHubRepoSummary();
    const timerId = window.setInterval(() => {
      void refreshGitHubRepoSummary();
    }, GITHUB_SUMMARY_SCAN_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [refreshGitHubRepoSummary]);

  return {
    githubRepoSummary,
    isRefreshingGitHubSummary,
    refreshGitHubRepoSummary,
  };
};
