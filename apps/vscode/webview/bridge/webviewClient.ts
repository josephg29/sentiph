import type {
  ConversationSearchResult,
  ConversationSessionDetail,
  ConversationSessionSummary,
  DeckTentacleSummary,
  ExtensionPushMessage,
  PersistedUiState,
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  TerminalSnapshot,
  WebviewIncomingMessage,
} from "../../src/bridge/protocol";

// --- VS Code API acquisition ---

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// --- Request/response correlation ---

let nextId = 1;
const generateId = () => String(nextId++);

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const pendingRequests = new Map<string, PendingEntry>();

// --- Terminal event listeners ---

export type TerminalEventHandler = {
  onOutput?: (terminalId: string, data: string) => void;
  onState?: (terminalId: string, state: string) => void;
  onHistory?: (terminalId: string, data: string) => void;
};

const terminalListeners = new Set<TerminalEventHandler>();

export const addTerminalListener = (handler: TerminalEventHandler): (() => void) => {
  terminalListeners.add(handler);
  return () => {
    terminalListeners.delete(handler);
  };
};

function dispatchTerminalEvent(msg: ExtensionPushMessage): void {
  for (const listener of terminalListeners) {
    switch (msg.type) {
      case "terminalOutput":
        listener.onOutput?.(msg.terminalId, msg.data);
        break;
      case "terminalState":
        listener.onState?.(msg.terminalId, msg.state);
        break;
      case "terminalHistory":
        listener.onHistory?.(msg.terminalId, msg.data);
        break;
    }
  }
}

// --- Incoming message handler ---

window.addEventListener("message", (event: MessageEvent<WebviewIncomingMessage>) => {
  const msg = event.data;

  // Push messages (no id) go to terminal listeners
  if (!("id" in msg)) {
    dispatchTerminalEvent(msg);
    return;
  }

  const pending = pendingRequests.get(msg.id);
  if (!pending) return;
  pendingRequests.delete(msg.id);

  if (msg.type === "response") {
    pending.resolve(msg.payload);
  } else {
    pending.reject(new Error(msg.message));
  }
});

// --- Request helper ---

function request<T>(type: string, payload?: unknown): Promise<T> {
  const id = generateId();
  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    vscode.postMessage(payload !== undefined ? { id, type, payload } : { id, type });
  });
}

// --- Exported API ---

export const webviewClient = {
  // Terminal snapshots
  listTerminalSnapshots(): Promise<TerminalSnapshot[]> {
    return request("listTerminalSnapshots");
  },

  createTerminal(payload: {
    tentacleName?: string;
    workspaceMode?: string;
    agentProvider?: string;
  }): Promise<TerminalSnapshot> {
    return request("createTerminal", payload);
  },

  deleteTerminal(terminalId: string): Promise<boolean> {
    return request("deleteTerminal", { terminalId });
  },

  renameTerminal(terminalId: string, name: string): Promise<TerminalSnapshot | null> {
    return request("renameTerminal", { terminalId, name });
  },

  // UI State
  readUiState(): Promise<PersistedUiState> {
    return request("readUiState");
  },

  patchUiState(patch: Partial<PersistedUiState>): Promise<PersistedUiState> {
    return request("patchUiState", patch);
  },

  // Conversations
  listConversations(): Promise<ConversationSessionSummary[]> {
    return request("listConversations");
  },

  getConversation(sessionId: string): Promise<ConversationSessionDetail | null> {
    return request("getConversation", { sessionId });
  },

  searchConversations(query: string): Promise<ConversationSearchResult> {
    return request("searchConversations", { query });
  },

  exportConversation(sessionId: string, format: "json" | "md"): Promise<string | null> {
    return request("exportConversation", { sessionId, format });
  },

  deleteConversation(sessionId: string): Promise<void> {
    return request("deleteConversation", { sessionId });
  },

  deleteAllConversations(): Promise<void> {
    return request("deleteAllConversations");
  },

  // Deck
  listDeckTentacles(): Promise<DeckTentacleSummary[]> {
    return request("listDeckTentacles");
  },

  createDeckTentacle(payload: {
    name: string;
    description: string;
    color: string;
    octopus: unknown;
  }): Promise<unknown> {
    return request("createDeckTentacle", payload);
  },

  deleteDeckTentacle(tentacleId: string): Promise<unknown> {
    return request("deleteDeckTentacle", { tentacleId });
  },

  readDeckVaultFile(tentacleId: string, fileName: string): Promise<string | null> {
    return request("readDeckVaultFile", { tentacleId, fileName });
  },

  // Git
  gitStatus(tentacleId: string): Promise<TentacleGitStatusSnapshot | null> {
    return request("gitStatus", { tentacleId });
  },

  gitCommit(tentacleId: string, message: string): Promise<TentacleGitStatusSnapshot | null> {
    return request("gitCommit", { tentacleId, message });
  },

  gitPush(tentacleId: string): Promise<TentacleGitStatusSnapshot | null> {
    return request("gitPush", { tentacleId });
  },

  gitSync(tentacleId: string, baseRef?: string): Promise<TentacleGitStatusSnapshot | null> {
    return request("gitSync", { tentacleId, baseRef });
  },

  gitPr(tentacleId: string): Promise<TentaclePullRequestSnapshot | null> {
    return request("gitPr", { tentacleId });
  },

  gitPrCreate(
    tentacleId: string,
    title: string,
    body?: string,
    baseRef?: string,
  ): Promise<TentaclePullRequestSnapshot | null> {
    return request("gitPrCreate", { tentacleId, title, body, baseRef });
  },

  gitPrMerge(tentacleId: string): Promise<TentaclePullRequestSnapshot | null> {
    return request("gitPrMerge", { tentacleId });
  },

  // Terminal I/O (fire-and-forget)
  sendTerminalInput(terminalId: string, data: string): void {
    vscode.postMessage({ type: "terminalInput", terminalId, data });
  },

  sendTerminalResize(terminalId: string, cols: number, rows: number): void {
    vscode.postMessage({ type: "terminalResize", terminalId, cols, rows });
  },
};
