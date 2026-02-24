import react from "@vitejs/plugin-react";
import { accessSync, chmodSync, constants, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn, type IPty } from "node-pty";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { dirname, join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);

type TerminalSession = {
  pty: IPty;
  clients: Set<WebSocket>;
};

const isTerminalUpgrade = (request: IncomingMessage) => {
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
    // Ignore lookup failures and let regular spawn error handling report details.
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

const terminalApiPlugin = () => {
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
      // Ignore session teardown failures to avoid crashing dev server.
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
        cwd: process.cwd(),
        env: createShellEnvironment(),
        name: "xterm-256color",
        rows: 35,
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
    configureServer(server: {
      httpServer: {
        on: (event: "upgrade", listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void) => void;
      } | null;
      middlewares: {
        use: (
          route: string,
          handler: (request: IncomingMessage, response: { end: (chunk: string) => void; setHeader: (name: string, value: string) => void }) => void,
        ) => void;
      };
    }) {
      server.middlewares.use("/api/agent-snapshots", (request, response) => {
        if (request.method !== "GET") {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify([]));
          return;
        }

        const now = new Date().toISOString();
        const tentacleIds = sessions.size > 0 ? [...sessions.keys()] : ["tentacle-main"];
        const payload = tentacleIds.map((tentacleId) => ({
          agentId: `${tentacleId}-root`,
          label: `${tentacleId}-root`,
          state: "live",
          tentacleId,
          createdAt: now,
        }));

        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(payload));
      });

      server.httpServer?.on("upgrade", (request, socket, head) => {
        const tentacleId = isTerminalUpgrade(request);
        if (!tentacleId) {
          return;
        }

        websocketServer.handleUpgrade(request, socket, head, (websocket) => {
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

          websocket.on("message", (raw) => {
            const text = raw.toString();
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
                session.pty.resize(Math.max(20, Math.floor(payload.cols)), Math.max(10, Math.floor(payload.rows)));
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
      });
    },
    name: "terminal-api-plugin",
  };
};

export default defineConfig({
  plugins: [react(), terminalApiPlugin()],
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.tsx"],
  },
});
