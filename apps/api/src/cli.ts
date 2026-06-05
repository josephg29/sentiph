import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";

import {
  ensureProjectScaffold,
  ensureSentiphGitignoreEntry,
  loadProjectConfig,
  loadProjectsRegistry,
  migrateStateToGlobal,
  registerProject,
  resolveEphemeralProjectStateDir,
  resolveProjectStateDir,
} from "./projectPersistence";
import { clearRuntimeMetadata, readRuntimeMetadata, writeRuntimeMetadata } from "./runtimeMetadata";
import {
  collectStartupPrerequisiteReport,
  formatStartupPrerequisiteReport,
} from "./startupPrerequisites";

const args = process.argv.slice(2);
const command = args[0];

const resolvePackageRoot = () => {
  const envRoot = process.env.SENTIPH_PACKAGE_ROOT?.trim();
  if (envRoot) {
    return resolve(envRoot);
  }

  const candidates = [
    resolve(import.meta.dirname ?? ".", "../.."),
    resolve(import.meta.dirname ?? ".", "../../.."),
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }

  return candidates[0] ?? process.cwd();
};

const PACKAGE_ROOT = resolvePackageRoot();

const resolveRuntimeAssetPath = (...relativePathCandidates: [string[], ...string[][]]) => {
  for (const relativePath of relativePathCandidates) {
    const candidate = join(PACKAGE_ROOT, ...relativePath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return join(PACKAGE_ROOT, ...relativePathCandidates[0]);
};

const DEFAULT_START_PORT = 8787;
const MAX_PORT_ATTEMPTS = 200;

const initializeProject = (workspaceCwd: string, preferredName?: string) => {
  const projectName = preferredName?.trim() || basename(workspaceCwd) || "sentiph-project";
  const hadConfig = loadProjectConfig(workspaceCwd) !== null;
  const projectConfig = ensureProjectScaffold(workspaceCwd, projectName);
  ensureSentiphGitignoreEntry(workspaceCwd);
  registerProject(workspaceCwd, projectConfig.displayName);
  const projectStateDir = resolveProjectStateDir(workspaceCwd, projectConfig.displayName);
  migrateStateToGlobal(workspaceCwd, projectStateDir);
  return {
    created: !hadConfig,
    projectConfig,
    projectStateDir,
  };
};

const resolveStartupProjectContext = (workspaceCwd: string) => {
  const existingConfig = loadProjectConfig(workspaceCwd);
  if (existingConfig) {
    registerProject(workspaceCwd, existingConfig.displayName);
    const projectStateDir = resolveProjectStateDir(workspaceCwd, existingConfig.displayName);
    migrateStateToGlobal(workspaceCwd, projectStateDir);
    return {
      isInitialized: true,
      projectDisplayName: existingConfig.displayName,
      projectStateDir,
    };
  }

  const projectDisplayName = basename(workspaceCwd) || "sentiph-project";
  const projectStateDir = resolveEphemeralProjectStateDir(workspaceCwd);
  return {
    isInitialized: false,
    projectDisplayName,
    projectStateDir,
  };
};

const initProject = (name?: string) => {
  const projectPath = process.cwd();
  const { created, projectConfig, projectStateDir } = initializeProject(projectPath, name);

  console.log(
    `${created ? "Initialized" : "Updated"} Sentiph project "${projectConfig.displayName}" at ${projectPath}`,
  );
  console.log("  .sentiph/ directory ready (project metadata, tentacles, worktrees)");
  console.log(`  Global state: ${projectStateDir}`);
  console.log("  .gitignore updated");
  console.log("\nRun `sentiph` to start the dashboard.");
};

const canListenOnPort = (port: number): Promise<boolean> =>
  new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, "127.0.0.1");
  });

const findOpenPort = async (startPort: number): Promise<number> => {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = startPort + offset;
    if (port > 65535) {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    if (await canListenOnPort(port)) {
      return port;
    }
  }

  throw new Error(`Unable to find an open port starting from ${startPort}`);
};

const readPreferredStartPort = () => {
  const rawPort = process.env.SENTIPH_API_PORT ?? process.env.PORT;
  if (!rawPort) {
    return DEFAULT_START_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_START_PORT;
  }

  return parsed;
};

const resolveRuntimeApiBase = () => {
  const explicitBase =
    process.env.SENTIPH_API_ORIGIN?.trim() || process.env.SENTIPH_API_BASE?.trim();
  if (explicitBase) {
    return explicitBase;
  }

  const projectConfig = loadProjectConfig(process.cwd());
  if (projectConfig) {
    const projectStateDir = resolveProjectStateDir(process.cwd(), projectConfig.displayName);
    const runtimeMetadata = readRuntimeMetadata(projectStateDir);
    if (runtimeMetadata) {
      return runtimeMetadata.apiBaseUrl;
    }
  }

  return `http://127.0.0.1:${readPreferredStartPort()}`;
};

const apiError = () => {
  console.error(
    `Error: Could not reach API at ${resolveRuntimeApiBase()}. Start Sentiph in this project first.`,
  );
  process.exit(1);
};

const maybeOpenBrowser = (url: string) => {
  if (process.env.SENTIPH_NO_OPEN === "1" || process.env.CI === "1") {
    return;
  }

  const command =
    process.platform === "darwin"
      ? { file: "open", args: [url] }
      : process.platform === "win32"
        ? { file: "cmd", args: ["/c", "start", "", url] }
        : { file: "xdg-open", args: [url] };

  try {
    const child = spawn(command.file, command.args, {
      stdio: "ignore",
      detached: true,
    });
    child.unref();
  } catch {
    // Best-effort browser open.
  }
};

const startServer = async () => {
  const startupPrerequisiteReport = collectStartupPrerequisiteReport();
  const startupPrerequisiteLines = formatStartupPrerequisiteReport(startupPrerequisiteReport);
  if (startupPrerequisiteLines.length > 0) {
    for (const line of startupPrerequisiteLines) {
      if (startupPrerequisiteReport.errors.length > 0) {
        console.error(line);
      } else {
        console.warn(line);
      }
    }
    if (startupPrerequisiteReport.errors.length > 0) {
      process.exit(1);
    }
    console.warn("");
  }

  const workspaceCwd = process.cwd();
  const { isInitialized, projectDisplayName, projectStateDir } =
    resolveStartupProjectContext(workspaceCwd);
  const webDistDir = resolveRuntimeAssetPath(["dist", "web"], ["apps", "web", "dist"]);
  const port = await findOpenPort(readPreferredStartPort());
  const { createApiServer } = await import("./createApiServer");

  const apiServer = createApiServer({
    workspaceCwd,
    projectStateDir,
    webDistDir: existsSync(webDistDir) ? webDistDir : undefined,
    allowRemoteAccess: process.env.SENTIPH_ALLOW_REMOTE_ACCESS === "1",
  });

  const shutdown = async () => {
    clearRuntimeMetadata(projectStateDir);
    await apiServer.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const { host, port: activePort } = await apiServer.start(port, "127.0.0.1");
  const apiBaseUrl = `http://${host}:${activePort}`;
  writeRuntimeMetadata(projectStateDir, {
    apiBaseUrl,
    host,
    port: activePort,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    workspaceCwd,
  });

  const hasWebDist = existsSync(webDistDir);
  if (hasWebDist) {
    maybeOpenBrowser(apiBaseUrl);
  }

  console.log();
  console.log("  Sentiph is running");
  console.log(`  Project: ${workspaceCwd}`);
  console.log(`  Name:    ${projectDisplayName}`);
  console.log(`  API:     ${apiBaseUrl}`);
  if (hasWebDist) {
    console.log(`  UI:      ${apiBaseUrl}`);
  } else {
    console.log("  UI:      bundled web assets are missing from this install");
  }
  console.log();
};

const parseFlag = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
};

const terminalCreate = async () => {
  const name = parseFlag("--name") ?? parseFlag("-n");
  const initialPrompt = parseFlag("--initial-prompt") ?? parseFlag("-p");
  const workspaceMode = parseFlag("--workspace-mode") ?? parseFlag("-w") ?? "shared";
  const terminalId = parseFlag("--terminal-id");
  // `--session-id` is the documented Quickstart alias for `--tentacle-id`.
  const tentacleId = parseFlag("--tentacle-id") ?? parseFlag("--session-id");
  const nameOrigin = parseFlag("--name-origin");
  const autoRenamePromptContext = parseFlag("--auto-rename-prompt-context");
  const apiBase = resolveRuntimeApiBase();

  const body: Record<string, unknown> = {};
  if (name) body.name = name;
  if (initialPrompt) body.initialPrompt = initialPrompt;
  if (workspaceMode) body.workspaceMode = workspaceMode;
  if (terminalId) body.terminalId = terminalId;
  if (tentacleId) body.tentacleId = tentacleId;
  if (nameOrigin) body.nameOrigin = nameOrigin;
  if (autoRenamePromptContext) body.autoRenamePromptContext = autoRenamePromptContext;

  try {
    const response = await fetch(`${apiBase}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      console.error(`Error: ${data.error ?? "Failed"}`);
      process.exit(1);
    }
    console.log(`Created terminal "${data.terminalId}"`);
  } catch {
    apiError();
  }
};

const terminalList = async () => {
  const apiBase = resolveRuntimeApiBase();

  try {
    const response = await fetch(`${apiBase}/api/terminal-snapshots`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.error("Error: failed to fetch terminals.");
      process.exit(1);
    }

    const terminals = (await response.json()) as Array<Record<string, unknown>>;
    if (terminals.length === 0) {
      console.log("No terminals found.");
      return;
    }

    for (const terminal of terminals) {
      const terminalId = String(terminal.terminalId ?? "");
      const name = String(terminal.tentacleName ?? terminal.label ?? terminalId);
      const lifecycle = String(terminal.lifecycleState ?? terminal.state ?? "unknown");
      const pid =
        typeof terminal.processId === "number" && Number.isFinite(terminal.processId)
          ? ` pid=${terminal.processId}`
          : "";
      const reason =
        typeof terminal.lifecycleReason === "string" ? ` reason=${terminal.lifecycleReason}` : "";
      console.log(`  ${terminalId}  ${lifecycle}${pid}${reason}  ${name}`);
    }
  } catch {
    apiError();
  }
};

const terminalAction = async (action: "stop" | "kill") => {
  const terminalId = args[2];
  if (!terminalId || terminalId.startsWith("-")) {
    console.error("Error: terminalId is required.");
    process.exit(1);
  }

  const apiBase = resolveRuntimeApiBase();
  try {
    const response = await fetch(
      `${apiBase}/api/terminals/${encodeURIComponent(terminalId)}/${action}`,
      {
        method: "POST",
        headers: { Accept: "application/json" },
      },
    );
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      console.error(`Error: ${data.error ?? "Failed"}`);
      process.exit(1);
    }
    console.log(`${action === "kill" ? "Killed" : "Stopped"} terminal "${data.terminalId}"`);
  } catch {
    apiError();
  }
};

const terminalPrune = async () => {
  const apiBase = resolveRuntimeApiBase();

  try {
    const response = await fetch(`${apiBase}/api/terminals/prune`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const data = (await response.json()) as { prunedTerminalIds?: string[]; error?: unknown };
    if (!response.ok) {
      console.error(`Error: ${data.error ?? "Failed"}`);
      process.exit(1);
    }

    const prunedTerminalIds = data.prunedTerminalIds ?? [];
    if (prunedTerminalIds.length === 0) {
      console.log("No stale, stopped, or exited terminals to prune.");
      return;
    }
    console.log(`Pruned ${prunedTerminalIds.length} terminal(s): ${prunedTerminalIds.join(", ")}`);
  } catch {
    apiError();
  }
};

const tentacleCreate = async () => {
  const name = args[2];
  if (!name || name.startsWith("-")) {
    console.error("Error: tentacle name is required.");
    process.exit(1);
  }

  const description = parseFlag("--description") ?? parseFlag("-d") ?? "";
  const id = parseFlag("--id") ?? parseFlag("--tentacle-id");
  const apiBase = resolveRuntimeApiBase();

  const body: Record<string, unknown> = { name, description };
  if (id) body.tentacleId = id;

  try {
    const response = await fetch(`${apiBase}/api/tentacles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      console.error(`Error: ${data.error ?? "Failed"}`);
      process.exit(1);
    }
    console.log(`Created session "${data.tentacleId}"`);
  } catch {
    apiError();
  }
};

const tentacleList = async () => {
  const apiBase = resolveRuntimeApiBase();

  try {
    const response = await fetch(`${apiBase}/api/tentacles`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.error("Error: failed to fetch sessions.");
      process.exit(1);
    }

    const tentacles = (await response.json()) as Array<Record<string, unknown>>;
    if (tentacles.length === 0) {
      console.log("No sessions found.");
      return;
    }

    for (const tentacle of tentacles) {
      const description =
        typeof tentacle.description === "string" && tentacle.description.length > 0
          ? `  ${tentacle.description}`
          : "";
      console.log(`  ${tentacle.tentacleId}  ${tentacle.name}${description}`);
    }
  } catch {
    apiError();
  }
};

const channelSend = async () => {
  const rest = args.slice(2);
  const positionals = rest.filter(
    (value, index) =>
      !value.startsWith("-") && rest[index - 1] !== "--from" && rest[index - 1] !== "-f",
  );
  const toTerminalId = positionals[0];
  const content = positionals[1];

  if (!toTerminalId) {
    console.error("Error: terminalId is required.");
    process.exit(1);
  }
  if (!content) {
    console.error("Error: message content is required.");
    process.exit(1);
  }

  const fromTerminalId =
    parseFlag("--from") ?? parseFlag("-f") ?? process.env.SENTIPH_SESSION_ID ?? "cli";
  const apiBase = resolveRuntimeApiBase();

  try {
    const response = await fetch(
      `${apiBase}/api/channels/${encodeURIComponent(toTerminalId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromTerminalId, content }),
      },
    );
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      console.error(`Error: ${data.error ?? "Failed"}`);
      process.exit(1);
    }
    console.log(`Sent message from "${fromTerminalId}" to "${toTerminalId}"`);
  } catch {
    apiError();
  }
};

const channelList = async () => {
  const terminalId = args[2];
  if (!terminalId || terminalId.startsWith("-")) {
    console.error("Error: terminalId is required.");
    process.exit(1);
  }

  const apiBase = resolveRuntimeApiBase();

  try {
    const response = await fetch(
      `${apiBase}/api/channels/${encodeURIComponent(terminalId)}/messages`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      console.error("Error: failed to fetch messages.");
      process.exit(1);
    }

    const messages = (await response.json()) as Array<Record<string, unknown>>;
    if (messages.length === 0) {
      console.log("No messages.");
      return;
    }

    for (const message of messages) {
      const status = message.delivered ? "delivered" : "queued";
      console.log(
        `  [${status}] ${message.fromTerminalId} -> ${message.toTerminalId}: ${message.content}`,
      );
    }
  } catch {
    apiError();
  }
};

const main = async () => {
  if (!command || command === "start") {
    return startServer();
  }

  if (command === "init") {
    return initProject(args[1]);
  }

  if (command === "projects" || command === "project") {
    const projects = loadProjectsRegistry().projects;
    if (projects.length === 0) {
      console.log(
        "No projects registered yet. Run `sentiph` or `sentiph init` in a project directory.",
      );
      return;
    }

    for (const project of projects) {
      console.log(`  ${project.name}  ${project.id}  ${project.path}`);
    }
    return;
  }

  if (command === "terminal" || command === "terminals") {
    if (args[1] === "create") {
      return terminalCreate();
    }
    if (args[1] === "list" || args[1] === "ls") {
      return terminalList();
    }
    if (args[1] === "stop") {
      return terminalAction("stop");
    }
    if (args[1] === "kill") {
      return terminalAction("kill");
    }
    if (args[1] === "prune") {
      return terminalPrune();
    }
  }

  if (command === "tentacle" || command === "tentacles" || command === "session") {
    if (args[1] === "create") {
      return tentacleCreate();
    }
    if (args[1] === "list" || args[1] === "ls") {
      return tentacleList();
    }
  }

  if (command === "channel" || command === "channels") {
    if (args[1] === "send") {
      return channelSend();
    }
    if (args[1] === "list" || args[1] === "ls") {
      return channelList();
    }
  }

  console.log(`Usage:
  sentiph                             Start the dashboard in the current project
  sentiph init [project-name]         Initialize the current directory explicitly
  sentiph projects                    List registered projects

  sentiph tentacle create <name>      Create a session
    --description, -d                  Session description
    --id                               Explicit session/tentacle ID
  sentiph tentacle list               List sessions

  sentiph terminal create [options]   Create a terminal
    --name, -n                         Terminal display name
    --workspace-mode, -w               shared | worktree
    --initial-prompt, -p               Raw initial prompt text
    --terminal-id                      Explicit terminal ID
    --tentacle-id, --session-id        Existing session/tentacle ID to attach to
  sentiph terminal list               List terminal lifecycle state
  sentiph terminal stop <id>          Stop a terminal session
  sentiph terminal kill <id>          Kill a terminal session or recorded process
  sentiph terminal prune              Remove stale, stopped, and exited terminal records

  sentiph channel send <id> "msg"     Send a channel message to a terminal
    --from, -f                         Sender terminal ID (defaults to SENTIPH_SESSION_ID)
  sentiph channel list <id>           List channel messages for a terminal`);
  process.exit(1);
};

main();
