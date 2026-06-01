type LocationLike = Pick<Location, "host" | "protocol">;

const readRuntimeBaseUrl = (): string | null => {
  const value = import.meta.env.VITE_SENTIPH_API_ORIGIN;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const withTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);

const buildAbsoluteUrl = (baseUrl: string, pathname: string) => {
  const normalizedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return new URL(normalizedPath, withTrailingSlash(baseUrl)).toString();
};

const localWebSocketUrl = (location: LocationLike, tentacleId: string) => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/terminals/${tentacleId}/ws`;
};

const localRuntimeWebSocketUrl = (location: LocationLike, pathname: string) => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}${pathname}`;
};

const toWebSocketBase = (runtimeBaseUrl: string): string | null => {
  try {
    const url = new URL(runtimeBaseUrl);
    if (url.protocol === "https:") {
      url.protocol = "wss:";
      return url.toString();
    }
    if (url.protocol === "http:") {
      url.protocol = "ws:";
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
};

export const buildTerminalSnapshotsUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/terminal-snapshots";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/terminal-snapshots");
};

export const buildTerminalEventsSocketUrl = (
  runtimeBaseUrl = readRuntimeBaseUrl(),
  location: LocationLike = window.location,
) => {
  if (!runtimeBaseUrl) {
    return localRuntimeWebSocketUrl(location, "/api/terminal-events/ws");
  }

  const websocketBase = toWebSocketBase(runtimeBaseUrl);
  if (!websocketBase) {
    return localRuntimeWebSocketUrl(location, "/api/terminal-events/ws");
  }

  return buildAbsoluteUrl(websocketBase, "/api/terminal-events/ws");
};

export const buildTerminalsUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/terminals";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/terminals");
};

export const buildCodexUsageUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/codex/usage";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/codex/usage");
};

export const buildClaudeUsageUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/claude/usage";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/claude/usage");
};

export const buildGithubSummaryUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/github/summary";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/github/summary");
};

export const buildUiStateUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/ui-state";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/ui-state");
};

export const buildUsageHeatmapUrl = (
  scope: "all" | "project" = "all",
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const path = `/api/analytics/usage-heatmap?scope=${scope}`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildConversationsUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/conversations";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/conversations");
};

const buildConversationSearchUrl = (query: string, runtimeBaseUrl = readRuntimeBaseUrl()) => {
  const path = `/api/conversations/search?q=${encodeURIComponent(query)}`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildConversationSessionUrl = (
  sessionId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const encodedSessionId = encodeURIComponent(sessionId);
  const path = `/api/conversations/${encodedSessionId}`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildConversationExportUrl = (
  sessionId: string,
  format: "json" | "md",
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const encodedSessionId = encodeURIComponent(sessionId);
  const path = `/api/conversations/${encodedSessionId}/export?format=${format}`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildTentacleRenameUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const encodedTentacleId = encodeURIComponent(tentacleId);
  if (!runtimeBaseUrl) {
    return `/api/tentacles/${encodedTentacleId}`;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, `/api/tentacles/${encodedTentacleId}`);
};

const buildTentacleGitActionUrl = (
  tentacleId: string,
  action: "status" | "commit" | "push" | "sync",
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const encodedTentacleId = encodeURIComponent(tentacleId);
  const path = `/api/tentacles/${encodedTentacleId}/git/${action}`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildTentacleGitStatusUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => buildTentacleGitActionUrl(tentacleId, "status", runtimeBaseUrl);

export const buildTentacleGitCommitUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => buildTentacleGitActionUrl(tentacleId, "commit", runtimeBaseUrl);

export const buildTentacleGitPushUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => buildTentacleGitActionUrl(tentacleId, "push", runtimeBaseUrl);

export const buildTentacleGitSyncUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => buildTentacleGitActionUrl(tentacleId, "sync", runtimeBaseUrl);

export const buildTentacleGitPullRequestUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const encodedTentacleId = encodeURIComponent(tentacleId);
  const path = `/api/tentacles/${encodedTentacleId}/git/pr`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildTentacleGitPullRequestMergeUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const encodedTentacleId = encodeURIComponent(tentacleId);
  const path = `/api/tentacles/${encodedTentacleId}/git/pr/merge`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildMetricsAggregateUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/metrics/aggregate";
  }
  return buildAbsoluteUrl(runtimeBaseUrl, "/api/metrics/aggregate");
};

export const buildMetricsHeatmapUrl = (days = 7, runtimeBaseUrl = readRuntimeBaseUrl()) => {
  const path = `/api/metrics/heatmap?days=${days}`;
  if (!runtimeBaseUrl) {
    return path;
  }
  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildMetricsSummariesUrl = (
  opts?: { provider?: string; tentacleId?: string; since?: string },
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const params = new URLSearchParams();
  if (opts?.provider) params.set("provider", opts.provider);
  if (opts?.tentacleId) params.set("tentacleId", opts.tentacleId);
  if (opts?.since) params.set("since", opts.since);
  const qs = params.toString();
  const path = `/api/metrics/summaries${qs ? `?${qs}` : ""}`;
  if (!runtimeBaseUrl) {
    return path;
  }
  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildMetricsEventsUrl = (
  terminalId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
) => {
  const path = `/api/metrics/events/${encodeURIComponent(terminalId)}`;
  if (!runtimeBaseUrl) {
    return path;
  }
  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

const buildPromptsUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/prompts";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/prompts");
};

const buildPromptItemUrl = (name: string, runtimeBaseUrl = readRuntimeBaseUrl()) => {
  const encodedName = encodeURIComponent(name);
  const path = `/api/prompts/${encodedName}`;
  if (!runtimeBaseUrl) {
    return path;
  }

  return buildAbsoluteUrl(runtimeBaseUrl, path);
};

export const buildTerminalSocketUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
  location: LocationLike = window.location,
) => {
  const encodedTentacleId = encodeURIComponent(tentacleId);
  if (!runtimeBaseUrl) {
    return localWebSocketUrl(location, encodedTentacleId);
  }

  const webSocketBase = toWebSocketBase(runtimeBaseUrl);
  if (!webSocketBase) {
    return localWebSocketUrl(location, encodedTentacleId);
  }

  return buildAbsoluteUrl(webSocketBase, `/api/terminals/${encodedTentacleId}/ws`);
};
