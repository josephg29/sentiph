import type { WriteStream } from "node:fs";

import type {
  ChannelMessage,
  ConversationSearchResult,
  ConversationSessionDetail,
  ConversationSessionSummary,
  PersistedUiState,
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  TentaclePullRequestStatus,
  TentacleWorkspaceMode,
  TerminalAgentProvider,
  TerminalCompletionSoundId,
  TerminalSnapshot,
} from "@octogent/core";
import {
  TERMINAL_AGENT_PROVIDERS,
  TERMINAL_COMPLETION_SOUND_IDS,
  isTerminalAgentProvider,
  isTerminalCompletionSoundId,
} from "@octogent/core";
import type { IPty } from "node-pty";
import type { WebSocket } from "ws";

import type { AgentRuntimeState, AgentStateTracker } from "../agentStateDetection";

export type TerminalStateMessage = {
  type: "state";
  state: AgentRuntimeState;
  toolName?: string;
};

export type TerminalOutputMessage = {
  type: "output";
  data: string;
};

export type TerminalHistoryMessage = {
  type: "history";
  data: string;
};

export type TerminalRenameMessage = {
  type: "rename";
  tentacleName: string;
};

export type TerminalActivityMessage = {
  type: "activity";
};

export type TerminalServerMessage =
  | TerminalStateMessage
  | TerminalOutputMessage
  | TerminalHistoryMessage
  | TerminalRenameMessage
  | TerminalActivityMessage;

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
  lastToolName?: string;
};

export {
  type ChannelMessage,
  type ConversationSearchResult,
  type ConversationSessionDetail,
  type ConversationSessionSummary,
  type PersistedUiState,
  type TentacleGitStatusSnapshot,
  type TentaclePullRequestSnapshot,
  type TentaclePullRequestStatus,
  type TentacleWorkspaceMode,
  type TerminalAgentProvider,
  type TerminalCompletionSoundId,
  TERMINAL_AGENT_PROVIDERS,
  TERMINAL_COMPLETION_SOUND_IDS,
  isTerminalAgentProvider,
  isTerminalCompletionSoundId,
};

export type PersistedTerminal = {
  terminalId: string;
  tentacleId: string;
  worktreeId?: string;
  tentacleName: string;
  createdAt: string;
  workspaceMode: TentacleWorkspaceMode;
  agentProvider?: TerminalAgentProvider;
  initialPrompt?: string;
  lastActiveAt?: string;
  parentTerminalId?: string;
};

export type GitClientPullRequestSnapshot = Omit<
  TentaclePullRequestSnapshot,
  "tentacleId" | "workspaceMode" | "status"
> & {
  state: "OPEN" | "MERGED" | "CLOSED";
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
  projectStateDir?: string | undefined;
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
    tentacleId?: string;
    worktreeId?: string;
    tentacleName?: string;
    workspaceMode?: TentacleWorkspaceMode;
    agentProvider?: TerminalAgentProvider;
    initialPrompt?: string;
    baseRef?: string;
    parentTerminalId?: string;
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
  sendChannelMessage(
    toTerminalId: string,
    fromTerminalId: string,
    content: string,
  ): ChannelMessage | null;
  listChannelMessages(terminalId: string): ChannelMessage[];
  close(): void;
};
