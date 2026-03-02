import { type WriteStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";

import { type IPty, spawn } from "node-pty";
import type { WebSocket, WebSocketServer } from "ws";

import { type CodexRuntimeState, CodexStateTracker } from "../codexStateDetection";
import { TENTACLE_BOOTSTRAP_COMMAND } from "./constants";
import { tmuxSessionNameForTentacle } from "./ids";
import { broadcastMessage, getTentacleId, sendMessage } from "./protocol";
import { createShellEnvironment, ensureNodePtySpawnHelperExecutable } from "./ptyEnvironment";
import { toErrorMessage } from "./systemClients";
import type { PersistedTentacle, TerminalSession, TmuxClient } from "./types";

type CreateSessionRuntimeOptions = {
  websocketServer: WebSocketServer;
  tentacles: Map<string, PersistedTentacle>;
  sessions: Map<string, TerminalSession>;
  tmuxClient: TmuxClient;
  getTentacleWorkspaceCwd: (tentacleId: string) => string;
  persistRegistry: () => void;
  isDebugPtyLogsEnabled: boolean;
  ptyLogDir: string;
};

export const createSessionRuntime = ({
  websocketServer,
  tentacles,
  sessions,
  tmuxClient,
  getTentacleWorkspaceCwd,
  persistRegistry,
  isDebugPtyLogsEnabled,
  ptyLogDir,
}: CreateSessionRuntimeOptions) => {
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

  const closeSession = (tentacleId: string): boolean => {
    const session = sessions.get(tentacleId);
    if (!session) {
      return false;
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
    return true;
  };

  const ensureTmuxSession = (tentacleId: string) => {
    const tmuxSessionName = tmuxSessionNameForTentacle(tentacleId);
    if (tmuxClient.hasSession(tmuxSessionName)) {
      tmuxClient.configureSession(tmuxSessionName);
      return;
    }

    const tentacleCwd = getTentacleWorkspaceCwd(tentacleId);
    if (!existsSync(tentacleCwd)) {
      throw new Error(`Tentacle working directory does not exist: ${tentacleCwd}`);
    }

    tmuxClient.createSession({
      sessionName: tmuxSessionName,
      cwd: tentacleCwd,
    });
    tmuxClient.configureSession(tmuxSessionName);
  };

  const ensureCodexBootstrapped = (tentacleId: string, session: TerminalSession) => {
    const tentacle = tentacles.get(tentacleId);
    if (!tentacle || tentacle.codexBootstrapped) {
      return;
    }

    tentacle.codexBootstrapped = true;
    persistRegistry();
    appendDebugLog(
      session,
      `bootstrap tentacle=${tentacleId} command=${TENTACLE_BOOTSTRAP_COMMAND}`,
    );
    session.pty.write(`${TENTACLE_BOOTSTRAP_COMMAND}\r`);
  };

  const ensureSession = (tentacleId: string) => {
    const existingSession = sessions.get(tentacleId);
    if (existingSession) {
      return existingSession;
    }

    if (!tentacles.has(tentacleId)) {
      throw new Error(`Unknown tentacle: ${tentacleId}`);
    }

    ensureTmuxSession(tentacleId);
    ensureNodePtySpawnHelperExecutable();

    let pty: IPty;
    try {
      pty = spawn("tmux", ["attach-session", "-t", tmuxSessionNameForTentacle(tentacleId)], {
        cols: 120,
        rows: 35,
        cwd: getTentacleWorkspaceCwd(tentacleId),
        env: createShellEnvironment(),
        name: "xterm-256color",
      });
    } catch (error) {
      throw new Error(`Unable to attach terminal to tmux: ${toErrorMessage(error)}`);
    }

    const stateTracker = new CodexStateTracker();
    const debugLog = createDebugLog(tentacleId);
    const session: TerminalSession = {
      pty,
      clients: new Set(),
      codexState: stateTracker.currentState,
      stateTracker,
    };
    if (debugLog) {
      session.debugLog = debugLog;
    }

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
    return session;
  };

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    const tentacleId = getTentacleId(request);
    if (!tentacleId || !tentacles.has(tentacleId)) {
      return false;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
      let session: TerminalSession;
      try {
        session = ensureSession(tentacleId);
      } catch (error) {
        sendMessage(websocket, {
          type: "output",
          data: `\r\n[terminal failed to start: ${toErrorMessage(error)}]\r\n`,
        });
        websocket.close();
        return;
      }

      session.clients.add(websocket);
      appendDebugLog(session, `ws-open tentacle=${tentacleId} clients=${session.clients.size}`);
      ensureCodexBootstrapped(tentacleId, session);
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
        appendDebugLog(session, `ws-close tentacle=${tentacleId} clients=${session.clients.size}`);
        if (session.clients.size === 0) {
          closeSession(tentacleId);
        }
      });
    });

    return true;
  };

  const close = () => {
    for (const tentacleId of sessions.keys()) {
      closeSession(tentacleId);
    }
  };

  return {
    closeSession,
    ensureTmuxSession,
    handleUpgrade,
    close,
  };
};
