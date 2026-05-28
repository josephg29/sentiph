import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readDeckTentacles } from "../deck/readDeckTentacles";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

const getSetupStatus = (workspaceCwd: string, projectStateDir: string) => {
  const projectJsonPath = join(projectStateDir, "project.json");
  const gitignorePath = join(workspaceCwd, ".gitignore");

  const isInitialized = existsSync(projectJsonPath);
  const hasGitignore =
    existsSync(gitignorePath) && readFileSync(gitignorePath, "utf8").includes(".sentiph");
  const tentacles = readDeckTentacles(workspaceCwd, projectStateDir);
  const tentacleCount = tentacles.length;
  const hasAnyTentacles = tentacleCount > 0;
  const isFirstRun = !isInitialized;

  return {
    isFirstRun,
    shouldShowSetupCard: isFirstRun,
    hasAnyTentacles,
    tentacleCount,
    steps: [
      { id: "initialize-workspace", complete: isInitialized },
      { id: "ensure-gitignore", complete: hasGitignore },
      { id: "create-tentacles", complete: hasAnyTentacles },
    ],
  };
};

export const handleSetupRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  if (requestUrl.pathname !== "/api/setup") return false;
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }
  writeJson(response, 200, getSetupStatus(workspaceCwd, projectStateDir), corsOrigin);
  return true;
};

const SETUP_STEP_PATTERN = /^\/api\/setup\/steps\/([^/]+)$/;

export const handleSetupStepRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  const match = requestUrl.pathname.match(SETUP_STEP_PATTERN);
  if (!match) return false;
  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const stepId = match[1];

  if (stepId === "initialize-workspace") {
    mkdirSync(join(projectStateDir, "tentacles"), { recursive: true });
    mkdirSync(join(projectStateDir, "worktrees"), { recursive: true });
    if (!existsSync(join(projectStateDir, "project.json"))) {
      writeFileSync(
        join(projectStateDir, "project.json"),
        `${JSON.stringify({ version: 1 }, null, 2)}\n`,
        "utf8",
      );
    }
    writeJson(response, 200, { ok: true, step: stepId }, corsOrigin);
    return true;
  }

  if (stepId === "ensure-gitignore") {
    const gitignorePath = join(workspaceCwd, ".gitignore");
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
    if (!existing.includes(".sentiph")) {
      const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
      appendFileSync(gitignorePath, `${prefix}.sentiph\n`);
    }
    writeJson(response, 200, { ok: true, step: stepId }, corsOrigin);
    return true;
  }

  writeJson(response, 404, { error: "Unknown setup step." }, corsOrigin);
  return true;
};
