import type { GitHubCommitPoint, buildTerminalList } from "@octogent/core";

export type TerminalView = Awaited<ReturnType<typeof buildTerminalList>>;

export type {
  CodexUsageSnapshot,
  ClaudeUsageSnapshot,
  GitHubCommitPoint,
  GitHubRecentCommit,
  GitHubRepoSummarySnapshot,
  TerminalAgentProvider,
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  MonitorUsageSnapshot,
  MonitorPost,
  MonitorCredentialSummary,
  MonitorConfigSnapshot,
  MonitorFeedSnapshot,
  ConversationTurn,
  ConversationTranscriptEvent,
  ConversationSessionSummary,
  ConversationSessionDetail,
  ConversationSearchHit,
  ConversationSearchResult,
} from "@octogent/core";

export type { PersistedUiState as FrontendUiStateSnapshot } from "@octogent/core";
export type { TentacleWorkspaceMode as TerminalWorkspaceMode } from "@octogent/core";

export type GitHubCommitSparkPoint = GitHubCommitPoint & {
  x: number;
  y: number;
};
