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

export type ClaudeUsageSnapshot = {
  status: "ok" | "unavailable" | "error";
  fetchedAt: string;
  source: "cli-pty" | "oauth-api" | "none";
  message?: string | null;
  planType?: string | null;
  primaryUsedPercent?: number | null;
  primaryResetAt?: string | null;
  secondaryUsedPercent?: number | null;
  secondaryResetAt?: string | null;
  sonnetUsedPercent?: number | null;
  sonnetResetAt?: string | null;
  extraUsageCostUsed?: number | null;
  extraUsageCostLimit?: number | null;
};

export type GitHubCommitPoint = {
  date: string;
  count: number;
};

export type GitHubCommitSparkPoint = GitHubCommitPoint & {
  x: number;
  y: number;
};

export type GitHubRecentCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  body: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
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
  recentCommits?: GitHubRecentCommit[];
};

export type FrontendUiStateSnapshot = {
  activePrimaryNav?: number;
  isAgentsSidebarVisible?: boolean;
  sidebarWidth?: number;
  isActiveAgentsSectionExpanded?: boolean;
  isRuntimeStatusStripVisible?: boolean;
  isMonitorVisible?: boolean;
  isBottomTelemetryVisible?: boolean;
  isCodexUsageVisible?: boolean;
  isClaudeUsageVisible?: boolean;
  isCodexUsageSectionExpanded?: boolean;
  isClaudeUsageSectionExpanded?: boolean;
  tentacleCompletionSound?: TentacleCompletionSoundId;
  minimizedTentacleIds?: string[];
  tentacleWidths?: Record<string, number>;
};

export type TentacleWorkspaceMode = "shared" | "worktree";

export type TentacleAgentProvider = "codex" | "claude-code";

export type TentacleGitStatusSnapshot = {
  tentacleId: string;
  workspaceMode: TentacleWorkspaceMode;
  branchName: string;
  upstreamBranchName: string | null;
  isDirty: boolean;
  aheadCount: number;
  behindCount: number;
  insertedLineCount: number;
  deletedLineCount: number;
  hasConflicts: boolean;
  changedFiles: string[];
  defaultBaseBranchName: string | null;
};

export type TentaclePullRequestSnapshot = {
  tentacleId: string;
  workspaceMode: TentacleWorkspaceMode;
  status: "none" | "open" | "merged" | "closed";
  number: number | null;
  url: string | null;
  title: string | null;
  baseRef: string | null;
  headRef: string | null;
  isDraft: boolean | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null;
  mergeStateStatus: string | null;
};

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

export type ConversationTurn = {
  turnId: string;
  role: "user" | "assistant";
  content: string;
  startedAt: string;
  endedAt: string;
};

export type ConversationTranscriptEvent = {
  eventId: string;
  sessionId: string;
  tentacleId: string;
  timestamp: string;
  type: "session_start" | "input_submit" | "output_chunk" | "state_change" | "session_end";
};

export type ConversationSessionSummary = {
  sessionId: string;
  tentacleId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
  turnCount: number;
  userTurnCount: number;
  assistantTurnCount: number;
  firstUserTurnPreview: string | null;
  lastUserTurnPreview: string | null;
  lastAssistantTurnPreview: string | null;
};

export type ConversationSessionDetail = ConversationSessionSummary & {
  turns: ConversationTurn[];
  events: ConversationTranscriptEvent[];
};

export type ConversationSearchHit = {
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  snippet: string;
  turnStartedAt: string;
};

export type ConversationSearchResult = {
  query: string;
  hits: ConversationSearchHit[];
};
