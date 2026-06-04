import { existsSync } from "node:fs";

import { type IPty, spawn } from "node-pty";

import { type AgentRuntimeState, AgentStateTracker } from "../agentStateDetection";
import { buildBootstrapCommand, planClaudeBootstrap } from "./claudeBootstrap";
import { resolveClaudeCommand } from "./claudeExecutable";
import {
  CLAUDE_EFFORT_THINKING_TOKENS,
  DEFAULT_AGENT_PROVIDER,
  SENTIPH_TENTACLE_ID,
  TERMINAL_MAX_CONCURRENT_SESSIONS,
} from "./constants";
import { createShellEnvironment, ensureNodePtySpawnHelperExecutable } from "./ptyEnvironment";
import {
  type SessionEndEvent,
  appendDebugLog,
  appendTranscriptEvent,
  createDebugLog as createDebugLogFile,
  openTranscriptLog as openTranscriptLogFile,
} from "./sessionLogging";
import { formatShellSpawnError, getShellLaunch } from "./shellLaunch";
import { toErrorMessage } from "./systemClients";
import type { PersistedTerminal, TerminalSession, TerminalSessionStartDetails } from "./types";

// ---------------------------------------------------------------------------
// Bootstrap prompt constants
// ---------------------------------------------------------------------------

const INITIAL_PROMPT_DELAY_MS = 4_000;
const INITIAL_PROMPT_SUBMIT_DELAY_MS = 150;
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

// ---------------------------------------------------------------------------
// ensureAgentBootstrapped
// ---------------------------------------------------------------------------

export type BootstrapContext = {
  terminals: Map<string, PersistedTerminal>;
  sentiphMcpConfigPath?: string;
  sentiphSystemPromptPath?: string;
  schedulePromptTimer: (
    session: TerminalSession,
    sessionId: string,
    callback: () => void,
    delayMs: number,
  ) => void;
  appendScrollback: (session: TerminalSession, chunk: string) => void;
  broadcastOutput: (session: TerminalSession, data: string) => void;
  appendDebugLog: (session: TerminalSession, message: string) => void;
};

export const ensureAgentBootstrapped = (
  sessionId: string,
  session: TerminalSession,
  ctx: BootstrapContext,
): void => {
  if (session.isBootstrapCommandSent) {
    return;
  }

  session.isBootstrapCommandSent = true;
  const terminal = ctx.terminals.get(session.terminalId);
  const provider = terminal?.agentProvider ?? DEFAULT_AGENT_PROVIDER;

  const bootstrapCommand = buildBootstrapCommand({
    provider,
    tentacleId: session.tentacleId,
    // Resolve against the same environment the PTY shell inherits so the
    // launcher token is one cmd.exe/bash can actually execute. Without this a
    // bare `claude` can bind to a `.ps1`/extensionless shim on Windows that
    // cmd.exe refuses ("The system cannot execute the specified program"),
    // leaving the terminal in a raw shell that swallows the task brief.
    claudeExecutable: resolveClaudeCommand(),
    ...(terminal?.isGroupLeader ? { isGroupLeader: terminal.isGroupLeader } : {}),
    ...(session.claudeBootstrapFlags ? { claudeBootstrapFlags: session.claudeBootstrapFlags } : {}),
    ...(ctx.sentiphMcpConfigPath ? { sentiphMcpConfigPath: ctx.sentiphMcpConfigPath } : {}),
    ...(ctx.sentiphSystemPromptPath
      ? { sentiphSystemPromptPath: ctx.sentiphSystemPromptPath }
      : {}),
  });

  if (session.claudeResumeBanner) {
    const banner = `\r\n${session.claudeResumeBanner}\r\n`;
    ctx.appendScrollback(session, banner);
    ctx.broadcastOutput(session, banner);
  }
  ctx.appendDebugLog(session, `bootstrap session=${sessionId} command=${bootstrapCommand}`);
  session.pty.write(`${bootstrapCommand}\r`);

  if (session.initialPrompt && !session.isInitialPromptSent) {
    ctx.schedulePromptTimer(
      session,
      sessionId,
      () => {
        if (session.isInitialPromptSent) {
          return;
        }
        session.isInitialPromptSent = true;
        ctx.appendDebugLog(session, `initial-prompt session=${sessionId}`);
        const prompt = session.initialPrompt ?? "";
        session.pty.write(`${BRACKETED_PASTE_START}${prompt}${BRACKETED_PASTE_END}`);
        ctx.schedulePromptTimer(
          session,
          sessionId,
          () => {
            ctx.appendDebugLog(session, `initial-prompt-submit session=${sessionId}`);
            session.pty.write("\r");
          },
          INITIAL_PROMPT_SUBMIT_DELAY_MS,
        );
      },
      INITIAL_PROMPT_DELAY_MS,
    );
  }

  if (session.initialInputDraft && !session.isInitialInputDraftSent && !session.initialPrompt) {
    ctx.schedulePromptTimer(
      session,
      sessionId,
      () => {
        if (session.isInitialInputDraftSent) {
          return;
        }
        session.isInitialInputDraftSent = true;
        ctx.appendDebugLog(session, `initial-input-draft session=${sessionId}`);
        const draft = session.initialInputDraft ?? "";
        session.pty.write(`${BRACKETED_PASTE_START}${draft}${BRACKETED_PASTE_END}`);
      },
      INITIAL_PROMPT_DELAY_MS,
    );
  }
};

// ---------------------------------------------------------------------------
// ensureSession
// ---------------------------------------------------------------------------

export type EnsureSessionContext = {
  sessions: Map<string, TerminalSession>;
  terminals: Map<string, PersistedTerminal>;
  sessionLimit: number;
  getTentacleWorkspaceCwd: (tentacleId: string) => string;
  isDebugPtyLogsEnabled: boolean;
  ptyLogDir: string;
  transcriptDirectoryPath?: string;
  transcriptEventSequence: { value: number };
  onSessionStart?: (terminalId: string, details: TerminalSessionStartDetails) => void;
  onOutputChunk?: (terminalId: string, chunk: string) => void;
  appendScrollback: (session: TerminalSession, chunk: string) => void;
  broadcastMessage: (session: TerminalSession, msg: Record<string, unknown>) => void;
  emitStateIfChanged: (
    session: TerminalSession,
    sessionId: string,
    nextState: AgentRuntimeState | null,
  ) => void;
  teardownSession: (
    sessionId: string,
    session: TerminalSession,
    event: SessionEndEvent,
    options: { killPty: boolean; killSignal?: string },
  ) => void;
};

const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 35;

export const ensureSession = (
  sessionId: string,
  tentacleId: string,
  ctx: EnsureSessionContext,
): TerminalSession => {
  const existingSession = ctx.sessions.get(sessionId);
  if (existingSession) {
    return existingSession;
  }

  if (ctx.sessions.size >= ctx.sessionLimit) {
    throw new Error(
      `Terminal session limit reached (${ctx.sessionLimit}). Close an existing terminal session or increase SENTIPH_MAX_TERMINAL_SESSIONS.`,
    );
  }

  const terminalRecord = ctx.terminals.get(sessionId);
  const tentacleCwd = ctx.getTentacleWorkspaceCwd(tentacleId);
  if (!existsSync(tentacleCwd)) {
    throw new Error(`Terminal working directory does not exist: ${tentacleCwd}`);
  }

  const claudePlan = planClaudeBootstrap(terminalRecord, tentacleCwd);
  if (terminalRecord && claudePlan.sessionIdToPersist) {
    terminalRecord.claudeSessionId = claudePlan.sessionIdToPersist;
  }

  ensureNodePtySpawnHelperExecutable();
  const shellLaunch = getShellLaunch();

  const thinkingTokens = terminalRecord?.effort
    ? CLAUDE_EFFORT_THINKING_TOKENS[terminalRecord.effort]
    : undefined;

  let pty: IPty;
  try {
    pty = spawn(shellLaunch.command, shellLaunch.args, {
      cols: DEFAULT_PTY_COLS,
      rows: DEFAULT_PTY_ROWS,
      cwd: tentacleCwd,
      env: createShellEnvironment({
        sentiphSessionId: sessionId,
        ...(thinkingTokens !== undefined ? { maxThinkingTokens: thinkingTokens } : {}),
      }),
      name: "xterm-256color",
    });
  } catch (error) {
    throw new Error(formatShellSpawnError(shellLaunch.command, toErrorMessage(error)));
  }

  const stateTracker = new AgentStateTracker();

  const openTranscriptLog = (sid: string): string | undefined =>
    openTranscriptLogFile(sid, ctx.transcriptDirectoryPath);

  const debugLog = createDebugLogFile(sessionId, ctx.isDebugPtyLogsEnabled, ctx.ptyLogDir);
  const session: TerminalSession = {
    terminalId: sessionId,
    tentacleId,
    pty,
    clients: new Set(),
    directListeners: new Set(),
    cols: DEFAULT_PTY_COLS,
    rows: DEFAULT_PTY_ROWS,
    agentState: stateTracker.currentState,
    agentStateChangedAt: Date.now(),
    stateTracker,
    isBootstrapCommandSent: false,
    scrollbackChunks: [],
    scrollbackBytes: 0,
    pendingInput: "",
    keepAliveWithoutClients:
      Boolean(terminalRecord?.initialPrompt) || tentacleId === SENTIPH_TENTACLE_ID,
  };

  if (debugLog) {
    session.debugLog = debugLog;
  }
  if (claudePlan.flags.length > 0) {
    session.claudeBootstrapFlags = claudePlan.flags;
  }
  if (claudePlan.banner) {
    session.claudeResumeBanner = claudePlan.banner;
  }

  const transcriptLog = openTranscriptLog(sessionId);
  if (transcriptLog) {
    session.transcriptLog = transcriptLog;
    session.transcriptEventCount = 0;
  }

  appendDebugLog(session, `session-start session=${sessionId} tentacle=${tentacleId}`);
  const startedAt = new Date().toISOString();
  const processId =
    typeof pty.pid === "number" && Number.isInteger(pty.pid) && pty.pid > 0 ? pty.pid : undefined;

  appendTranscriptEvent(session, {
    type: "session_start",
    eventId: `${sessionId}:${++ctx.transcriptEventSequence.value}`,
    sessionId,
    tentacleId,
    timestamp: startedAt,
  });

  ctx.onSessionStart?.(sessionId, {
    startedAt,
    ...(processId ? { processId } : {}),
  });

  session.statePollTimer = setInterval(() => {
    ctx.emitStateIfChanged(session, sessionId, session.stateTracker.poll(Date.now()));
  }, 300);

  const dataDisposable = session.pty.onData((chunk) => {
    if (session.isClosed) {
      return;
    }

    appendDebugLog(session, `pty-output session=${sessionId} chunk=${JSON.stringify(chunk)}`);
    ctx.appendScrollback(session, chunk);
    ctx.onOutputChunk?.(sessionId, chunk);
    const nextState = session.stateTracker.observeChunk(chunk, Date.now());
    ctx.broadcastMessage(session, { type: "output", data: chunk });
    ctx.emitStateIfChanged(session, sessionId, nextState);
  });

  const exitDisposable = session.pty.onExit(({ exitCode, signal }) => {
    if (session.isClosed) {
      return;
    }

    const message = `\r\n[terminal exited (code ${exitCode}, signal ${signal})]\r\n`;
    ctx.broadcastMessage(session, { type: "output", data: message });

    appendDebugLog(session, `session-exit session=${sessionId} code=${exitCode} signal=${signal}`);
    ctx.teardownSession(
      sessionId,
      session,
      {
        type: "session_end",
        reason: "pty_exit",
        ...(Number.isFinite(exitCode) ? { exitCode } : {}),
        ...(Number.isFinite(signal) ? { signal } : {}),
        timestamp: new Date().toISOString(),
      },
      { killPty: false },
    );
  });
  session.ptyDisposables = [dataDisposable, exitDisposable];

  if (terminalRecord?.initialPrompt) {
    session.initialPrompt = terminalRecord.initialPrompt;
  }
  if (terminalRecord?.initialInputDraft) {
    session.initialInputDraft = terminalRecord.initialInputDraft;
  }

  ctx.sessions.set(sessionId, session);
  return session;
};
