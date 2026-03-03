import type { buildTentacleColumns } from "@octogent/core";
import type { TentacleCompletionSoundId } from "./notificationSounds";

export type TentacleView = Awaited<ReturnType<typeof buildTentacleColumns>>;

export type CodexUsageSnapshot = {
  status: "ok" | "unavailable" | "error";
  fetchedAt: string;
  source: "oauth-api" | "none";
  message?: string | null;
  planType?: string | null;
  primaryUsedPercent?: number | null;
  secondaryUsedPercent?: number | null;
  creditsBalance?: number | null;
  creditsUnlimited?: boolean | null;
};

export type GitHubCommitPoint = {
  date: string;
  count: number;
};

export type GitHubCommitSparkPoint = GitHubCommitPoint & {
  x: number;
  y: number;
};

export type GitHubRepoSummarySnapshot = {
  status: "ok" | "unavailable" | "error";
  fetchedAt: string;
  source: "gh-cli" | "none";
  message?: string | null;
  repo?: string | null;
  stargazerCount?: number | null;
  openIssueCount?: number | null;
  openPullRequestCount?: number | null;
  commitsPerDay?: GitHubCommitPoint[];
};

export type FrontendUiStateSnapshot = {
  isAgentsSidebarVisible?: boolean;
  sidebarWidth?: number;
  isActiveAgentsSectionExpanded?: boolean;
  isCodexUsageSectionExpanded?: boolean;
  tentacleCompletionSound?: TentacleCompletionSoundId;
  minimizedTentacleIds?: string[];
  tentacleWidths?: Record<string, number>;
};

export type TentacleWorkspaceMode = "shared" | "worktree";

export type MonitorUsageSnapshot = {
  status: "ok" | "unavailable" | "error";
  source: "x-api" | "none";
  fetchedAt: string;
  message?: string | null;
  cap?: number | null;
  used?: number | null;
  remaining?: number | null;
  resetAt?: string | null;
};

export type MonitorPost = {
  source: "x";
  id: string;
  text: string;
  author: string;
  createdAt: string;
  likeCount: number;
  permalink: string;
  matchedQueryTerm: string | null;
};

export type MonitorCredentialsSummary = {
  isConfigured: boolean;
  bearerTokenHint: string | null;
  apiKeyHint: string | null;
  hasApiSecret: boolean;
  hasAccessToken: boolean;
  hasAccessTokenSecret: boolean;
  updatedAt: string | null;
};

export type MonitorConfigSnapshot = {
  providerId: "x";
  queryTerms: string[];
  refreshPolicy: {
    maxCacheAgeMs: number;
    maxPosts: number;
    searchWindowDays: 1 | 3 | 7;
  };
  providers: {
    x: {
      credentials: MonitorCredentialsSummary;
    };
  };
};

export type MonitorFeedSnapshot = {
  providerId: "x";
  queryTerms: string[];
  refreshPolicy: {
    maxCacheAgeMs: number;
    maxPosts: number;
    searchWindowDays: 1 | 3 | 7;
  };
  lastFetchedAt: string | null;
  staleAfter: string | null;
  isStale: boolean;
  lastError: string | null;
  posts: MonitorPost[];
  usage: MonitorUsageSnapshot | null;
};
