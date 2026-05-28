import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";

export const handlePromptItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { promptsDir },
) => {
  if (!requestUrl.pathname.startsWith("/api/prompts/")) {
    return false;
  }
  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const name = requestUrl.pathname.slice("/api/prompts/".length);
  if (!name || name.includes("/") || name.includes("..")) {
    writeJson(response, 404, { error: "Not found" }, corsOrigin);
    return true;
  }

  if (!promptsDir) {
    writeJson(response, 404, { error: "Not found" }, corsOrigin);
    return true;
  }

  const filePath = join(promptsDir, `${name}.md`);
  if (!existsSync(filePath)) {
    writeJson(response, 404, { error: "Not found" }, corsOrigin);
    return true;
  }

  try {
    const content = readFileSync(filePath, "utf8").trimEnd();
    writeJson(response, 200, { name, source: "builtin", content }, corsOrigin);
  } catch {
    writeJson(response, 404, { error: "Not found" }, corsOrigin);
  }

  return true;
};
