import type { ApiRouteHandler } from "./routeHelpers";
import { readJsonBodyOrWriteError, writeJson, writeMethodNotAllowed } from "./routeHelpers";

const TENTACLES_COLLECTION_PATH = "/api/tentacles";

/**
 * GET  /api/tentacles  - lists tentacle (session) summaries
 * POST /api/tentacles  - creates a tentacle (session) folder + CONTEXT.md
 *
 * The per-tentacle git routes live in gitRoutes.ts and match
 * /api/tentacles/:id/git/... , which does not collide with this exact path.
 */
export const handleTentaclesCollectionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== TENTACLES_COLLECTION_PATH) {
    return false;
  }

  if (request.method === "GET") {
    writeJson(response, 200, runtime.listTentacles(), corsOrigin);
    return true;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const body = bodyReadResult.payload as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    writeJson(response, 400, { error: "name is required" }, corsOrigin);
    return true;
  }

  const description = body && typeof body.description === "string" ? body.description : "";
  const rawId =
    body && typeof body.tentacleId === "string"
      ? body.tentacleId
      : body && typeof body.id === "string"
        ? body.id
        : undefined;

  const tentacle = runtime.createTentacle({
    name,
    description,
    ...(rawId ? { id: rawId } : {}),
  });
  writeJson(response, 201, tentacle, corsOrigin);
  return true;
};
