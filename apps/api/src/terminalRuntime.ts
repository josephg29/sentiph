import { execFileSync } from "node:child_process";
import {
  type WriteStream,
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
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
  codexState: CodexRuntimeState;
  stateTracker: CodexStateTracker;
  statePollTimer?: ReturnType<typeof setInterval>;
  debugLog?: WriteStream;
};

type PersistedTentacle = {
  tentacleId: string;
  tentacleName: string;
  createdAt: string;
  codexBootstrapped: boolean;
  workspaceMode: TentacleWorkspaceMode;
};

export type PersistedUiState = {
  isAgentsSidebarVisible?: boolean;
  sidebarWidth?: number;
  isActiveAgentsSectionExpanded?: boolean;
  isCodexUsageSectionExpanded?: boolean;
  minimizedTentacleIds?: string[];
  tentacleWidths?: Record<string, number>;
};

type TentacleRegistryDocument = {
  version: 2;
  nextTentacleNumber: number;
  tentacles: PersistedTentacle[];
  uiState?: PersistedUiState;
};

export type TmuxClient = {
  assertAvailable(): void;
  hasSession(sessionName: string): boolean;
  configureSession(sessionName: string): void;
  capturePane(sessionName: string): string;
  createSession(options: { sessionName: string; cwd: string; command?: string }): void;
  killSession(sessionName: string): void;
};

export type TentacleWorkspaceMode = "shared" | "worktree";

export type GitClient = {
  assertAvailable(): void;
  isRepository(cwd: string): boolean;
  addWorktree(options: { cwd: string; path: string; branchName: string; baseRef: string }): void;
  removeWorktree(options: { cwd: string; path: string }): void;
};

export class RuntimeInputError extends Error {}

type CreateTerminalRuntimeOptions = {
  workspaceCwd: string;
  tmuxClient?: TmuxClient;
  gitClient?: GitClient;
};

const TENTACLE_ID_PREFIX = "tentacle-";
const TMUX_SESSION_PREFIX = "octogent_";
const TENTACLE_REGISTRY_VERSION = 2;
const TENTACLE_REGISTRY_RELATIVE_PATH = ".octogent/state/tentacles.json";
const TENTACLE_WORKTREE_RELATIVE_PATH = ".octogent/worktrees";
const TENTACLE_WORKTREE_BRANCH_PREFIX = "octogent/";
const TENTACLE_BOOTSTRAP_COMMAND = "codex";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parsePersistedUiState = (value: unknown): PersistedUiState => {
  if (!isRecord(value)) {
    return {};
  }

  const nextState: PersistedUiState = {};

  if (typeof value.isAgentsSidebarVisible === "boolean") {
    nextState.isAgentsSidebarVisible = value.isAgentsSidebarVisible;
  }

  if (typeof value.sidebarWidth === "number" && Number.isFinite(value.sidebarWidth)) {
    nextState.sidebarWidth = value.sidebarWidth;
  }

  if (typeof value.isActiveAgentsSectionExpanded === "boolean") {
    nextState.isActiveAgentsSectionExpanded = value.isActiveAgentsSectionExpanded;
  }

  if (typeof value.isCodexUsageSectionExpanded === "boolean") {
    nextState.isCodexUsageSectionExpanded = value.isCodexUsageSectionExpanded;
  }

  if (Array.isArray(value.minimizedTentacleIds)) {
    const minimizedTentacleIds = value.minimizedTentacleIds.filter(
      (tentacleId): tentacleId is string => typeof tentacleId === "string",
    );
    nextState.minimizedTentacleIds = [...new Set(minimizedTentacleIds)];
  }

  if (isRecord(value.tentacleWidths)) {
    const tentacleWidths = Object.entries(value.tentacleWidths).reduce<Record<string, number>>(
      (acc, [tentacleId, width]) => {
        if (typeof width === "number" && Number.isFinite(width)) {
          acc[tentacleId] = width;
        }
        return acc;
      },
      {},
    );
    nextState.tentacleWidths = tentacleWidths;
  }

  return nextState;
};

const pruneUiStateTentacleReferences = (
  uiState: PersistedUiState,
  tentacles: Map<string, PersistedTentacle>,
): PersistedUiState => {
  const activeTentacleIds = new Set(tentacles.keys());
  const nextState: PersistedUiState = {
    ...uiState,
  };

  if (nextState.minimizedTentacleIds) {
    nextState.minimizedTentacleIds = nextState.minimizedTentacleIds.filter((tentacleId) =>
      activeTentacleIds.has(tentacleId),
    );
  }

  if (nextState.tentacleWidths) {
    nextState.tentacleWidths = Object.entries(nextState.tentacleWidths).reduce<
      Record<string, number>
    >((acc, [tentacleId, width]) => {
      if (activeTentacleIds.has(tentacleId)) {
        acc[tentacleId] = width;
      }
      return acc;
    }, {});
  }

  return nextState;
};

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const tmuxSessionNameForTentacle = (tentacleId: string) => {
  // tmux target parsing treats punctuation as selectors; keep names explicit and stable.
  const sanitizedTentacleId = tentacleId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${TMUX_SESSION_PREFIX}${sanitizedTentacleId}`;
};

const readCommandErrorOutput = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === "string") {
    return stderr;
  }
  if (stderr instanceof Buffer) {
    return stderr.toString("utf8");
  }
  return "";
};

const isMissingTmuxSessionError = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { status?: unknown }).status === "number" &&
    (error as { status: number }).status === 1
  ) {
    return true;
  }

  const output = readCommandErrorOutput(error).toLowerCase();
  return output.includes("can't find session") || output.includes("no server running");
};

const createDefaultTmuxClient = (): TmuxClient => ({
  assertAvailable() {
    try {
      execFileSync("tmux", ["-V"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`tmux is required for terminal runtime: ${toErrorMessage(error)}`);
    }
  },

  hasSession(sessionName) {
    try {
      execFileSync("tmux", ["has-session", "-t", sessionName], { stdio: "pipe" });
      return true;
    } catch (error) {
      if (isMissingTmuxSessionError(error)) {
        return false;
      }
      throw error;
    }
  },

  configureSession(sessionName) {
    execFileSync("tmux", ["set-option", "-t", sessionName, "status", "off"], {
      stdio: "pipe",
    });
  },

  capturePane(sessionName) {
    try {
      return execFileSync(
        "tmux",
        ["capture-pane", "-a", "-e", "-p", "-S", "-32768", "-t", sessionName],
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );
    } catch (error) {
      if (isMissingTmuxSessionError(error)) {
        return "";
      }
      throw error;
    }
  },

  createSession({ sessionName, cwd, command }) {
    const args = ["new-session", "-d", "-s", sessionName, "-c", cwd];
    if (command && command.length > 0) {
      args.push(command);
    }
    execFileSync("tmux", args, {
      stdio: "pipe",
    });
  },

  killSession(sessionName) {
    try {
      execFileSync("tmux", ["kill-session", "-t", sessionName], { stdio: "pipe" });
    } catch (error) {
      if (isMissingTmuxSessionError(error)) {
        return;
      }
      throw error;
    }
  },
});

const createDefaultGitClient = (): GitClient => ({
  assertAvailable() {
    try {
      execFileSync("git", ["--version"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`git is required for worktree tentacles: ${toErrorMessage(error)}`);
    }
  },

  isRepository(cwd) {
    try {
      const output = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      });
      return output.trim() === "true";
    } catch {
      return false;
    }
  },

  addWorktree({ cwd, path, branchName, baseRef }) {
    mkdirSync(dirname(path), { recursive: true });
    execFileSync("git", ["worktree", "add", "-b", branchName, path, baseRef], {
      cwd,
      stdio: "pipe",
    });
  },

  removeWorktree({ cwd, path }) {
    execFileSync("git", ["worktree", "remove", "--force", path], {
      cwd,
      stdio: "pipe",
    });
  },
});

const parseRegistryDocument = (
  raw: string,
  registryPath: string,
): {
  tentacles: Map<string, PersistedTentacle>;
  nextTentacleNumber: number;
  uiState: PersistedUiState;
} => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid tentacle registry JSON (${registryPath}): ${toErrorMessage(error)}`);
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Invalid tentacle registry shape (${registryPath}).`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== 1 && record.version !== TENTACLE_REGISTRY_VERSION) {
    throw new Error(
      `Unsupported tentacle registry version in ${registryPath}: ${String(record.version)}`,
    );
  }

  const rawTentacles = record.tentacles;
  if (!Array.isArray(rawTentacles)) {
    throw new Error(`Invalid tentacle registry tentacles array (${registryPath}).`);
  }

  const tentacles = new Map<string, PersistedTentacle>();
  let maxTentacleNumber = 0;

  for (const item of rawTentacles) {
    if (item === null || typeof item !== "object") {
      throw new Error(`Invalid tentacle entry in registry (${registryPath}).`);
    }

    const entry = item as Record<string, unknown>;
    const tentacleId = typeof entry.tentacleId === "string" ? entry.tentacleId : null;
    const tentacleName = typeof entry.tentacleName === "string" ? entry.tentacleName : null;
    const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : null;
    const codexBootstrapped =
      typeof entry.codexBootstrapped === "boolean" ? entry.codexBootstrapped : true;

    if (!tentacleId || !tentacleName || !createdAt) {
      throw new Error(`Incomplete tentacle entry in registry (${registryPath}).`);
    }

    const rawWorkspaceMode = entry.workspaceMode;
    const workspaceMode: TentacleWorkspaceMode =
      rawWorkspaceMode === "worktree" || rawWorkspaceMode === "shared"
        ? rawWorkspaceMode
        : "shared";

    const tentacleNumber = parseTentacleNumber(tentacleId);
    if (tentacleNumber === null) {
      throw new Error(`Invalid tentacle id in registry (${registryPath}): ${tentacleId}`);
    }

    if (tentacles.has(tentacleId)) {
      throw new Error(`Duplicate tentacle id in registry (${registryPath}): ${tentacleId}`);
    }

    maxTentacleNumber = Math.max(maxTentacleNumber, tentacleNumber);
    tentacles.set(tentacleId, {
      tentacleId,
      tentacleName,
      createdAt,
      codexBootstrapped,
      workspaceMode,
    });
  }

  const rawNextTentacleNumber = record.nextTentacleNumber;
  const nextTentacleNumber =
    typeof rawNextTentacleNumber === "number" &&
    Number.isInteger(rawNextTentacleNumber) &&
    rawNextTentacleNumber >= 1
      ? rawNextTentacleNumber
      : 1;

  return {
    tentacles,
    nextTentacleNumber: Math.max(nextTentacleNumber, maxTentacleNumber + 1, 1),
    uiState: pruneUiStateTentacleReferences(parsePersistedUiState(record.uiState), tentacles),
  };
};

const loadTentacleRegistry = (registryPath: string) => {
  if (!existsSync(registryPath)) {
    return {
      tentacles: new Map<string, PersistedTentacle>(),
      nextTentacleNumber: 1,
      uiState: {} as PersistedUiState,
    };
  }

  const raw = readFileSync(registryPath, "utf8");
  return parseRegistryDocument(raw, registryPath);
};

const persistTentacleRegistry = (
  registryPath: string,
  state: {
    tentacles: Map<string, PersistedTentacle>;
    nextTentacleNumber: number;
    uiState: PersistedUiState;
  },
) => {
  const document: TentacleRegistryDocument = {
    version: TENTACLE_REGISTRY_VERSION,
    nextTentacleNumber: state.nextTentacleNumber,
    tentacles: [...state.tentacles.values()],
    uiState: state.uiState,
  };

  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
};

export const createTerminalRuntime = ({
  workspaceCwd,
  tmuxClient = createDefaultTmuxClient(),
  gitClient = createDefaultGitClient(),
}: CreateTerminalRuntimeOptions) => {
  const sessions = new Map<string, TerminalSession>();
  const websocketServer = new WebSocketServer({ noServer: true });
  const registryPath = join(workspaceCwd, TENTACLE_REGISTRY_RELATIVE_PATH);
  const registryState = loadTentacleRegistry(registryPath);
  const tentacles = registryState.tentacles;
  let nextTentacleNumber = registryState.nextTentacleNumber;
  let uiState = registryState.uiState;
  const isDebugPtyLogsEnabled = process.env.OCTOGENT_DEBUG_PTY_LOGS === "1";
  const ptyLogDir =
    process.env.OCTOGENT_DEBUG_PTY_LOG_DIR ?? join(workspaceCwd, ".octogent", "logs");

  tmuxClient.assertAvailable();

  const persistRegistry = () => {
    uiState = pruneUiStateTentacleReferences(uiState, tentacles);
    persistTentacleRegistry(registryPath, {
      tentacles,
      nextTentacleNumber,
      uiState,
    });
  };

  const getTentacleWorktreePath = (tentacleId: string) =>
    join(workspaceCwd, TENTACLE_WORKTREE_RELATIVE_PATH, tentacleId);

  const getTentacleWorkspaceCwd = (tentacleId: string) => {
    const tentacle = tentacles.get(tentacleId);
    if (!tentacle) {
      throw new Error(`Unknown tentacle: ${tentacleId}`);
    }

    if (tentacle.workspaceMode === "worktree") {
      return getTentacleWorktreePath(tentacleId);
    }

    return workspaceCwd;
  };

  const assertWorktreeCreationSupported = () => {
    gitClient.assertAvailable();
    if (!gitClient.isRepository(workspaceCwd)) {
      throw new RuntimeInputError(
        "Worktree tentacles require a git repository at the workspace root.",
      );
    }
  };

  const createTentacleWorktree = (tentacleId: string) => {
    assertWorktreeCreationSupported();
    const worktreePath = getTentacleWorktreePath(tentacleId);
    if (existsSync(worktreePath)) {
      throw new RuntimeInputError(`Worktree path already exists: ${worktreePath}`);
    }

    try {
      gitClient.addWorktree({
        cwd: workspaceCwd,
        path: worktreePath,
        branchName: `${TENTACLE_WORKTREE_BRANCH_PREFIX}${tentacleId}`,
        baseRef: "HEAD",
      });
    } catch (error) {
      throw new Error(`Unable to create worktree for ${tentacleId}: ${toErrorMessage(error)}`);
    }
  };

  const removeTentacleWorktree = (tentacleId: string) => {
    const worktreePath = getTentacleWorktreePath(tentacleId);
    if (!existsSync(worktreePath)) {
      return;
    }

    try {
      gitClient.removeWorktree({
        cwd: workspaceCwd,
        path: worktreePath,
      });
    } catch {
      // Best effort rollback cleanup.
    }
  };

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

  const allocateTentacleId = () => {
    while (true) {
      const candidateTentacleId = `${TENTACLE_ID_PREFIX}${nextTentacleNumber}`;
      if (tentacles.has(candidateTentacleId)) {
        nextTentacleNumber += 1;
        continue;
      }

      if (tmuxClient.hasSession(tmuxSessionNameForTentacle(candidateTentacleId))) {
        nextTentacleNumber += 1;
        continue;
      }

      break;
    }

    const tentacleId = `${TENTACLE_ID_PREFIX}${nextTentacleNumber}`;
    nextTentacleNumber += 1;
    return tentacleId;
  };

  const buildRootSnapshot = (tentacle: PersistedTentacle): AgentSnapshot => ({
    agentId: `${tentacle.tentacleId}-root`,
    label: `${tentacle.tentacleId}-root`,
    state: "live",
    tentacleId: tentacle.tentacleId,
    tentacleName: tentacle.tentacleName,
    tentacleWorkspaceMode: tentacle.workspaceMode,
    createdAt: tentacle.createdAt,
  });

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

  const createTentacle = ({
    tentacleName,
    workspaceMode = "shared",
  }: {
    tentacleName?: string;
    workspaceMode?: TentacleWorkspaceMode;
  }): AgentSnapshot => {
    const tentacleId = allocateTentacleId();
    const tentacle: PersistedTentacle = {
      tentacleId,
      tentacleName: tentacleName ?? tentacleId,
      createdAt: new Date().toISOString(),
      codexBootstrapped: false,
      workspaceMode,
    };

    const shouldCreateWorktree = workspaceMode === "worktree";
    if (shouldCreateWorktree) {
      createTentacleWorktree(tentacleId);
    }

    tentacles.set(tentacleId, tentacle);
    persistRegistry();

    try {
      ensureTmuxSession(tentacleId);
    } catch (error) {
      tentacles.delete(tentacleId);
      persistRegistry();
      if (shouldCreateWorktree) {
        removeTentacleWorktree(tentacleId);
      }
      throw error;
    }

    return buildRootSnapshot(tentacle);
  };

  const readUiState = (): PersistedUiState => {
    const normalized = pruneUiStateTentacleReferences(uiState, tentacles);
    const result: PersistedUiState = { ...normalized };
    if (normalized.minimizedTentacleIds) {
      result.minimizedTentacleIds = [...normalized.minimizedTentacleIds];
    }
    if (normalized.tentacleWidths) {
      result.tentacleWidths = { ...normalized.tentacleWidths };
    }
    return result;
  };

  return {
    listAgentSnapshots(): AgentSnapshot[] {
      return [...tentacles.values()].map((tentacle) => buildRootSnapshot(tentacle));
    },

    readUiState,

    patchUiState(patch: PersistedUiState): PersistedUiState {
      if (patch.isAgentsSidebarVisible !== undefined) {
        uiState.isAgentsSidebarVisible = patch.isAgentsSidebarVisible;
      }
      if (patch.sidebarWidth !== undefined) {
        uiState.sidebarWidth = patch.sidebarWidth;
      }
      if (patch.isActiveAgentsSectionExpanded !== undefined) {
        uiState.isActiveAgentsSectionExpanded = patch.isActiveAgentsSectionExpanded;
      }
      if (patch.isCodexUsageSectionExpanded !== undefined) {
        uiState.isCodexUsageSectionExpanded = patch.isCodexUsageSectionExpanded;
      }
      if (patch.minimizedTentacleIds !== undefined) {
        uiState.minimizedTentacleIds = [...patch.minimizedTentacleIds];
      }
      if (patch.tentacleWidths !== undefined) {
        uiState.tentacleWidths = { ...patch.tentacleWidths };
      }

      persistRegistry();
      return readUiState();
    },

    createTentacle,

    renameTentacle(tentacleId: string, tentacleName: string): AgentSnapshot | null {
      const tentacle = tentacles.get(tentacleId);
      if (!tentacle) {
        return null;
      }

      tentacle.tentacleName = tentacleName;
      persistRegistry();
      return buildRootSnapshot(tentacle);
    },

    deleteTentacle(tentacleId: string): boolean {
      const tentacle = tentacles.get(tentacleId);
      if (!tentacle) {
        return false;
      }

      closeSession(tentacleId);
      tmuxClient.killSession(tmuxSessionNameForTentacle(tentacleId));
      tentacles.delete(tentacleId);
      persistRegistry();
      return true;
    },

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
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
        const paneSnapshot = tmuxClient.capturePane(tmuxSessionNameForTentacle(tentacleId));
        if (paneSnapshot.length > 0) {
          sendMessage(websocket, {
            type: "output",
            data: paneSnapshot,
          });
        }
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
