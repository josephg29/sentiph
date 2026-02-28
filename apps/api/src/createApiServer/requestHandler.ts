import type { IncomingMessage, ServerResponse } from "node:http";

import type { CodexUsageSnapshot } from "../codexUsage";
import type { GitHubRepoSummarySnapshot } from "../githubRepoSummary";
import { RuntimeInputError, type TentacleWorkspaceMode } from "../terminalRuntime";
import {
  parseTentacleName,
  parseTentacleWorkspaceMode,
  parseUiStatePatch,
  RequestBodyTooLargeError,
  readJsonBody,
} from "./requestParsers";
import {
  getRequestCorsOrigin,
  isAllowedHostHeader,
  isAllowedOriginHeader,
  readHeaderValue,
  withCors,
} from "./security";

type TerminalRuntime = ReturnType<typeof import("../terminalRuntime").createTerminalRuntime>;

type CreateApiRequestHandlerOptions = {
  runtime: TerminalRuntime;
  readCodexUsageSnapshot: () => Promise<CodexUsageSnapshot>;
  readGithubRepoSummary: () => Promise<GitHubRepoSummarySnapshot>;
  allowRemoteAccess: boolean;
};

const writeJson = (
  response: ServerResponse,
  status: number,
  payload: unknown,
  corsOrigin: string | null,
) => {
  response.writeHead(status, withCors({ "Content-Type": "application/json" }, corsOrigin));
  response.end(JSON.stringify(payload));
};

const writeNoContent = (response: ServerResponse, status: number, corsOrigin: string | null) => {
  response.writeHead(status, withCors({}, corsOrigin));
  response.end();
};

export const createApiRequestHandler = ({
  runtime,
  readCodexUsageSnapshot,
  readGithubRepoSummary,
  allowRemoteAccess,
}: CreateApiRequestHandlerOptions) => {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    const corsOrigin = getRequestCorsOrigin(originHeader, allowRemoteAccess);

    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      writeJson(response, 403, { error: "Host not allowed." }, null);
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      writeJson(response, 403, { error: "Origin not allowed." }, null);
      return;
    }

    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "OPTIONS") {
        writeNoContent(response, 204, corsOrigin);
        return;
      }

      if (requestUrl.pathname === "/api/agent-snapshots") {
        if (request.method !== "GET") {
          writeJson(response, 405, { error: "Method not allowed" }, corsOrigin);
          return;
        }

        const payload = runtime.listAgentSnapshots();
        writeJson(response, 200, payload, corsOrigin);
        return;
      }

      if (requestUrl.pathname === "/api/codex/usage") {
        if (request.method !== "GET") {
          writeJson(response, 405, { error: "Method not allowed" }, corsOrigin);
          return;
        }

        const payload = await readCodexUsageSnapshot();
        writeJson(response, 200, payload, corsOrigin);
        return;
      }

      if (requestUrl.pathname === "/api/github/summary") {
        if (request.method !== "GET") {
          writeJson(response, 405, { error: "Method not allowed" }, corsOrigin);
          return;
        }

        const payload = await readGithubRepoSummary();
        writeJson(response, 200, payload, corsOrigin);
        return;
      }

      if (requestUrl.pathname === "/api/ui-state") {
        if (request.method === "GET") {
          const payload = runtime.readUiState();
          writeJson(response, 200, payload, corsOrigin);
          return;
        }

        if (request.method !== "PATCH") {
          writeJson(response, 405, { error: "Method not allowed" }, corsOrigin);
          return;
        }

        let bodyPayload: unknown = null;
        try {
          bodyPayload = await readJsonBody(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            writeJson(response, 413, { error: "Request body too large." }, corsOrigin);
            return;
          }
          writeJson(response, 400, { error: "Invalid JSON body." }, corsOrigin);
          return;
        }

        const uiStatePatch = parseUiStatePatch(bodyPayload);
        if (uiStatePatch.error || !uiStatePatch.patch) {
          writeJson(
            response,
            400,
            { error: uiStatePatch.error ?? "Invalid UI state patch." },
            corsOrigin,
          );
          return;
        }

        const payload = runtime.patchUiState(uiStatePatch.patch);
        writeJson(response, 200, payload, corsOrigin);
        return;
      }

      if (requestUrl.pathname === "/api/tentacles") {
        if (request.method !== "POST") {
          writeJson(response, 405, { error: "Method not allowed" }, corsOrigin);
          return;
        }

        let bodyPayload: unknown = null;
        try {
          bodyPayload = await readJsonBody(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            writeJson(response, 413, { error: "Request body too large." }, corsOrigin);
            return;
          }
          writeJson(response, 400, { error: "Invalid JSON body." }, corsOrigin);
          return;
        }

        const nameResult = parseTentacleName(bodyPayload);
        if (nameResult.error) {
          writeJson(response, 400, { error: nameResult.error }, corsOrigin);
          return;
        }

        const workspaceModeResult = parseTentacleWorkspaceMode(bodyPayload);
        if (workspaceModeResult.error) {
          writeJson(response, 400, { error: workspaceModeResult.error }, corsOrigin);
          return;
        }

        try {
          const createTentacleInput: {
            tentacleName?: string;
            workspaceMode: TentacleWorkspaceMode;
          } = {
            workspaceMode: workspaceModeResult.workspaceMode,
          };
          if (nameResult.name !== undefined) {
            createTentacleInput.tentacleName = nameResult.name;
          }

          const payload = runtime.createTentacle(createTentacleInput);
          writeJson(response, 201, payload, corsOrigin);
          return;
        } catch (error) {
          if (error instanceof RuntimeInputError) {
            writeJson(response, 400, { error: error.message }, corsOrigin);
            return;
          }
          throw error;
        }
      }

      const renameMatch = requestUrl.pathname.match(/^\/api\/tentacles\/([^/]+)$/);
      if (renameMatch) {
        if (request.method !== "PATCH" && request.method !== "DELETE") {
          writeJson(response, 405, { error: "Method not allowed" }, corsOrigin);
          return;
        }

        const tentacleId = decodeURIComponent(renameMatch[1] ?? "");
        if (request.method === "DELETE") {
          const deleted = runtime.deleteTentacle(tentacleId);
          if (!deleted) {
            writeJson(response, 404, { error: "Tentacle not found." }, corsOrigin);
            return;
          }

          writeNoContent(response, 204, corsOrigin);
          return;
        }

        let bodyPayload: unknown = null;
        try {
          bodyPayload = await readJsonBody(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            writeJson(response, 413, { error: "Request body too large." }, corsOrigin);
            return;
          }
          writeJson(response, 400, { error: "Invalid JSON body." }, corsOrigin);
          return;
        }

        const nameResult = parseTentacleName(bodyPayload);
        if (nameResult.error) {
          writeJson(response, 400, { error: nameResult.error }, corsOrigin);
          return;
        }

        if (!nameResult.provided || !nameResult.name) {
          writeJson(response, 400, { error: "Tentacle name is required." }, corsOrigin);
          return;
        }

        const payload = runtime.renameTentacle(tentacleId, nameResult.name);
        if (!payload) {
          writeJson(response, 404, { error: "Tentacle not found." }, corsOrigin);
          return;
        }

        writeJson(response, 200, payload, corsOrigin);
        return;
      }

      writeJson(response, 404, { error: "Not found" }, corsOrigin);
    } catch (error) {
      writeJson(
        response,
        500,
        {
          error: error instanceof Error ? error.message : "Internal server error",
        },
        corsOrigin,
      );
    }
  };
};
