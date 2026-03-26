/**
 * Intercepts fetch() calls to /api/* and routes them through the postMessage bridge
 * to the extension host. This avoids rewriting every hook/component that uses fetch().
 */
import { webviewClient } from "./webviewClient";

type RouteHandler = (url: URL, init?: RequestInit) => Promise<unknown>;

const readJsonBody = async (init?: RequestInit): Promise<unknown> => {
  if (!init?.body) return {};
  if (typeof init.body === "string") return JSON.parse(init.body);
  return {};
};

const routeMap: Array<{
  method: string;
  pattern: RegExp;
  handler: (match: RegExpMatchArray, init?: RequestInit) => Promise<unknown>;
}> = [
  // Terminal snapshots
  {
    method: "GET",
    pattern: /^\/api\/terminal-snapshots$/,
    handler: () => webviewClient.listTerminalSnapshots(),
  },

  // Terminals collection
  {
    method: "POST",
    pattern: /^\/api\/terminals$/,
    handler: async (_match, init) => {
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      const opts: { tentacleName?: string; workspaceMode?: string; agentProvider?: string } = {};
      if (typeof body.tentacleName === "string") opts.tentacleName = body.tentacleName;
      if (typeof body.workspaceMode === "string") opts.workspaceMode = body.workspaceMode;
      if (typeof body.agentProvider === "string") opts.agentProvider = body.agentProvider;
      return webviewClient.createTerminal(opts);
    },
  },

  // Terminal item (PATCH rename, DELETE)
  {
    method: "PATCH",
    pattern: /^\/api\/terminals\/([^/]+)$/,
    handler: async (match, init) => {
      const terminalId = decodeURIComponent(match[1]!);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      return webviewClient.renameTerminal(terminalId, body.name as string);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/terminals\/([^/]+)$/,
    handler: async (match) => {
      const terminalId = decodeURIComponent(match[1]!);
      return webviewClient.deleteTerminal(terminalId);
    },
  },

  // UI State
  {
    method: "GET",
    pattern: /^\/api\/ui-state$/,
    handler: () => webviewClient.readUiState(),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/ui-state$/,
    handler: async (_match, init) => {
      const body = await readJsonBody(init);
      return webviewClient.patchUiState(body as Record<string, unknown>);
    },
  },

  // Conversations
  {
    method: "GET",
    pattern: /^\/api\/conversations$/,
    handler: () => webviewClient.listConversations(),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/conversations$/,
    handler: () => webviewClient.deleteAllConversations(),
  },
  {
    method: "GET",
    pattern: /^\/api\/conversations\/search\?q=(.+)$/,
    handler: (match) => webviewClient.searchConversations(decodeURIComponent(match[1]!)),
  },
  {
    method: "GET",
    pattern: /^\/api\/conversations\/([^/]+)\/export\?format=(json|md)$/,
    handler: (match) =>
      webviewClient.exportConversation(
        decodeURIComponent(match[1]!),
        match[2] as "json" | "md",
      ),
  },
  {
    method: "GET",
    pattern: /^\/api\/conversations\/([^/]+)$/,
    handler: (match) => webviewClient.getConversation(decodeURIComponent(match[1]!)),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/conversations\/([^/]+)$/,
    handler: (match) => webviewClient.deleteConversation(decodeURIComponent(match[1]!)),
  },

  // Deck tentacles
  {
    method: "GET",
    pattern: /^\/api\/deck\/tentacles$/,
    handler: () => webviewClient.listDeckTentacles(),
  },
  {
    method: "POST",
    pattern: /^\/api\/deck\/tentacles$/,
    handler: async (_match, init) => {
      const body = (await readJsonBody(init)) as {
        name: string;
        description: string;
        color: string;
        octopus: unknown;
      };
      return webviewClient.createDeckTentacle(body);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/deck\/tentacles\/([^/]+)$/,
    handler: (match) => webviewClient.deleteDeckTentacle(decodeURIComponent(match[1]!)),
  },
  {
    method: "GET",
    pattern: /^\/api\/deck\/tentacles\/([^/]+)\/files\/([^/]+)$/,
    handler: (match) =>
      webviewClient.readDeckVaultFile(
        decodeURIComponent(match[1]!),
        decodeURIComponent(match[2]!),
      ),
  },

  // Git operations
  {
    method: "GET",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/status$/,
    handler: (match) => webviewClient.gitStatus(decodeURIComponent(match[1]!)),
  },
  {
    method: "POST",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/commit$/,
    handler: async (match, init) => {
      const tentacleId = decodeURIComponent(match[1]!);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      return webviewClient.gitCommit(tentacleId, body.message as string);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/push$/,
    handler: (match) => webviewClient.gitPush(decodeURIComponent(match[1]!)),
  },
  {
    method: "POST",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/sync$/,
    handler: async (match, init) => {
      const tentacleId = decodeURIComponent(match[1]!);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      return webviewClient.gitSync(tentacleId, body.baseRef as string | undefined);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/pr$/,
    handler: (match) => webviewClient.gitPr(decodeURIComponent(match[1]!)),
  },
  {
    method: "POST",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/pr$/,
    handler: async (match, init) => {
      const tentacleId = decodeURIComponent(match[1]!);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      return webviewClient.gitPrCreate(
        tentacleId,
        body.title as string,
        body.body as string | undefined,
        body.baseRef as string | undefined,
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/tentacles\/([^/]+)\/git\/pr\/merge$/,
    handler: (match) => webviewClient.gitPrMerge(decodeURIComponent(match[1]!)),
  },
];

const originalFetch = window.fetch.bind(window);

const bridgedFetch: typeof window.fetch = async (input, init?) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
  const method = (init?.method ?? "GET").toUpperCase();

  // Only intercept /api/* requests
  if (!url.startsWith("/api/")) {
    return originalFetch(input, init);
  }

  // Try to match a route
  for (const route of routeMap) {
    if (route.method !== method) continue;

    // For URLs with query strings, match against the full path+query
    const match = url.match(route.pattern);
    if (!match) continue;

    try {
      const payload = await route.handler(match, init);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // No route matched
  console.warn(`[fetchBridge] No route for ${method} ${url}`);
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
};

export const installFetchBridge = () => {
  window.fetch = bridgedFetch;
};
