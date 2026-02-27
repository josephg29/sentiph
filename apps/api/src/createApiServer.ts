import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";

import {
  type CodexUsageSnapshot,
  readCodexUsageSnapshot as readCodexUsageSnapshotDefault,
} from "./codexUsage";
import {
  type GitHubRepoSummarySnapshot,
  readGithubRepoSummary as readGithubRepoSummaryDefault,
} from "./githubRepoSummary";
import {
  type GitClient,
  type PersistedUiState,
  RuntimeInputError,
  type TentacleWorkspaceMode,
  type TmuxClient,
  createTerminalRuntime,
} from "./terminalRuntime";

type CreateApiServerOptions = {
  workspaceCwd?: string;
  tmuxClient?: TmuxClient;
  gitClient?: GitClient;
  readCodexUsageSnapshot?: () => Promise<CodexUsageSnapshot>;
  readGithubRepoSummary?: () => Promise<GitHubRepoSummarySnapshot>;
  allowRemoteAccess?: boolean;
};

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const withCors = (headers: Record<string, string>, corsOrigin: string | null) => {
  const nextHeaders: Record<string, string> = {
    ...headers,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (corsOrigin) {
    nextHeaders["Access-Control-Allow-Origin"] = corsOrigin;
    nextHeaders.Vary = "Origin";
  }

  return nextHeaders;
};

const isLoopbackHostname = (hostname: string) => LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());

const parseHostname = (value: string, withScheme: boolean): string | null => {
  try {
    const url = new URL(withScheme ? value : `http://${value}`);
    return url.hostname;
  } catch {
    return null;
  }
};

const isAllowedOriginHeader = (origin: string | undefined, allowRemoteAccess: boolean) => {
  if (allowRemoteAccess || origin === undefined) {
    return true;
  }

  const hostname = parseHostname(origin, true);
  return hostname !== null && isLoopbackHostname(hostname);
};

const isAllowedHostHeader = (host: string | undefined, allowRemoteAccess: boolean) => {
  if (allowRemoteAccess) {
    return true;
  }

  if (!host) {
    return false;
  }

  const hostname = parseHostname(host, false);
  return hostname !== null && isLoopbackHostname(hostname);
};

const readHeaderValue = (header: string | string[] | undefined): string | undefined => {
  if (typeof header !== "string") {
    return undefined;
  }

  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getRequestCorsOrigin = (origin: string | undefined, allowRemoteAccess: boolean) => {
  if (!origin) {
    return null;
  }

  if (!allowRemoteAccess && !isAllowedOriginHeader(origin, allowRemoteAccess)) {
    return null;
  }

  return origin;
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const payload = Buffer.concat(chunks).toString("utf8").trim();
  if (payload.length === 0) {
    return null;
  }

  return JSON.parse(payload);
};

const parseTentacleName = (payload: unknown) => {
  if (payload === null || payload === undefined) {
    return {
      provided: false,
      name: undefined as string | undefined,
      error: null as string | null,
    };
  }

  if (typeof payload !== "object") {
    return {
      provided: true,
      name: undefined as string | undefined,
      error: "Expected a JSON object body.",
    };
  }

  const rawName = (payload as Record<string, unknown>).name;
  if (rawName === undefined) {
    return {
      provided: false,
      name: undefined as string | undefined,
      error: null as string | null,
    };
  }

  if (typeof rawName !== "string") {
    return {
      provided: true,
      name: undefined as string | undefined,
      error: "Tentacle name must be a string.",
    };
  }

  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return {
      provided: true,
      name: undefined as string | undefined,
      error: "Tentacle name cannot be empty.",
    };
  }

  return {
    provided: true,
    name: trimmed,
    error: null as string | null,
  };
};

const parseTentacleWorkspaceMode = (payload: unknown) => {
  if (payload === null || payload === undefined) {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: null as string | null,
    };
  }

  if (typeof payload !== "object") {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: "Expected a JSON object body.",
    };
  }

  const rawWorkspaceMode = (payload as Record<string, unknown>).workspaceMode;
  if (rawWorkspaceMode === undefined) {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: null as string | null,
    };
  }

  if (rawWorkspaceMode !== "shared" && rawWorkspaceMode !== "worktree") {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: "Tentacle workspace mode must be either 'shared' or 'worktree'.",
    };
  }

  return {
    workspaceMode: rawWorkspaceMode as TentacleWorkspaceMode,
    error: null as string | null,
  };
};

const parseUiStatePatch = (
  payload: unknown,
): { patch: PersistedUiState | null; error: string | null } => {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return {
      patch: null,
      error: "Expected a JSON object body.",
    };
  }

  const record = payload as Record<string, unknown>;
  const patch: PersistedUiState = {};

  if (record.isAgentsSidebarVisible !== undefined) {
    if (typeof record.isAgentsSidebarVisible !== "boolean") {
      return {
        patch: null,
        error: "isAgentsSidebarVisible must be a boolean.",
      };
    }
    patch.isAgentsSidebarVisible = record.isAgentsSidebarVisible;
  }

  if (record.sidebarWidth !== undefined) {
    if (typeof record.sidebarWidth !== "number" || !Number.isFinite(record.sidebarWidth)) {
      return {
        patch: null,
        error: "sidebarWidth must be a finite number.",
      };
    }
    patch.sidebarWidth = record.sidebarWidth;
  }

  if (record.isActiveAgentsSectionExpanded !== undefined) {
    if (typeof record.isActiveAgentsSectionExpanded !== "boolean") {
      return {
        patch: null,
        error: "isActiveAgentsSectionExpanded must be a boolean.",
      };
    }
    patch.isActiveAgentsSectionExpanded = record.isActiveAgentsSectionExpanded;
  }

  if (record.isCodexUsageSectionExpanded !== undefined) {
    if (typeof record.isCodexUsageSectionExpanded !== "boolean") {
      return {
        patch: null,
        error: "isCodexUsageSectionExpanded must be a boolean.",
      };
    }
    patch.isCodexUsageSectionExpanded = record.isCodexUsageSectionExpanded;
  }

  if (record.minimizedTentacleIds !== undefined) {
    if (!Array.isArray(record.minimizedTentacleIds)) {
      return {
        patch: null,
        error: "minimizedTentacleIds must be an array of strings.",
      };
    }

    const minimizedTentacleIds = record.minimizedTentacleIds.filter(
      (tentacleId): tentacleId is string => typeof tentacleId === "string",
    );
    if (minimizedTentacleIds.length !== record.minimizedTentacleIds.length) {
      return {
        patch: null,
        error: "minimizedTentacleIds must be an array of strings.",
      };
    }
    patch.minimizedTentacleIds = [...new Set(minimizedTentacleIds)];
  }

  if (record.tentacleWidths !== undefined) {
    if (
      record.tentacleWidths === null ||
      typeof record.tentacleWidths !== "object" ||
      Array.isArray(record.tentacleWidths)
    ) {
      return {
        patch: null,
        error: "tentacleWidths must be an object map of numbers.",
      };
    }

    const tentacleWidths = Object.entries(record.tentacleWidths).reduce<Record<string, number>>(
      (acc, [tentacleId, width]) => {
        if (typeof width === "number" && Number.isFinite(width)) {
          acc[tentacleId] = width;
        }
        return acc;
      },
      {},
    );
    if (Object.keys(tentacleWidths).length !== Object.keys(record.tentacleWidths).length) {
      return {
        patch: null,
        error: "tentacleWidths must be an object map of numbers.",
      };
    }
    patch.tentacleWidths = tentacleWidths;
  }

  return { patch, error: null };
};

export const createApiServer = ({
  workspaceCwd,
  tmuxClient,
  gitClient,
  readCodexUsageSnapshot = readCodexUsageSnapshotDefault,
  readGithubRepoSummary = () =>
    readGithubRepoSummaryDefault({
      cwd: workspaceCwd ?? resolve(process.cwd(), "../.."),
    }),
  allowRemoteAccess = false,
}: CreateApiServerOptions = {}) => {
  const runtimeOptions: Parameters<typeof createTerminalRuntime>[0] = {
    workspaceCwd: workspaceCwd ?? resolve(process.cwd(), "../.."),
  };
  if (tmuxClient) {
    runtimeOptions.tmuxClient = tmuxClient;
  }
  if (gitClient) {
    runtimeOptions.gitClient = gitClient;
  }

  const runtime = createTerminalRuntime(runtimeOptions);

  const server = createServer(async (request, response) => {
    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    const corsOrigin = getRequestCorsOrigin(originHeader, allowRemoteAccess);

    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      response.writeHead(403, withCors({ "Content-Type": "application/json" }, null));
      response.end(JSON.stringify({ error: "Host not allowed." }));
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      response.writeHead(403, withCors({ "Content-Type": "application/json" }, null));
      response.end(JSON.stringify({ error: "Origin not allowed." }));
      return;
    }

    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "OPTIONS") {
        response.writeHead(204, withCors({}, corsOrigin));
        response.end();
        return;
      }

      if (requestUrl.pathname === "/api/agent-snapshots") {
        if (request.method !== "GET") {
          response.writeHead(405, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const payload = runtime.listAgentSnapshots();
        response.writeHead(200, withCors({ "Content-Type": "application/json" }, corsOrigin));
        response.end(JSON.stringify(payload));
        return;
      }

      if (requestUrl.pathname === "/api/codex/usage") {
        if (request.method !== "GET") {
          response.writeHead(405, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const payload = await readCodexUsageSnapshot();
        response.writeHead(200, withCors({ "Content-Type": "application/json" }, corsOrigin));
        response.end(JSON.stringify(payload));
        return;
      }

      if (requestUrl.pathname === "/api/github/summary") {
        if (request.method !== "GET") {
          response.writeHead(405, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const payload = await readGithubRepoSummary();
        response.writeHead(200, withCors({ "Content-Type": "application/json" }, corsOrigin));
        response.end(JSON.stringify(payload));
        return;
      }

      if (requestUrl.pathname === "/api/ui-state") {
        if (request.method === "GET") {
          const payload = runtime.readUiState();
          response.writeHead(200, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify(payload));
          return;
        }

        if (request.method !== "PATCH") {
          response.writeHead(405, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let bodyPayload: unknown = null;
        try {
          bodyPayload = await readJsonBody(request);
        } catch {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Invalid JSON body." }));
          return;
        }

        const uiStatePatch = parseUiStatePatch(bodyPayload);
        if (uiStatePatch.error || !uiStatePatch.patch) {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: uiStatePatch.error ?? "Invalid UI state patch." }));
          return;
        }

        const payload = runtime.patchUiState(uiStatePatch.patch);
        response.writeHead(200, withCors({ "Content-Type": "application/json" }, corsOrigin));
        response.end(JSON.stringify(payload));
        return;
      }

      if (requestUrl.pathname === "/api/tentacles") {
        if (request.method !== "POST") {
          response.writeHead(405, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let bodyPayload: unknown = null;
        try {
          bodyPayload = await readJsonBody(request);
        } catch {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Invalid JSON body." }));
          return;
        }

        const nameResult = parseTentacleName(bodyPayload);
        if (nameResult.error) {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: nameResult.error }));
          return;
        }

        const workspaceModeResult = parseTentacleWorkspaceMode(bodyPayload);
        if (workspaceModeResult.error) {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: workspaceModeResult.error }));
          return;
        }

        try {
          const payload = runtime.createTentacle({
            tentacleName: nameResult.name,
            workspaceMode: workspaceModeResult.workspaceMode,
          });
          response.writeHead(201, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify(payload));
          return;
        } catch (error) {
          if (error instanceof RuntimeInputError) {
            response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
            response.end(JSON.stringify({ error: error.message }));
            return;
          }
          throw error;
        }
      }

      const renameMatch = requestUrl.pathname.match(/^\/api\/tentacles\/([^/]+)$/);
      if (renameMatch) {
        if (request.method !== "PATCH" && request.method !== "DELETE") {
          response.writeHead(405, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const tentacleId = decodeURIComponent(renameMatch[1] ?? "");
        if (request.method === "DELETE") {
          const deleted = runtime.deleteTentacle(tentacleId);
          if (!deleted) {
            response.writeHead(404, withCors({ "Content-Type": "application/json" }, corsOrigin));
            response.end(JSON.stringify({ error: "Tentacle not found." }));
            return;
          }

          response.writeHead(204, withCors({}, corsOrigin));
          response.end();
          return;
        }

        let bodyPayload: unknown = null;
        try {
          bodyPayload = await readJsonBody(request);
        } catch {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Invalid JSON body." }));
          return;
        }

        const nameResult = parseTentacleName(bodyPayload);
        if (nameResult.error) {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: nameResult.error }));
          return;
        }

        if (!nameResult.provided || !nameResult.name) {
          response.writeHead(400, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Tentacle name is required." }));
          return;
        }

        const payload = runtime.renameTentacle(tentacleId, nameResult.name);
        if (!payload) {
          response.writeHead(404, withCors({ "Content-Type": "application/json" }, corsOrigin));
          response.end(JSON.stringify({ error: "Tentacle not found." }));
          return;
        }

        response.writeHead(200, withCors({ "Content-Type": "application/json" }, corsOrigin));
        response.end(JSON.stringify(payload));
        return;
      }

      response.writeHead(404, withCors({ "Content-Type": "application/json" }, corsOrigin));
      response.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      response.writeHead(500, withCors({ "Content-Type": "application/json" }, corsOrigin));
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Internal server error",
        }),
      );
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      socket.destroy();
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      socket.destroy();
      return;
    }

    if (!runtime.handleUpgrade(request, socket, head)) {
      socket.destroy();
    }
  });

  return {
    server,
    async start(port = 8787, host = "127.0.0.1") {
      await new Promise<void>((resolveStart, rejectStart) => {
        server.listen(port, host, () => resolveStart());
        server.once("error", rejectStart);
      });

      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;

      return { host, port: resolvedPort };
    },
    async stop() {
      runtime.close();
      await new Promise<void>((resolveStop, rejectStop) => {
        server.close((error) => {
          if (error) {
            rejectStop(error);
            return;
          }
          resolveStop();
        });
      });
    },
  };
};
