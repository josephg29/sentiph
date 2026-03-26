import * as fs from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

import { createTerminalRuntime } from "../../api/src/terminalRuntime";
import { createDispatcher } from "./bridge/dispatcher";

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const openDashboard = vscode.commands.registerCommand("octogent.openDashboard", () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("Octogent requires an open workspace folder.");
      return;
    }

    const workspaceCwd = workspaceFolder.uri.fsPath;

    const runtime = createTerminalRuntime({ workspaceCwd });

    panel = vscode.window.createWebviewPanel("octogent.dashboard", "Octogent", vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
      retainContextWhenHidden: true,
    });

    panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);

    const disposeDispatcher = createDispatcher({ runtime, workspaceCwd, panel });

    panel.onDidDispose(
      () => {
        disposeDispatcher();
        runtime.close();
        panel = undefined;
      },
      null,
      context.subscriptions,
    );
  });

  context.subscriptions.push(openDashboard);
}

export function deactivate() {
  panel?.dispose();
}

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const isDev = process.env.OCTOGENT_DEV === "1";

  if (isDev) {
    const devCsp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline' http://localhost:5173`,
      `script-src 'unsafe-inline' http://localhost:5173`,
      `connect-src http://localhost:5173 ws://localhost:5173`,
      `font-src http://localhost:5173 data:`,
      `img-src http://localhost:5173 data:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${devCsp}">
  <title>Octogent</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="http://localhost:5173/main.tsx"></script>
</body>
</html>`;
  }

  const distWebviewPath = vscode.Uri.joinPath(extensionUri, "dist", "webview");
  const indexPath = path.join(distWebviewPath.fsPath, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");

  // Rewrite /assets/ paths to webview URIs
  const assetsUri = webview.asWebviewUri(vscode.Uri.joinPath(distWebviewPath, "assets"));
  html = html.replace(/(?:\/assets\/)/g, `${assetsUri.toString()}/`);

  // Inject CSP meta tag after <head>
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'unsafe-inline' ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
  ].join("; ");

  html = html.replace(
    "<head>",
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );

  return html;
}
