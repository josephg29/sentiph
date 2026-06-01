import {
  createDeckTentacle,
  deleteDeckTentacle,
  listDeckAvailableSkills,
  readDeckTentacles,
  readDeckVaultFile,
  updateDeckTentacleSuggestedSkills,
} from "../deck/readDeckTentacles";
import type { ApiRouteHandler } from "./routeHelpers";
import {
  readJsonBodyOrWriteError,
  writeJson,
  writeMethodNotAllowed,
  writeNoContent,
  writeText,
} from "./routeHelpers";

export const handleDeckTentaclesRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  if (requestUrl.pathname !== "/api/deck/tentacles") return false;

  if (request.method === "GET") {
    const tentacles = readDeckTentacles(workspaceCwd, projectStateDir);
    writeJson(response, 200, tentacles, corsOrigin);
    return true;
  }

  if (request.method === "POST") {
    const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
    if (!bodyReadResult.ok) return true;

    const body = bodyReadResult.payload as Record<string, unknown> | null;
    const name = body && typeof body.name === "string" ? body.name : "";
    const description = body && typeof body.description === "string" ? body.description : "";
    const color = body && typeof body.color === "string" ? body.color : "#d4a017";
    const suggestedSkills =
      body && Array.isArray(body.suggestedSkills)
        ? body.suggestedSkills.filter((skill): skill is string => typeof skill === "string")
        : [];

    const result = createDeckTentacle(
      workspaceCwd,
      { name, description, color, suggestedSkills },
      projectStateDir,
    );
    if (!result.ok) {
      writeJson(response, 400, { error: result.error }, corsOrigin);
      return true;
    }

    writeJson(response, 201, result.tentacle, corsOrigin);
    return true;
  }

  writeMethodNotAllowed(response, corsOrigin);
  return true;
};

export const handleDeckSkillsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  if (requestUrl.pathname !== "/api/deck/skills") return false;

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  writeJson(response, 200, listDeckAvailableSkills(workspaceCwd), corsOrigin);
  return true;
};

const DECK_TENTACLE_ITEM_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)$/;

export const handleDeckTentacleItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  const match = requestUrl.pathname.match(DECK_TENTACLE_ITEM_PATTERN);
  if (!match) return false;

  if (request.method !== "DELETE") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const result = deleteDeckTentacle(workspaceCwd, tentacleId, projectStateDir);
  if (!result.ok) {
    writeJson(response, 404, { error: result.error }, corsOrigin);
    return true;
  }

  writeNoContent(response, 204, corsOrigin);
  return true;
};

const DECK_VAULT_FILE_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/files\/([^/]+)$/;

export const handleDeckVaultFileRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd },
) => {
  const match = requestUrl.pathname.match(DECK_VAULT_FILE_PATTERN);
  if (!match) return false;
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const fileName = decodeURIComponent(match[2] as string);

  const content = readDeckVaultFile(workspaceCwd, tentacleId, fileName);
  if (content === null) {
    writeJson(response, 404, { error: "Vault file not found" }, corsOrigin);
    return true;
  }

  writeText(response, 200, content, "text/markdown; charset=utf-8", corsOrigin);
  return true;
};

const DECK_TENTACLE_SKILLS_PATTERN = /^\/api\/deck\/tentacles\/([^/]+)\/skills$/;

export const handleDeckTentacleSkillsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { workspaceCwd, projectStateDir },
) => {
  const match = requestUrl.pathname.match(DECK_TENTACLE_SKILLS_PATTERN);
  if (!match) return false;
  if (request.method !== "PATCH") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const body = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!body.ok) return true;

  const payload = body.payload as Record<string, unknown> | null;
  const suggestedSkills = Array.isArray(payload?.suggestedSkills)
    ? payload.suggestedSkills.filter((skill): skill is string => typeof skill === "string")
    : null;

  if (suggestedSkills === null) {
    writeJson(response, 400, { error: "suggestedSkills (string[]) is required" }, corsOrigin);
    return true;
  }

  const tentacleId = decodeURIComponent(match[1] as string);
  const updated = updateDeckTentacleSuggestedSkills(
    workspaceCwd,
    tentacleId,
    suggestedSkills,
    projectStateDir,
  );
  if (!updated) {
    writeJson(response, 404, { error: "Tentacle not found" }, corsOrigin);
    return true;
  }

  writeJson(response, 200, updated, corsOrigin);
  return true;
};


