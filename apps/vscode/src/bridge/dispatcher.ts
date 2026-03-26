import * as vscode from "vscode";

import type { createTerminalRuntime } from "../../../api/src/terminalRuntime";
import {
  createDeckTentacle,
  deleteDeckTentacle,
  readDeckTentacles,
  readDeckVaultFile,
} from "../../../api/src/deck/readDeckTentacles";
import type { ExtensionIncomingMessage, WebviewRequest } from "./protocol";

type TerminalRuntime = ReturnType<typeof createTerminalRuntime>;

type DispatcherOptions = {
  runtime: TerminalRuntime;
  workspaceCwd: string;
  panel: vscode.WebviewPanel;
};

export function createDispatcher({ runtime, workspaceCwd, panel }: DispatcherOptions): () => void {
  // Track direct PTY connections per terminal so we can clean up on dispose.
  const terminalDisconnects = new Map<string, () => void>();

  const ensureTerminalConnected = (terminalId: string) => {
    if (terminalDisconnects.has(terminalId)) {
      return;
    }

    const disconnect = runtime.connectDirect(terminalId, (message) => {
      if (message.type === "output") {
        panel.webview.postMessage({ type: "terminalOutput", terminalId, data: message.data });
      } else if (message.type === "state") {
        panel.webview.postMessage({ type: "terminalState", terminalId, state: message.state });
      } else if (message.type === "history") {
        panel.webview.postMessage({ type: "terminalHistory", terminalId, data: message.data });
      }
    });

    if (disconnect) {
      terminalDisconnects.set(terminalId, disconnect);
    }
  };

  const disconnectAllTerminals = () => {
    for (const disconnect of terminalDisconnects.values()) {
      disconnect();
    }
    terminalDisconnects.clear();
  };

  const listener = panel.webview.onDidReceiveMessage(async (message: ExtensionIncomingMessage) => {
    // Fire-and-forget terminal I/O messages (no id field)
    if (!("id" in message)) {
      if (message.type === "terminalInput") {
        ensureTerminalConnected(message.terminalId);
        runtime.writeInput(message.terminalId, message.data);
      } else if (message.type === "terminalResize") {
        ensureTerminalConnected(message.terminalId);
        runtime.resizeTerminal(message.terminalId, message.cols, message.rows);
      }
      return;
    }

    const req = message as WebviewRequest;

    try {
      const payload = await handleRequest(req, runtime, workspaceCwd, ensureTerminalConnected);
      panel.webview.postMessage({ id: req.id, type: "response", payload });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ id: req.id, type: "error", message: errorMessage });
    }
  });

  return () => {
    listener.dispose();
    disconnectAllTerminals();
  };
}

async function handleRequest(
  req: WebviewRequest,
  runtime: TerminalRuntime,
  workspaceCwd: string,
  ensureTerminalConnected: (terminalId: string) => void,
): Promise<unknown> {
  switch (req.type) {
    case "listTerminalSnapshots": {
      const snapshots = runtime.listTerminalSnapshots();
      // Auto-connect all existing terminals so their PTY output flows to the webview.
      for (const snapshot of snapshots) {
        ensureTerminalConnected(snapshot.terminalId);
      }
      return snapshots;
    }

    case "createTerminal": {
      const snapshot = runtime.createTerminal(req.payload);
      // Connect the newly created terminal immediately.
      ensureTerminalConnected(snapshot.terminalId);
      return snapshot;
    }

    case "deleteTerminal":
      return runtime.deleteTerminal(req.payload.terminalId);

    case "renameTerminal":
      return runtime.renameTerminal(req.payload.terminalId, req.payload.name);

    case "readUiState":
      return runtime.readUiState();

    case "patchUiState":
      return runtime.patchUiState(req.payload as Parameters<typeof runtime.patchUiState>[0]);

    case "listConversations":
      return runtime.listConversationSessions();

    case "getConversation":
      return runtime.readConversationSession(req.payload.sessionId);

    case "searchConversations":
      return runtime.searchConversations(req.payload.query);

    case "exportConversation":
      return runtime.exportConversationSession(req.payload.sessionId, req.payload.format);

    case "deleteConversation":
      return runtime.deleteConversationSession(req.payload.sessionId);

    case "deleteAllConversations":
      return runtime.deleteAllConversationSessions();

    case "listDeckTentacles":
      return readDeckTentacles(workspaceCwd);

    case "createDeckTentacle":
      return createDeckTentacle(
        workspaceCwd,
        req.payload as Parameters<typeof createDeckTentacle>[1],
      );

    case "deleteDeckTentacle":
      return deleteDeckTentacle(workspaceCwd, req.payload.tentacleId);

    case "readDeckVaultFile":
      return readDeckVaultFile(workspaceCwd, req.payload.tentacleId, req.payload.fileName);

    case "gitStatus":
      return runtime.readTentacleGitStatus(req.payload.tentacleId);

    case "gitCommit":
      return runtime.commitTentacleWorktree(req.payload.tentacleId, req.payload.message);

    case "gitPush":
      return runtime.pushTentacleWorktree(req.payload.tentacleId);

    case "gitSync":
      return runtime.syncTentacleWorktree(req.payload.tentacleId, req.payload.baseRef);

    case "gitPr":
      return runtime.readTentaclePullRequest(req.payload.tentacleId);

    case "gitPrCreate": {
      const prInput: { title: string; body?: string; baseRef?: string } = {
        title: req.payload.title,
      };
      if (req.payload.body !== undefined) prInput.body = req.payload.body;
      if (req.payload.baseRef !== undefined) prInput.baseRef = req.payload.baseRef;
      return runtime.createTentaclePullRequest(req.payload.tentacleId, prInput);
    }

    case "gitPrMerge":
      return runtime.mergeTentaclePullRequest(req.payload.tentacleId);

    default: {
      const _exhaustive: never = req;
      throw new Error(`Unknown request type: ${(_exhaustive as WebviewRequest).type}`);
    }
  }
}
