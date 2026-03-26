import type { TerminalSnapshot } from "@octogent/core";

// Re-export types that both sides need
export type { TerminalSnapshot };

export type AgentRuntimeState = "processing" | "idle";

export type TentacleWorkspaceMode = "shared" | "worktree";
export type TerminalAgentProvider = "codex" | "claude-code";

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

export type PersistedUiState = {
  activePrimaryNav?: number;
  isAgentsSidebarVisible?: boolean;
  sidebarWidth?: number;
  isActiveAgentsSectionExpanded?: boolean;
  terminalCompletionSound?: string;
  minimizedTerminalIds?: string[];
  terminalWidths?: Record<string, number>;
};

export type ConversationTurn = {
  turnId: string;
  role: "user" | "assistant";
  content: string;
  startedAt: string;
  endedAt: string;
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
};

export type ConversationSearchHit = {
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  snippet: string;
  matchCount: number;
};

export type ConversationSearchResult = {
  query: string;
  totalHits: number;
  hits: ConversationSearchHit[];
};

export type DeckTentacleSummary = {
  tentacleId: string;
  displayName: string;
  description: string;
  status: "idle" | "active" | "blocked" | "needs-review";
  color: string | null;
  octopus: {
    animation: string | null;
    expression: string | null;
    accessory: string | null;
    hairColor: string | null;
  };
  scope: { paths: string[]; tags: string[] };
  vaultFiles: string[];
  todoTotal: number;
  todoDone: number;
  todoItems: { text: string; done: boolean }[];
};

// --- Message Protocol ---

// Webview -> Extension Host: request/response pattern
export type WebviewRequest =
  | { id: string; type: "listTerminalSnapshots" }
  | {
      id: string;
      type: "createTerminal";
      payload: {
        tentacleName?: string;
        workspaceMode?: TentacleWorkspaceMode;
        agentProvider?: TerminalAgentProvider;
      };
    }
  | { id: string; type: "deleteTerminal"; payload: { terminalId: string } }
  | { id: string; type: "renameTerminal"; payload: { terminalId: string; name: string } }
  | { id: string; type: "readUiState" }
  | { id: string; type: "patchUiState"; payload: Partial<PersistedUiState> }
  | { id: string; type: "listConversations" }
  | { id: string; type: "getConversation"; payload: { sessionId: string } }
  | { id: string; type: "searchConversations"; payload: { query: string } }
  | {
      id: string;
      type: "exportConversation";
      payload: { sessionId: string; format: "json" | "md" };
    }
  | { id: string; type: "deleteConversation"; payload: { sessionId: string } }
  | { id: string; type: "deleteAllConversations" }
  | { id: string; type: "listDeckTentacles" }
  | {
      id: string;
      type: "createDeckTentacle";
      payload: { name: string; description: string; color: string; octopus: unknown };
    }
  | { id: string; type: "deleteDeckTentacle"; payload: { tentacleId: string } }
  | {
      id: string;
      type: "readDeckVaultFile";
      payload: { tentacleId: string; fileName: string };
    }
  | { id: string; type: "gitStatus"; payload: { tentacleId: string } }
  | { id: string; type: "gitCommit"; payload: { tentacleId: string; message: string } }
  | { id: string; type: "gitPush"; payload: { tentacleId: string } }
  | { id: string; type: "gitSync"; payload: { tentacleId: string; baseRef?: string } }
  | { id: string; type: "gitPr"; payload: { tentacleId: string } }
  | {
      id: string;
      type: "gitPrCreate";
      payload: { tentacleId: string; title: string; body?: string; baseRef?: string };
    }
  | { id: string; type: "gitPrMerge"; payload: { tentacleId: string } };

// Webview -> Extension Host: fire-and-forget terminal I/O
export type WebviewTerminalMessage =
  | { type: "terminalInput"; terminalId: string; data: string }
  | { type: "terminalResize"; terminalId: string; cols: number; rows: number };

// Extension Host -> Webview: response to request
export type ExtensionResponse =
  | { id: string; type: "response"; payload: unknown }
  | { id: string; type: "error"; message: string };

// Extension Host -> Webview: push messages (terminal I/O)
export type ExtensionPushMessage =
  | { type: "terminalOutput"; terminalId: string; data: string }
  | { type: "terminalState"; terminalId: string; state: AgentRuntimeState }
  | { type: "terminalHistory"; terminalId: string; data: string };

// Union of all messages each side can receive
export type WebviewIncomingMessage = ExtensionResponse | ExtensionPushMessage;
export type ExtensionIncomingMessage = WebviewRequest | WebviewTerminalMessage;
