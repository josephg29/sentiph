import { createApiServer } from "./createApiServer";

const parsePort = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const host = process.env.HOST ?? "127.0.0.1";
const port = parsePort(process.env.OCTOGENT_API_PORT ?? process.env.PORT, 8787);
const allowRemoteAccess = process.env.OCTOGENT_ALLOW_REMOTE_ACCESS === "1";
const workspaceCwd = process.env.OCTOGENT_WORKSPACE_CWD ?? process.cwd();
const projectStateDir = process.env.OCTOGENT_PROJECT_STATE_DIR;
const promptsDir = process.env.OCTOGENT_PROMPTS_DIR;
const webDistDir = process.env.OCTOGENT_WEB_DIST_DIR;

const apiServer = createApiServer({
  workspaceCwd,
  projectStateDir,
  promptsDir,
  webDistDir,
  allowRemoteAccess,
});

const shutdown = async () => {
  await apiServer.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

apiServer
  .start(port, host)
  .then(({ port: activePort }) => {
    console.log(`Octogent API listening on http://${host}:${activePort}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
