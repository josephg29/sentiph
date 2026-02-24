import {
  constants,
  type WriteStream,
  accessSync,
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import type { IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Duplex } from "node:stream";
import type { AgentSnapshot } from "@octogent/core";
import { type IPty, spawn } from "node-pty";
import { type WebSocket, WebSocketServer } from "ws";

import { type CodexRuntimeState, CodexStateTracker } from "./codexStateDetection";

const require = createRequire(import.meta.url);

type TerminalStateMessage = {
  type: "state";
  state: CodexRuntimeState;
};

type TerminalOutputMessage = {
  type: "output";
  data: string;
};

type TerminalServerMessage = TerminalStateMessage | TerminalOutputMessage;

type TerminalSession = {
  pty: IPty;
  clients: Set<WebSocket>;
  createdAt: string;
  codexState: CodexRuntimeState;
  stateTracker: CodexStateTracker;
  statePollTimer?: ReturnType<typeof setInterval>;
  debugLog?: WriteStream;
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

const sendMessage = (client: WebSocket, message: TerminalServerMessage) => {
  if (client.readyState !== 1) {
    return;
  }

  client.send(JSON.stringify(message));
};

const broadcastMessage = (session: TerminalSession, message: TerminalServerMessage) => {
  for (const client of session.clients) {
    sendMessage(client, message);
  }
};

const TENTACLE_ID_PREFIX = "tentacle-";

const parseTentacleNumber = (tentacleId: string): number | null => {
  if (!tentacleId.startsWith(TENTACLE_ID_PREFIX)) {
    return null;
  }

  const numericPart = tentacleId.slice(TENTACLE_ID_PREFIX.length);
  if (!/^\d+$/.test(numericPart)) {
    return null;
  }

  const parsed = Number.parseInt(numericPart, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
};

export const createTerminalRuntime = ({ workspaceCwd }: CreateTerminalRuntimeOptions) => {
  const sessions = new Map<string, TerminalSession>();
  const websocketServer = new WebSocketServer({ noServer: true });
  let nextTentacleNumber = 1;
  const isDebugPtyLogsEnabled = process.env.OCTOGENT_DEBUG_PTY_LOGS === "1";
  const ptyLogDir =
    process.env.OCTOGENT_DEBUG_PTY_LOG_DIR ?? join(workspaceCwd, ".octogent", "logs");

  const createDebugLog = (tentacleId: string) => {
    if (!isDebugPtyLogsEnabled) {
      return undefined;
    }

    mkdirSync(ptyLogDir, { recursive: true });
    const filename = `${tentacleId}-${Date.now()}.log`;
    return createWriteStream(join(ptyLogDir, filename), {
      flags: "a",
      encoding: "utf8",
    });
  };

  const appendDebugLog = (session: TerminalSession, line: string) => {
    session.debugLog?.write(`${new Date().toISOString()} ${line}\n`);
  };

  const emitStateIfChanged = (
    session: TerminalSession,
    tentacleId: string,
    nextState: CodexRuntimeState | null,
  ) => {
    if (!nextState || nextState === session.codexState) {
      return;
    }

    session.codexState = nextState;
    appendDebugLog(session, `state-change tentacle=${tentacleId} state=${nextState}`);
    broadcastMessage(session, {
      type: "state",
      state: nextState,
    });
  };

  const reserveTentacleNumber = (tentacleId: string) => {
    const parsed = parseTentacleNumber(tentacleId);
    if (parsed === null) {
      return;
    }

    nextTentacleNumber = Math.max(nextTentacleNumber, parsed + 1);
  };

  const allocateTentacleId = () => {
    while (sessions.has(`${TENTACLE_ID_PREFIX}${nextTentacleNumber}`)) {
      nextTentacleNumber += 1;
    }

    const tentacleId = `${TENTACLE_ID_PREFIX}${nextTentacleNumber}`;
    nextTentacleNumber += 1;
    return tentacleId;
  };

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

    if (session.statePollTimer) {
      clearInterval(session.statePollTimer);
    }
    session.debugLog?.end();
    sessions.delete(tentacleId);
  };

  const ensureSession = (tentacleId: string, bootstrapCommand?: string) => {
    const existingSession = sessions.get(tentacleId);
    if (existingSession) {
      return existingSession;
    }
    reserveTentacleNumber(tentacleId);

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

    const stateTracker = new CodexStateTracker();
    const session: TerminalSession = {
      pty,
      clients: new Set(),
      createdAt: new Date().toISOString(),
      codexState: stateTracker.currentState,
      stateTracker,
      debugLog: createDebugLog(tentacleId),
    };
    appendDebugLog(session, `session-start tentacle=${tentacleId}`);
    session.statePollTimer = setInterval(() => {
      emitStateIfChanged(session, tentacleId, session.stateTracker.poll(Date.now()));
    }, 300);

    session.pty.onData((chunk) => {
      appendDebugLog(session, `pty-output tentacle=${tentacleId} chunk=${JSON.stringify(chunk)}`);
      const nextState = session.stateTracker.observeChunk(chunk, Date.now());
      broadcastMessage(session, {
        type: "output",
        data: chunk,
      });
      emitStateIfChanged(session, tentacleId, nextState);
    });

    session.pty.onExit(({ exitCode, signal }) => {
      const message = `\r\n[terminal exited (code ${exitCode}, signal ${signal})]\r\n`;
      broadcastMessage(session, {
        type: "output",
        data: message,
      });
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.close();
        }
      }

      appendDebugLog(
        session,
        `session-exit tentacle=${tentacleId} code=${exitCode} signal=${signal}`,
      );
      if (session.statePollTimer) {
        clearInterval(session.statePollTimer);
      }
      session.debugLog?.end();
      sessions.delete(tentacleId);
    });

    sessions.set(tentacleId, session);

    if (bootstrapCommand) {
      session.pty.write(`${bootstrapCommand}\r`);
    }

    return session;
  };

  const createTentacle = (): AgentSnapshot => {
    const tentacleId = allocateTentacleId();
    const session = ensureSession(tentacleId, "codex");
    return {
      agentId: `${tentacleId}-root`,
      label: `${tentacleId}-root`,
      state: "live",
      tentacleId,
      createdAt: session.createdAt,
    };
  };

  createTentacle();

  return {
    listAgentSnapshots(): AgentSnapshot[] {
      return [...sessions.entries()].map(([tentacleId, session]) => ({
        agentId: `${tentacleId}-root`,
        label: `${tentacleId}-root`,
        state: "live",
        tentacleId,
        createdAt: session.createdAt,
      }));
    },

    createTentacle,

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
          sendMessage(websocket, {
            type: "output",
            data: `\r\n[terminal failed to start: ${message}]\r\n`,
          });
          websocket.close();
          return;
        }

        session.clients.add(websocket);
        appendDebugLog(session, `ws-open tentacle=${tentacleId} clients=${session.clients.size}`);
        sendMessage(websocket, {
          type: "state",
          state: session.codexState,
        });

        websocket.on("message", (raw: unknown) => {
          const text =
            typeof raw === "string" ? raw : raw instanceof Buffer ? raw.toString() : String(raw);
          try {
            const payload = JSON.parse(text) as
              | { type: "input"; data: string }
              | { type: "resize"; cols: number; rows: number };

            if (payload.type === "input" && typeof payload.data === "string") {
              appendDebugLog(
                session,
                `ws-input tentacle=${tentacleId} data=${JSON.stringify(payload.data)}`,
              );
              session.pty.write(payload.data);
              if (/[\r\n]/.test(payload.data)) {
                emitStateIfChanged(
                  session,
                  tentacleId,
                  session.stateTracker.observeSubmit(Date.now()),
                );
              }
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
          appendDebugLog(
            session,
            `ws-close tentacle=${tentacleId} clients=${session.clients.size}`,
          );
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
