import { constants, accessSync, chmodSync, existsSync, statSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Duplex } from "node:stream";
import type { AgentSnapshot } from "@octogent/core";
import { type IPty, spawn } from "node-pty";
import { type WebSocket, WebSocketServer } from "ws";

const require = createRequire(import.meta.url);

type TerminalSession = {
  pty: IPty;
  clients: Set<WebSocket>;
};

type CreateTerminalRuntimeOptions = {
  workspaceCwd: string;
};

const createShellEnvironment = () => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
};

const ensureNodePtySpawnHelperExecutable = () => {
  if (process.platform === "win32") {
    return;
  }

  try {
    const packageJsonPath = require.resolve("node-pty/package.json");
    const packageDir = dirname(packageJsonPath);
    const helperCandidates = [
      join(packageDir, "build", "Release", "spawn-helper"),
      join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    ];

    for (const helperPath of helperCandidates) {
      if (!existsSync(helperPath)) {
        continue;
      }

      const currentMode = statSync(helperPath).mode;
      if ((currentMode & 0o111) !== 0) {
        continue;
      }

      chmodSync(helperPath, currentMode | 0o755);
    }
  } catch {
    // Let node-pty throw the actionable error if helper lookup/setup fails.
  }
};

const canExecute = (path: string) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveShellCommand = () => {
  if (process.platform === "win32") {
    return {
      shell: process.env.COMSPEC || "powershell.exe",
      args: ["-NoLogo"],
    };
  }

  const candidates = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const shell = candidates.find((candidate) => canExecute(candidate)) ?? "/bin/sh";
  const args = shell.endsWith("/sh") ? [] : ["-i"];

  return {
    shell,
    args,
  };
};

const getTentacleId = (request: IncomingMessage) => {
  if (!request.url) {
    return null;
  }

  const url = new URL(request.url, "http://localhost");
  const match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/ws$/);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1] ?? "");
};

export const createTerminalRuntime = ({ workspaceCwd }: CreateTerminalRuntimeOptions) => {
  const sessions = new Map<string, TerminalSession>();
  const websocketServer = new WebSocketServer({ noServer: true });

  const closeSession = (tentacleId: string) => {
    const session = sessions.get(tentacleId);
    if (!session) {
      return;
    }

    try {
      session.pty.kill();
    } catch {
      // Ignore teardown errors; session will still be discarded.
    }

    sessions.delete(tentacleId);
  };

  const ensureSession = (tentacleId: string) => {
    const existingSession = sessions.get(tentacleId);
    if (existingSession) {
      return existingSession;
    }

    ensureNodePtySpawnHelperExecutable();
    const shellCommand = resolveShellCommand();

    let pty: IPty;
    try {
      pty = spawn(shellCommand.shell, shellCommand.args, {
        cols: 120,
        rows: 35,
        cwd: workspaceCwd,
        env: createShellEnvironment(),
        name: "xterm-256color",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to start terminal shell (${shellCommand.shell}): ${message}`);
    }

    const session: TerminalSession = {
      pty,
      clients: new Set(),
    };

    session.pty.onData((chunk) => {
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(chunk);
        }
      }
    });

    session.pty.onExit(({ exitCode, signal }) => {
      const message = `\r\n[terminal exited (code ${exitCode}, signal ${signal})]\r\n`;
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(message);
          client.close();
        }
      }

      sessions.delete(tentacleId);
    });

    sessions.set(tentacleId, session);
    return session;
  };

  return {
    listAgentSnapshots(): AgentSnapshot[] {
      const now = new Date().toISOString();
      const tentacleIds = sessions.size > 0 ? [...sessions.keys()] : ["tentacle-main"];
      return tentacleIds.map((tentacleId) => ({
        agentId: `${tentacleId}-root`,
        label: `${tentacleId}-root`,
        state: "live",
        tentacleId,
        createdAt: now,
      }));
    },

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      const tentacleId = getTentacleId(request);
      if (!tentacleId) {
        return false;
      }

      websocketServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
        let session: TerminalSession;
        try {
          session = ensureSession(tentacleId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          websocket.send(`\r\n[terminal failed to start: ${message}]\r\n`);
          websocket.close();
          return;
        }

        session.clients.add(websocket);

        websocket.on("message", (raw: unknown) => {
          const text =
            typeof raw === "string" ? raw : raw instanceof Buffer ? raw.toString() : String(raw);
          try {
            const payload = JSON.parse(text) as
              | { type: "input"; data: string }
              | { type: "resize"; cols: number; rows: number };

            if (payload.type === "input" && typeof payload.data === "string") {
              session.pty.write(payload.data);
              return;
            }

            if (
              payload.type === "resize" &&
              Number.isFinite(payload.cols) &&
              Number.isFinite(payload.rows)
            ) {
              session.pty.resize(
                Math.max(20, Math.floor(payload.cols)),
                Math.max(10, Math.floor(payload.rows)),
              );
            }
          } catch {
            session.pty.write(text);
          }
        });

        websocket.on("close", () => {
          session.clients.delete(websocket);
          if (session.clients.size === 0) {
            closeSession(tentacleId);
          }
        });
      });

      return true;
    },

    close() {
      for (const tentacleId of sessions.keys()) {
        closeSession(tentacleId);
      }
      websocketServer.close();
    },
  };
};
