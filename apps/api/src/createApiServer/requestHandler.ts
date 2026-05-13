import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

import type { UsageChartResponse } from "../claudeSessionScanner";
import type { ClaudeUsageSnapshot } from "../claudeUsage";
import type { AgentMetricsStore } from "../agentMetricsStore";
import type { CodeIntelStore } from "../codeIntelStore";
import type { CodexUsageSnapshot } from "../codexUsage";
import type { GitHubRepoSummarySnapshot } from "../githubRepoSummary";
import { logVerbose } from "../logging";
import type { MonitorService } from "../monitor";
import { createPairingService as createDefaultPairingService } from "../pairing";
import type { PairingService } from "../pairing";
import { handleCodeIntelEventsRoute } from "./codeIntelRoutes";
import {
  handleConversationExportRoute,
  handleConversationItemRoute,
  handleConversationSearchRoute,
  handleConversationsCollectionRoute,
} from "./conversationRoutes";
import {
  handleMetricsAggregateRoute,
  handleMetricsEventsRoute,
  handleMetricsHeatmapRoute,
  handleMetricsSummariesRoute,
} from "./metricsRoutes";
import {
  handleDeckSkillsRoute,
  handleDeckTentacleItemRoute,
  handleDeckTentacleSkillsRoute,
  handleDeckTentacleSwarmRoute,
  handleDeckTentaclesRoute,
  handleDeckTodoAddRoute,
  handleDeckTodoDeleteRoute,
  handleDeckTodoEditRoute,
  handleDeckTodoSolveRoute,
  handleDeckTodoToggleRoute,
  handleDeckVaultFileRoute,
} from "./deckRoutes";
import { handleTentacleGitPullRequestRoute, handleTentacleGitRoute } from "./gitRoutes";
import {
  handleHookSessionStartRoute,
  handleHookUserPromptSubmitRoute,
} from "./hooksRoutes";
import { handleUiStateRoute } from "./miscRoutes";
import {
  handleMonitorConfigRoute,
  handleMonitorFeedRoute,
  handleMonitorRefreshRoute,
} from "./monitorRoutes";
import { createPairingRoutes } from "./pairingRoutes";
import { handlePromptItemRoute } from "./promptRoutes";
import { handleSetupRoute, handleSetupStepRoute } from "./setupRoutes";
import type {
  ApiRouteHandler,
  RouteHandlerContext,
  RouteHandlerDependencies,
  TerminalRuntime,
} from "./routeHelpers";
import { writeJson, writeNoContent } from "./routeHelpers";
import {
  extractBearerToken,
  getRequestCorsOrigin,
  isAllowedHostHeader,
  isAllowedOriginHeader,
  isLoopbackHostHeader,
  readHeaderValue,
} from "./security";
import {
  handleTerminalActionRoute,
  handleTerminalInputRoute,
  handleTerminalItemRoute,
  handleTerminalPruneRoute,
  handleTerminalScrollbackRoute,
  handleTerminalSnapshotsRoute,
  handleTerminalsCollectionRoute,
} from "./terminalRoutes";
import {
  handleClaudeUsageRoute,
  handleCodexUsageRoute,
  handleGithubSummaryRoute,
  handleUsageHeatmapRoute,
} from "./usageRoutes";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

type CreateApiRequestHandlerOptions = {
  runtime: TerminalRuntime;
  workspaceCwd: string;
  projectStateDir: string;
  webDistDir?: string | undefined;
  promptsDir?: string | undefined;
  getApiBaseUrl: () => string;
  getApiPort: () => string;
  readClaudeUsageSnapshot: () => Promise<ClaudeUsageSnapshot>;
  readClaudeOauthUsageSnapshot: () => Promise<ClaudeUsageSnapshot>;
  readClaudeCliUsageSnapshot: () => Promise<ClaudeUsageSnapshot>;
  readCodexUsageSnapshot: () => Promise<CodexUsageSnapshot>;
  readGithubRepoSummary: () => Promise<GitHubRepoSummarySnapshot>;
  scanUsageHeatmap: (scope: "all" | "project") => Promise<UsageChartResponse>;
  monitorService: MonitorService;
  invalidateClaudeUsageCache: () => void;
  codeIntelStore: CodeIntelStore;
  metricsStore: AgentMetricsStore;
  pairingService?: PairingService | undefined;
  allowRemoteAccess: boolean;
};

const API_ROUTE_MAP: ReadonlyMap<string, readonly ApiRouteHandler[]> = new Map([
  [
    "deck",
    [
      handleDeckSkillsRoute,
      handleDeckTentaclesRoute,
      handleDeckTentacleItemRoute,
      handleDeckTentacleSkillsRoute,
      handleDeckTodoSolveRoute,
      handleDeckTentacleSwarmRoute,
      handleDeckTodoToggleRoute,
      handleDeckTodoEditRoute,
      handleDeckTodoAddRoute,
      handleDeckTodoDeleteRoute,
      handleDeckVaultFileRoute,
    ],
  ],
  ["terminal-snapshots", [handleTerminalSnapshotsRoute]],
  ["codex", [handleCodexUsageRoute]],
  ["claude", [handleClaudeUsageRoute]],
  ["analytics", [handleUsageHeatmapRoute]],
  ["github", [handleGithubSummaryRoute]],
  [
    "metrics",
    [
      handleMetricsAggregateRoute,
      handleMetricsHeatmapRoute,
      handleMetricsSummariesRoute,
      handleMetricsEventsRoute,
    ],
  ],
  ["ui-state", [handleUiStateRoute]],
  ["monitor", [handleMonitorConfigRoute, handleMonitorFeedRoute, handleMonitorRefreshRoute]],
  [
    "terminals",
    [
      handleTerminalsCollectionRoute,
      handleTerminalPruneRoute,
      handleTerminalScrollbackRoute,
      handleTerminalInputRoute,
      handleTerminalActionRoute,
      handleTerminalItemRoute,
    ],
  ],
  ["tentacles", [handleTentacleGitRoute, handleTentacleGitPullRequestRoute]],
  ["code-intel", [handleCodeIntelEventsRoute]],
  ["hooks", [handleHookSessionStartRoute, handleHookUserPromptSubmitRoute]],
  ["conversations", [
    handleConversationsCollectionRoute,
    handleConversationSearchRoute,
    handleConversationItemRoute,
    handleConversationExportRoute,
  ]],
  ["setup", [handleSetupRoute, handleSetupStepRoute]],
  ["prompts", [handlePromptItemRoute]],
]);

const extractRoutePrefix = (pathname: string): string | null => {
  const segments = pathname.split("/");
  if (segments.length < 3 || segments[1] !== "api") {
    return null;
  }
  return segments[2] ?? null;
};

const logRequest = (method: string, path: string, status: number, startTime: number) => {
  logVerbose(`[API] ${method} ${path} ${status} ${Date.now() - startTime}ms`);
};

const serveStaticFile = async (
  response: ServerResponse,
  webDistDir: string,
  pathname: string,
): Promise<boolean> => {
  // Prevent path traversal: resolve absolutely then assert containment.
  const root = resolve(webDistDir);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(root, requested);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    return false;
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      console.error(
        `[API] Static file error: ${filePath}`,
        error instanceof Error ? error.message : error,
      );
    }
    return false;
  }
};

const isAuthorizedRequest = (
  request: IncomingMessage,
  pairingService: PairingService,
): boolean => {
  const hostHeader = readHeaderValue(request.headers.host);
  if (isLoopbackHostHeader(hostHeader)) {
    return true;
  }

  const authHeader = readHeaderValue(request.headers.authorization);
  const bearer = extractBearerToken(authHeader);
  if (bearer && pairingService.verifyToken(bearer)) {
    return true;
  }

  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const tokenQuery = requestUrl.searchParams.get("token");
    if (tokenQuery && pairingService.verifyToken(tokenQuery)) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
};

export const createApiRequestHandler = ({
  runtime,
  workspaceCwd,
  projectStateDir,
  webDistDir,
  promptsDir,
  getApiBaseUrl,
  getApiPort,
  readClaudeUsageSnapshot,
  readClaudeOauthUsageSnapshot,
  readClaudeCliUsageSnapshot,
  readCodexUsageSnapshot,
  readGithubRepoSummary,
  scanUsageHeatmap,
  monitorService,
  invalidateClaudeUsageCache,
  codeIntelStore,
  metricsStore,
  pairingService,
  allowRemoteAccess,
}: CreateApiRequestHandlerOptions) => {
  const resolvedWebDistDir = webDistDir && existsSync(webDistDir) ? webDistDir : null;

  const routeDependencies: RouteHandlerDependencies = {
    runtime,
    workspaceCwd,
    projectStateDir,
    promptsDir,
    getApiBaseUrl,
    getApiPort,
    readClaudeUsageSnapshot,
    readClaudeOauthUsageSnapshot,
    readClaudeCliUsageSnapshot,
    readCodexUsageSnapshot,
    readGithubRepoSummary,
    scanUsageHeatmap,
    monitorService,
    invalidateClaudeUsageCache,
    codeIntelStore,
    metricsStore,
  };

  const resolvedPairingService = pairingService ?? createDefaultPairingService();
  const pairingRoutes = createPairingRoutes(resolvedPairingService, allowRemoteAccess);

  return async (request: IncomingMessage, response: ServerResponse) => {
    const startTime = Date.now();
    let statusCode = 0;
    const originalWriteHead = response.writeHead.bind(response);
    response.writeHead = ((...args: Parameters<typeof response.writeHead>) => {
      statusCode = typeof args[0] === "number" ? args[0] : 0;
      return originalWriteHead(...args);
    }) as typeof response.writeHead;

    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    const corsOrigin = getRequestCorsOrigin(originHeader, allowRemoteAccess);

    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      writeJson(response, 403, { error: "Host not allowed." }, null);
      logRequest(request.method ?? "?", request.url ?? "/", 403, startTime);
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      writeJson(response, 403, { error: "Origin not allowed." }, null);
      logRequest(request.method ?? "?", request.url ?? "/", 403, startTime);
      return;
    }

    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "OPTIONS") {
        writeNoContent(response, 204, corsOrigin);
        logRequest(request.method ?? "OPTIONS", requestUrl.pathname, statusCode, startTime);
        return;
      }

      if (allowRemoteAccess && !isAuthorizedRequest(request, resolvedPairingService)) {
        writeJson(response, 401, { error: "Unauthorized" }, corsOrigin);
        logRequest(request.method ?? "?", requestUrl.pathname, 401, startTime);
        return;
      }

      const routeContext: RouteHandlerContext = {
        request,
        response,
        requestUrl,
        corsOrigin,
      };

      for (const handlePairRoute of pairingRoutes) {
        if (await handlePairRoute(routeContext, routeDependencies)) {
          logRequest(request.method ?? "?", requestUrl.pathname, statusCode, startTime);
          return;
        }
      }

      const prefix = extractRoutePrefix(requestUrl.pathname);
      const handlers = prefix !== null ? API_ROUTE_MAP.get(prefix) : undefined;
      if (handlers) {
        for (const handleRoute of handlers) {
          if (await handleRoute(routeContext, routeDependencies)) {
            logRequest(request.method ?? "?", requestUrl.pathname, statusCode, startTime);
            return;
          }
        }
      }

      // Serve static web frontend if available.
      if (resolvedWebDistDir && request.method === "GET") {
        const served =
          (await serveStaticFile(response, resolvedWebDistDir, requestUrl.pathname)) ||
          (await serveStaticFile(response, resolvedWebDistDir, "/"));
        if (served) {
          logRequest(request.method, requestUrl.pathname, 200, startTime);
          return;
        }
      }

      writeJson(response, 404, { error: "Not found" }, corsOrigin);
      logRequest(request.method ?? "?", requestUrl.pathname, statusCode, startTime);
    } catch (error) {
      console.error(
        `[API] Unhandled error: ${request.method ?? "?"} ${request.url ?? "/"}`,
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      writeJson(
        response,
        500,
        {
          error: "Internal server error",
        },
        corsOrigin,
      );
      logRequest(request.method ?? "?", request.url ?? "/", statusCode, startTime);
    }
  };
};
