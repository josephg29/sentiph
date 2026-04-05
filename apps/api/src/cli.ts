import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createApiServer } from "./createApiServer";

const args = process.argv.slice(2);
const command = args[0];

const PACKAGE_ROOT = process.env.OCTOGENT_PACKAGE_ROOT ?? resolve(import.meta.dirname ?? ".", "../../..");

// ─── Global config ──────��───────────────────────────────────────────────

const GLOBAL_DIR = join(homedir(), ".octogent");
const PROJECTS_FILE = join(GLOBAL_DIR, "projects.json");

type ProjectEntry = { name: string; path: string; createdAt: string };
type ProjectsRegistry = { projects: ProjectEntry[] };

const ensureGlobalDir = () => {
  if (!existsSync(GLOBAL_DIR)) mkdirSync(GLOBAL_DIR, { recursive: true });
};

const loadProjects = (): ProjectsRegistry => {
  ensureGlobalDir();
  if (!existsSync(PROJECTS_FILE)) return { projects: [] };
  try {
    return JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
  } catch {
    return { projects: [] };
  }
};

const saveProjects = (registry: ProjectsRegistry) => {
  ensureGlobalDir();
  writeFileSync(PROJECTS_FILE, JSON.stringify(registry, null, 2), "utf-8");
};

const registerProject = (name: string, projectPath: string) => {
  const registry = loadProjects();
  const existing = registry.projects.find((p) => p.name === name);
  if (existing) {
    existing.path = projectPath;
    saveProjects(registry);
    return existing;
  }
  const entry: ProjectEntry = { name, path: projectPath, createdAt: new Date().toISOString() };
  registry.projects.push(entry);
  saveProjects(registry);
  return entry;
};

// ─── Init ────────────────────────────────────────────────────────────────

const ensureGitignore = (projectPath: string) => {
  const gitignorePath = join(projectPath, ".gitignore");
  const entry = ".octogent";

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.split("\n").map((l) => l.trim()).includes(entry)) return;
    appendFileSync(gitignorePath, `\n${entry}\n`, "utf-8");
  } else {
    writeFileSync(gitignorePath, `${entry}\n`, "utf-8");
  }
};

const initProject = (name: string) => {
  const projectPath = process.cwd();
  const octogentDir = join(projectPath, ".octogent");

  for (const sub of ["tentacles", "worktrees"]) {
    const dir = join(octogentDir, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  ensureGitignore(projectPath);
  registerProject(name, projectPath);

  // Create global state dir for the project.
  const globalStateDir = join(GLOBAL_DIR, "projects", name, "state");
  if (!existsSync(globalStateDir)) mkdirSync(globalStateDir, { recursive: true });

  console.log(`Initialized Octogent project "${name}" at ${projectPath}`);
  console.log("  .octogent/ directory created (tentacles, worktrees)");
  console.log("  ~/.octogent/projects/${name}/ created (state)");
  console.log("  .gitignore updated");
  console.log(`\nRun \`octogent\` to start the dashboard.`);
};

// ─── Start server ──────────��─────────────────────────────────────────────

const canListenOnPort = (port: number): Promise<boolean> =>
  new Promise((res) => {
    const srv = createServer();
    srv.once("error", () => res(false));
    srv.once("listening", () => {
      srv.close(() => res(true));
    });
    srv.listen(port, "127.0.0.1");
  });

const findOpenPort = async (startPort: number): Promise<number> => {
  for (let offset = 0; offset < 200; offset++) {
    const port = startPort + offset;
    if (port > 65535) break;
    if (await canListenOnPort(port)) return port;
  }
  throw new Error(`Unable to find an open port starting from ${startPort}`);
};

const resolveProjectStateDir = (workspaceCwd: string): string => {
  // Look up the project name from the global registry by path.
  const registry = loadProjects();
  const project = registry.projects.find((p) => p.path === workspaceCwd);
  if (project) {
    const dir = join(GLOBAL_DIR, "projects", project.name);
    if (!existsSync(join(dir, "state"))) mkdirSync(join(dir, "state"), { recursive: true });
    return dir;
  }
  // Fallback: use in-project .octogent (backwards compat).
  return join(workspaceCwd, ".octogent");
};

const migrateStateToGlobal = (workspaceCwd: string, projectStateDir: string) => {
  // Skip if state dir is the same (in-project fallback).
  if (projectStateDir === join(workspaceCwd, ".octogent")) return;

  const oldStateDir = join(workspaceCwd, ".octogent", "state");
  const newStateDir = join(projectStateDir, "state");
  if (!existsSync(oldStateDir)) return;
  if (existsSync(join(newStateDir, "tentacles.json"))) return;

  mkdirSync(newStateDir, { recursive: true });

  const stateFiles = [
    "tentacles.json",
    "deck.json",
    "monitor-config.json",
    "monitor-cache.json",
    "code-intel-events.jsonl",
  ];

  let migrated = 0;
  for (const file of stateFiles) {
    const src = join(oldStateDir, file);
    if (existsSync(src)) {
      copyFileSync(src, join(newStateDir, file));
      migrated++;
    }
  }

  const oldTranscripts = join(oldStateDir, "transcripts");
  if (existsSync(oldTranscripts)) {
    cpSync(oldTranscripts, join(newStateDir, "transcripts"), { recursive: true });
    migrated++;
  }

  if (migrated > 0) {
    console.log(`  Migrated state to ~/.octogent/projects/`);
  }
};

const startServer = async () => {
  const workspaceCwd = process.cwd();
  const promptsDir = join(PACKAGE_ROOT, "prompts");
  const webDistDir = join(PACKAGE_ROOT, "apps", "web", "dist");

  if (!existsSync(join(workspaceCwd, ".octogent"))) {
    console.error("No .octogent directory found. Run `octogent init <project-name>` first.");
    process.exit(1);
  }

  const projectStateDir = resolveProjectStateDir(workspaceCwd);
  await migrateStateToGlobal(workspaceCwd, projectStateDir);

  const startPort = Number.parseInt(process.env.OCTOGENT_API_PORT ?? "8787", 10);
  const port = await findOpenPort(startPort);

  const apiServer = createApiServer({
    workspaceCwd,
    projectStateDir,
    promptsDir,
    webDistDir: existsSync(webDistDir) ? webDistDir : undefined,
    allowRemoteAccess: process.env.OCTOGENT_ALLOW_REMOTE_ACCESS === "1",
  });

  const shutdown = async () => {
    await apiServer.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const { port: activePort } = await apiServer.start(port, "127.0.0.1");

  const hasWebDist = existsSync(webDistDir);
  console.log(`\n  Octogent is running`);
  console.log(`  Project: ${workspaceCwd}`);
  console.log(`  API:     http://127.0.0.1:${activePort}`);
  if (hasWebDist) {
    console.log(`  UI:      http://127.0.0.1:${activePort}`);
  } else {
    console.log(`  UI:      run \`pnpm build --filter @octogent/web\` then restart`);
  }
  console.log();
};

// ─── API client helpers ──────────────────────────────────────────────────

const API_PORT = process.env.OCTOGENT_API_PORT ?? process.env.PORT ?? "8787";
const API_BASE = `http://localhost:${API_PORT}`;

const COLORS = [
  "#ff6b2b", "#ff2d6b", "#00ffaa", "#bf5fff", "#00c8ff",
  "#ffee00", "#39ff14", "#ff4df0", "#00fff7", "#ff9500",
];
const ANIMATIONS = ["sway", "walk", "jog", "bounce", "float", "swim-up"];
const EXPRESSIONS = ["normal", "happy", "angry", "surprised"];
const ACCESSORIES = ["none", "none", "long", "mohawk", "side-sweep", "curly"];
const HAIR_COLORS = [
  "#4a2c0a", "#1a1a1a", "#c8a04a", "#e04020", "#f5f5f5", "#6b3fa0", "#2a6e3f", "#1e90ff",
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

const randomAppearance = () => ({
  color: pick(COLORS),
  octopus: {
    animation: pick(ANIMATIONS),
    expression: pick(EXPRESSIONS),
    accessory: pick(ACCESSORIES),
    hairColor: pick(HAIR_COLORS),
  },
});

const parseFlag = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
};

const apiError = (err: unknown) => {
  console.error(`Error: Could not reach API at ${API_BASE}. Is the server running?`);
  process.exit(1);
};

const tentacleCreate = async () => {
  const name = args[2];
  if (!name || name.startsWith("-")) {
    console.error("Error: tentacle name is required.");
    process.exit(1);
  }
  const description = parseFlag("--description") ?? parseFlag("-d") ?? "";
  const { color, octopus } = randomAppearance();
  try {
    const res = await fetch(`${API_BASE}/api/deck/tentacles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color, octopus }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) { console.error(`Error: ${data.error ?? "Failed"}`); process.exit(1); }
    console.log(`Created tentacle "${data.tentacleId}"`);
  } catch (err) { apiError(err); }
};

const tentacleList = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/deck/tentacles`);
    if (!res.ok) { console.error("Error: failed to fetch tentacles."); process.exit(1); }
    const tentacles = (await res.json()) as Array<Record<string, unknown>>;
    if (tentacles.length === 0) { console.log("No tentacles found."); return; }
    for (const t of tentacles) {
      const desc = t.description ? ` — ${t.description}` : "";
      console.log(`  ${t.tentacleId}${desc}`);
    }
  } catch (err) { apiError(err); }
};

const terminalCreate = async () => {
  const name = parseFlag("--name") ?? parseFlag("-n");
  const initialPrompt = parseFlag("--initial-prompt") ?? parseFlag("-p");
  const workspaceMode = parseFlag("--workspace-mode") ?? parseFlag("-w") ?? "shared";
  const body: Record<string, string> = {};
  if (name) body.tentacleName = name;
  if (initialPrompt) body.initialPrompt = initialPrompt;
  if (workspaceMode) body.workspaceMode = workspaceMode;
  try {
    const res = await fetch(`${API_BASE}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) { console.error(`Error: ${data.error ?? "Failed"}`); process.exit(1); }
    console.log(`Created terminal "${data.terminalId}"`);
  } catch (err) { apiError(err); }
};

const channelSend = async () => {
  const terminalId = args[2];
  if (!terminalId || terminalId.startsWith("-")) {
    console.error("Error: target terminalId is required.");
    process.exit(1);
  }
  const fromTerminalId = parseFlag("--from") ?? process.env.OCTOGENT_SESSION_ID ?? "";
  const fromIdx = args.indexOf("--from");
  let message: string;
  if (fromIdx !== -1) {
    message = args.slice(3).filter((_, i) => {
      const absIdx = i + 3;
      return absIdx !== fromIdx && absIdx !== fromIdx + 1;
    }).join(" ").trim();
  } else {
    message = args.slice(3).filter((a) => !a.startsWith("--from")).join(" ").trim();
  }
  if (!message) { console.error("Error: message content is required."); process.exit(1); }
  try {
    const res = await fetch(`${API_BASE}/api/channels/${encodeURIComponent(terminalId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromTerminalId, content: message }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) { console.error(`Error: ${data.error ?? "Failed"}`); process.exit(1); }
    console.log(`Message sent (${data.messageId}) to ${terminalId}`);
  } catch (err) { apiError(err); }
};

const channelList = async () => {
  const terminalId = args[2];
  if (!terminalId || terminalId.startsWith("-")) {
    console.error("Error: terminalId is required.");
    process.exit(1);
  }
  try {
    const res = await fetch(`${API_BASE}/api/channels/${encodeURIComponent(terminalId)}/messages`);
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) { console.error(`Error: ${data.error ?? "Failed"}`); process.exit(1); }
    const messages = (data.messages ?? []) as Array<Record<string, unknown>>;
    if (messages.length === 0) { console.log(`No messages for ${terminalId}.`); return; }
    for (const m of messages) {
      const status = m.delivered ? "delivered" : "pending";
      console.log(`  [${m.messageId}] from=${m.fromTerminalId || "(unknown)"} status=${status}: ${m.content}`);
    }
  } catch (err) { apiError(err); }
};

// ─── Main ────────────────────────────────────────────────────────────────

const main = async () => {
  if (!command || command === "start") return startServer();

  if (command === "init") {
    const name = args[1];
    if (!name) { console.error("Usage: octogent init <project-name>"); process.exit(1); }
    return initProject(name);
  }

  if (command === "projects" || command === "project") {
    const projects = loadProjects().projects;
    if (projects.length === 0) {
      console.log("No projects registered. Run `octogent init <name>` in a project directory.");
      return;
    }
    for (const p of projects) console.log(`  ${p.name}  ${p.path}`);
    return;
  }

  if (command === "tentacle" || command === "tentacles") {
    if (args[1] === "create") return tentacleCreate();
    if (args[1] === "list" || args[1] === "ls") return tentacleList();
  }

  if (command === "terminal" || command === "terminals") {
    if (args[1] === "create") return terminalCreate();
  }

  if (command === "channel") {
    if (args[1] === "send") return channelSend();
    if (args[1] === "list" || args[1] === "ls") return channelList();
  }

  console.log(`Usage:
  octogent                             Start the dashboard
  octogent init <project-name>         Initialize current directory as a project
  octogent projects                    List registered projects

  octogent tentacle create <name>      Create a tentacle (server must be running)
  octogent tentacle list               List tentacles
  octogent terminal create [options]   Create a terminal
  octogent channel send <id> <msg>     Send a channel message
  octogent channel list <id>           List channel messages`);
  process.exit(1);
};

main();
