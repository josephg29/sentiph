import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./constants";
import type {
  CodexUsageSnapshot,
  FrontendUiStateSnapshot,
  GitHubCommitPoint,
  GitHubRepoSummarySnapshot,
  MonitorConfigSnapshot,
  MonitorFeedSnapshot,
  MonitorPost,
  MonitorUsageSnapshot,
} from "./types";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

export const clampSidebarWidth = (width: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

export const normalizeCodexUsageSnapshot = (value: unknown): CodexUsageSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = record.status;
  if (status !== "ok" && status !== "unavailable" && status !== "error") {
    return null;
  }

  const source = record.source === "oauth-api" ? "oauth-api" : "none";
  return {
    status,
    source,
    fetchedAt: asString(record.fetchedAt) ?? new Date().toISOString(),
    message: asString(record.message),
    planType: asString(record.planType),
    primaryUsedPercent: asNumber(record.primaryUsedPercent),
    secondaryUsedPercent: asNumber(record.secondaryUsedPercent),
    creditsBalance: asNumber(record.creditsBalance),
    creditsUnlimited: typeof record.creditsUnlimited === "boolean" ? record.creditsUnlimited : null,
  };
};

const normalizeGitHubCommitPoint = (value: unknown): GitHubCommitPoint | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const date = asString(record.date);
  const count = asNumber(record.count);
  if (!date || count === null) {
    return null;
  }

  return {
    date,
    count: Math.max(0, Math.round(count)),
  };
};

export const normalizeGitHubRepoSummarySnapshot = (
  value: unknown,
): GitHubRepoSummarySnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = record.status;
  if (status !== "ok" && status !== "unavailable" && status !== "error") {
    return null;
  }

  const rawCommitsPerDay = Array.isArray(record.commitsPerDay) ? record.commitsPerDay : [];
  const commitsPerDay = rawCommitsPerDay
    .map((point) => normalizeGitHubCommitPoint(point))
    .filter((point): point is GitHubCommitPoint => point !== null);

  return {
    status,
    source: record.source === "gh-cli" ? "gh-cli" : "none",
    fetchedAt: asString(record.fetchedAt) ?? new Date().toISOString(),
    message: asString(record.message),
    repo: asString(record.repo),
    stargazerCount: asNumber(record.stargazerCount),
    openIssueCount: asNumber(record.openIssueCount),
    openPullRequestCount: asNumber(record.openPullRequestCount),
    commitsPerDay,
  };
};

export const normalizeFrontendUiStateSnapshot = (
  value: unknown,
): FrontendUiStateSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const nextState: FrontendUiStateSnapshot = {};
  if (typeof record.isAgentsSidebarVisible === "boolean") {
    nextState.isAgentsSidebarVisible = record.isAgentsSidebarVisible;
  }

  if (typeof record.sidebarWidth === "number" && Number.isFinite(record.sidebarWidth)) {
    nextState.sidebarWidth = clampSidebarWidth(record.sidebarWidth);
  }

  if (typeof record.isActiveAgentsSectionExpanded === "boolean") {
    nextState.isActiveAgentsSectionExpanded = record.isActiveAgentsSectionExpanded;
  }

  if (typeof record.isCodexUsageSectionExpanded === "boolean") {
    nextState.isCodexUsageSectionExpanded = record.isCodexUsageSectionExpanded;
  }

  if (Array.isArray(record.minimizedTentacleIds)) {
    nextState.minimizedTentacleIds = [...new Set(record.minimizedTentacleIds)].filter(
      (tentacleId): tentacleId is string => typeof tentacleId === "string",
    );
  }

  const rawTentacleWidths = asRecord(record.tentacleWidths);
  if (rawTentacleWidths) {
    nextState.tentacleWidths = Object.entries(rawTentacleWidths).reduce<Record<string, number>>(
      (acc, [tentacleId, width]) => {
        if (typeof width === "number" && Number.isFinite(width)) {
          acc[tentacleId] = width;
        }
        return acc;
      },
      {},
    );
  }

  return nextState;
};

const normalizeMonitorUsageSnapshot = (value: unknown): MonitorUsageSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = record.status;
  if (status !== "ok" && status !== "unavailable" && status !== "error") {
    return null;
  }

  return {
    status,
    source: record.source === "x-api" ? "x-api" : "none",
    fetchedAt: asString(record.fetchedAt) ?? new Date().toISOString(),
    message: asString(record.message),
    cap: asNumber(record.cap),
    used: asNumber(record.used),
    remaining: asNumber(record.remaining),
    resetAt: asString(record.resetAt),
  };
};

const normalizeMonitorPost = (value: unknown): MonitorPost | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const text = asString(record.text);
  const author = asString(record.author);
  const createdAt = asString(record.createdAt);
  const permalink = asString(record.permalink);
  const likeCount = asNumber(record.likeCount);

  if (!id || !text || !author || !createdAt || !permalink || likeCount === null) {
    return null;
  }

  return {
    source: "x",
    id,
    text,
    author,
    createdAt,
    permalink,
    likeCount: Math.max(0, Math.floor(likeCount)),
  };
};

export const normalizeMonitorConfigSnapshot = (value: unknown): MonitorConfigSnapshot | null => {
  const record = asRecord(value);
  if (!record || record.providerId !== "x") {
    return null;
  }

  const queryTerms = Array.isArray(record.queryTerms)
    ? record.queryTerms.filter((term): term is string => typeof term === "string")
    : [];
  const refreshPolicy = asRecord(record.refreshPolicy);
  const providers = asRecord(record.providers);
  const xProvider = providers ? asRecord(providers.x) : null;
  const credentials = xProvider ? asRecord(xProvider.credentials) : null;
  if (!credentials) {
    return null;
  }

  return {
    providerId: "x",
    queryTerms,
    refreshPolicy: {
      maxCacheAgeMs: asNumber(refreshPolicy?.maxCacheAgeMs) ?? 24 * 60 * 60 * 1000,
    },
    providers: {
      x: {
        credentials: {
          isConfigured: credentials.isConfigured === true,
          bearerTokenHint: asString(credentials.bearerTokenHint),
          apiKeyHint: asString(credentials.apiKeyHint),
          hasApiSecret: credentials.hasApiSecret === true,
          hasAccessToken: credentials.hasAccessToken === true,
          hasAccessTokenSecret: credentials.hasAccessTokenSecret === true,
          updatedAt: asString(credentials.updatedAt),
        },
      },
    },
  };
};

export const normalizeMonitorFeedSnapshot = (value: unknown): MonitorFeedSnapshot | null => {
  const record = asRecord(value);
  if (!record || record.providerId !== "x") {
    return null;
  }

  const queryTerms = Array.isArray(record.queryTerms)
    ? record.queryTerms.filter((term): term is string => typeof term === "string")
    : [];
  const refreshPolicy = asRecord(record.refreshPolicy);
  const posts = Array.isArray(record.posts)
    ? record.posts
        .map((post) => normalizeMonitorPost(post))
        .filter((post): post is MonitorPost => post !== null)
    : [];

  return {
    providerId: "x",
    queryTerms,
    refreshPolicy: {
      maxCacheAgeMs: asNumber(refreshPolicy?.maxCacheAgeMs) ?? 24 * 60 * 60 * 1000,
    },
    lastFetchedAt: asString(record.lastFetchedAt),
    staleAfter: asString(record.staleAfter),
    isStale: record.isStale === true,
    lastError: asString(record.lastError),
    posts,
    usage: normalizeMonitorUsageSnapshot(record.usage),
  };
};
