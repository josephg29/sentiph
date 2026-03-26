import type { WriteStream } from "node:fs";

import type { TerminalSnapshot } from "@octogent/core";
import type { IPty } from "node-pty";
import type { WebSocket } from "ws";

import type { AgentRuntimeState, AgentStateTracker } from "../agentStateDetection";
import type {
  ConversationSearchResult,
  ConversationSessionDetail,
  ConversationSessionSummary,
} from "./conversations";

export type TerminalStateMessage = {
  type: "state";
  state: AgentRuntimeState;
};

export type TerminalOutputMessage = {
  type: "output";
  data: string;
};

export type TerminalHistoryMessage = {
  type: "history";
  data: string;
};

export type TerminalServerMessage =
  | TerminalStateMessage
  | TerminalOutputMessage
  | TerminalHistoryMessage;

export type DirectSessionListener = (message: TerminalServerMessage) => void;

export type TerminalSession = {
  terminalId: string;
  tentacleId: string;
  pty: IPty;
  clients: Set<WebSocket>;
  directListeners: Set<DirectSessionListener>;
  cols: number;
  rows: number;
  agentState: AgentRuntimeState;
  stateTracker: AgentStateTracker;
  isBootstrapCommandSent: boolean;
  scrollbackChunks: string[];
  scrollbackBytes: number;
  statePollTimer?: ReturnType<typeof setInterval>;
  idleCloseTimer?: ReturnType<typeof setTimeout> | undefined;
  debugLog?: WriteStream;
  transcriptLog?: WriteStream | undefined;
  transcriptEventCount?: number;
  pendingInput?: string;
  hasTranscriptEnded?: boolean;
  initialPrompt?: string;
  isInitialPromptSent?: boolean;
  hasSeenProcessing?: boolean;
};

export type TentacleWorkspaceMode = "shared" | "worktree";

export type TerminalAgentProvider = "codex" | "claude-code";

export const TERMINAL_AGENT_PROVIDERS: TerminalAgentProvider[] = ["codex", "claude-code"];

export const isTerminalAgentProvider = (value: unknown): value is TerminalAgentProvider =>
  typeof value === "string" && TERMINAL_AGENT_PROVIDERS.includes(value as TerminalAgentProvider);

export const TERMINAL_COMPLETION_SOUND_IDS = [
  "soft-chime",
  "retro-beep",
  "double-beep",
  "bell",
  "pop",
  "silent",
] as const;

export type TerminalCompletionSound = (typeof TERMINAL_COMPLETION_SOUND_IDS)[number];

export const isTerminalCompletionSound = (value: unknown): value is TerminalCompletionSound =>
  typeof value === "string" &&
  TERMINAL_COMPLETION_SOUND_IDS.includes(value as TerminalCompletionSound);

export type PersistedTerminal = {
  terminalId: string;
  tentacleId: string;
  tentacleName: string;
  createdAt: string;
  workspaceMode: TentacleWorkspaceMode;
  agentProvider?: TerminalAgentProvider;
  initialPrompt?: string;
};

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

export type TentaclePullRequestStatus = "none" | "open" | "merged" | "closed";

export type TentaclePullRequestSnapshot = {
  tentacleId: string;
  workspaceMode: TentacleWorkspaceMode;
  status: TentaclePullRequestStatus;
  number: number | null;
  url: string | null;
  title: string | null;
  baseRef: string | null;
  headRef: string | null;
  isDraft: boolean | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null;
  mergeStateStatus: string | null;
};

export type GitClientPullRequestSnapshot = Omit<
  TentaclePullRequestSnapshot,
  "tentacleId" | "workspaceMode" | "status"
> & {
  state: "OPEN" | "MERGED" | "CLOSED";
};

export type PersistedUiState = {
  activePrimaryNav?: number;
  isAgentsSidebarVisible?: boolean;
  sidebarWidth?: number;
  isActiveAgentsSectionExpanded?: boolean;
  isRuntimeStatusStripVisible?: boolean;
  isMonitorVisible?: boolean;
  isBottomTelemetryVisible?: boolean;
  isCodexUsageVisible?: boolean;
  isClaudeUsageVisible?: boolean;
  isClaudeUsageSectionExpanded?: boolean;
  isCodexUsageSectionExpanded?: boolean;
  terminalCompletionSound?: TerminalCompletionSound;
  minimizedTerminalIds?: string[];
  terminalWidths?: Record<string, number>;
  canvasOpenTerminalIds?: string[];
  canvasTerminalsPanelWidth?: number;
};

export type TerminalRegistryDocument = {
  version: 3;
  terminals: PersistedTerminal[];
  uiState?: PersistedUiState;
};

export type GitClient = {
  assertAvailable(): void;
  isRepository(cwd: string): boolean;
  addWorktree(options: { cwd: string; path: string; branchName: string; baseRef: string }): void;
  removeWorktree(options: { cwd: string; path: string }): void;
  removeBranch(options: { cwd: string; branchName: string }): void;
  readWorktreeStatus(options: {
    cwd: string;
  }): Omit<TentacleGitStatusSnapshot, "tentacleId" | "workspaceMode">;
  commitAll(options: { cwd: string; message: string }): void;
  pushCurrentBranch(options: { cwd: string }): void;
  syncWithBase(options: { cwd: string; baseRef: string }): void;
  readCurrentBranchPullRequest(options: {
    cwd: string;
  }): GitClientPullRequestSnapshot | null;
  createPullRequest(options: {
    cwd: string;
    title: string;
    body: string;
    baseRef: string;
    headRef: string;
  }): GitClientPullRequestSnapshot | null;
  mergeCurrentBranchPullRequest(options: {
    cwd: string;
    strategy: "squash" | "merge" | "rebase";
  }): void;
};

export class RuntimeInputError extends Error {}

export type CreateTerminalRuntimeOptions = {
  workspaceCwd: string;
  gitClient?: GitClient;
};

export type TerminalRuntime = {
  listTerminalSnapshots(): TerminalSnapshot[];
  listConversationSessions(): ConversationSessionSummary[];
  readConversationSession(sessionId: string): ConversationSessionDetail | null;
  exportConversationSession(sessionId: string, format: "json" | "md"): string | null;
  deleteConversationSession(sessionId: string): void;
  deleteAllConversationSessions(): void;
  searchConversations(query: string): ConversationSearchResult;
  readUiState(): PersistedUiState;
  patchUiState(patch: PersistedUiState): PersistedUiState;
  readTentacleGitStatus(tentacleId: string): TentacleGitStatusSnapshot | null;
  commitTentacleWorktree(tentacleId: string, message: string): TentacleGitStatusSnapshot | null;
  pushTentacleWorktree(tentacleId: string): TentacleGitStatusSnapshot | null;
  syncTentacleWorktree(tentacleId: string, baseRef?: string): TentacleGitStatusSnapshot | null;
  readTentaclePullRequest(tentacleId: string): TentaclePullRequestSnapshot | null;
  createTentaclePullRequest(
    tentacleId: string,
    input: { title: string; body?: string; baseRef?: string },
  ): TentaclePullRequestSnapshot | null;
  mergeTentaclePullRequest(tentacleId: string): TentaclePullRequestSnapshot | null;
  createTerminal(options: {
    terminalId?: string;
    tentacleName?: string;
    workspaceMode?: TentacleWorkspaceMode;
    agentProvider?: TerminalAgentProvider;
  }): TerminalSnapshot;
  renameTerminal(terminalId: string, tentacleName: string): TerminalSnapshot | null;
  deleteTerminal(terminalId: string): boolean;
  handleHook(hookName: string, payload: unknown, octogentSessionId?: string): { ok: boolean };
  handleUpgrade(
    request: import("node:http").IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ): boolean;
  connectDirect(terminalId: string, listener: DirectSessionListener): (() => void) | null;
  writeInput(terminalId: string, data: string): boolean;
  resizeTerminal(terminalId: string, cols: number, rows: number): boolean;
  close(): void;
};
