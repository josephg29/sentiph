import * as vscode from "vscode";

type TerminalBridge = {
  sendOutput(terminalId: string, data: string): void;
  sendState(terminalId: string, state: string): void;
  sendHistory(terminalId: string, data: string): void;
};

export function createTerminalBridge({ panel }: { panel: vscode.WebviewPanel }): TerminalBridge {
  return {
    sendOutput(terminalId: string, data: string) {
      panel.webview.postMessage({ type: "terminalOutput", terminalId, data });
    },

    sendState(terminalId: string, state: string) {
      panel.webview.postMessage({ type: "terminalState", terminalId, state });
    },

    sendHistory(terminalId: string, data: string) {
      panel.webview.postMessage({ type: "terminalHistory", terminalId, data });
    },
  };
}
