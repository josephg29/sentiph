import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "../src/createApiServer";
import type { GitClient, TmuxClient } from "../src/terminalRuntime";

class FakeTmuxClient implements TmuxClient {
  private readonly sessions = new Map<string, { cwd: string; command?: string }>();

  assertAvailable(): void {}

  hasSession(sessionName: string): boolean {
    return this.sessions.has(sessionName);
  }

  configureSession(sessionName: string): void {
    if (!this.sessions.has(sessionName)) {
      throw new Error(`Unknown session: ${sessionName}`);
    }
  }

  capturePane(sessionName: string): string {
    return this.sessions.has(sessionName) ? "fake tmux snapshot\n" : "";
  }

  createSession({
    sessionName,
    cwd,
    command,
  }: {
    sessionName: string;
    cwd: string;
    command?: string;
  }): void {
    if (this.sessions.has(sessionName)) {
      throw new Error(`Session already exists: ${sessionName}`);
    }
    this.sessions.set(sessionName, command ? { cwd, command } : { cwd });
  }

  killSession(sessionName: string): void {
    this.sessions.delete(sessionName);
  }
}

class FakeGitClient implements GitClient {
  private readonly worktrees = new Map<
    string,
    { branchName: string; baseRef: string; cwd: string }
  >();

  assertAvailable(): void {}

  isRepository(): boolean {
    return true;
  }

  addWorktree({
    cwd,
    path,
    branchName,
    baseRef,
  }: {
    cwd: string;
    path: string;
    branchName: string;
    baseRef: string;
  }): void {
    if (this.worktrees.has(path)) {
      throw new Error(`Worktree already exists: ${path}`);
    }
    mkdirSync(path, { recursive: true });
    this.worktrees.set(path, { cwd, branchName, baseRef });
  }

  removeWorktree({ path }: { cwd: string; path: string }): void {
    this.worktrees.delete(path);
  }
}

describe("monitor API routes", () => {
  let stopServer: (() => Promise<void>) | null = null;
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    if (stopServer) {
      await stopServer();
      stopServer = null;
    }

    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories.length = 0;
  });

  const startServer = async (options: Partial<Parameters<typeof createApiServer>[0]> = {}) => {
    const workspaceCwd =
      options.workspaceCwd ??
      (() => {
        const directory = mkdtempSync(join(tmpdir(), "octogent-monitor-api-test-"));
        temporaryDirectories.push(directory);
        return directory;
      })();

    const apiServer = createApiServer({
      workspaceCwd,
      tmuxClient: options.tmuxClient ?? new FakeTmuxClient(),
      gitClient: options.gitClient ?? new FakeGitClient(),
      ...options,
    });

    const address = await apiServer.start(0, "127.0.0.1");
    stopServer = () => apiServer.stop();
    return `http://${address.host}:${address.port}`;
  };

  it("saves monitor credentials and returns redacted config", async () => {
    const baseUrl = await startServer();

    const patchResponse = await fetch(`${baseUrl}/api/monitor/config`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerId: "x",
        validateCredentials: false,
        queryTerms: ["AI Engineering", "Codex"],
        credentials: {
          bearerToken: "x-example-secret-token",
          apiKey: "x-api-key-value",
          apiSecret: "x-api-secret-value",
        },
      }),
    });

    expect(patchResponse.status).toBe(200);
    const patchPayload = (await patchResponse.json()) as Record<string, unknown>;
    expect(patchPayload.providerId).toBe("x");
    expect(patchPayload.queryTerms).toEqual(["AI Engineering", "Codex"]);

    const providers = patchPayload.providers as Record<string, unknown>;
    const provider = providers.x as Record<string, unknown>;
    const credentials = provider.credentials as Record<string, unknown>;

    expect(credentials.isConfigured).toBe(true);
    expect(typeof credentials.bearerTokenHint).toBe("string");
    expect((credentials.bearerTokenHint as string).endsWith("oken")).toBe(true);
    expect(typeof credentials.apiKeyHint).toBe("string");
    expect((credentials.apiKeyHint as string).endsWith("alue")).toBe(true);
    expect(Object.hasOwn(credentials, "bearerToken")).toBe(false);
    expect(Object.hasOwn(credentials, "apiSecret")).toBe(false);

    const getResponse = await fetch(`${baseUrl}/api/monitor/config`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(patchPayload);
  });

  it("returns 400 for invalid monitor config patch payload", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/api/monitor/config`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queryTerms: "AI Engineering",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "queryTerms must be an array of strings.",
    });
  });

  it("uses non-forced read for feed and forced read for manual refresh", async () => {
    const readFeedCalls: Array<Record<string, unknown>> = [];
    const monitorService = {
      readConfig: async () => ({
        providerId: "x",
        queryTerms: ["Codex"],
        refreshPolicy: {
          maxCacheAgeMs: 24 * 60 * 60 * 1000,
        },
        providers: {
          x: {
            credentials: {
              isConfigured: true,
              bearerTokenHint: "***oken",
              apiKeyHint: null,
              hasApiSecret: false,
              hasAccessToken: false,
              hasAccessTokenSecret: false,
              updatedAt: "2026-02-28T12:00:00.000Z",
            },
          },
        },
      }),
      patchConfig: async () => {
        throw new Error("not implemented");
      },
      readFeed: async (options?: Record<string, unknown>) => {
        readFeedCalls.push(options ?? {});
        return {
          providerId: "x",
          queryTerms: ["Codex"],
          refreshPolicy: {
            maxCacheAgeMs: 24 * 60 * 60 * 1000,
          },
          lastFetchedAt: "2026-02-28T12:00:00.000Z",
          staleAfter: "2026-03-01T12:00:00.000Z",
          isStale: false,
          lastError: null,
          posts: [],
          usage: null,
        };
      },
    };

    const baseUrl = await startServer({
      monitorService: monitorService as never,
    });

    const feedResponse = await fetch(`${baseUrl}/api/monitor/feed`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(feedResponse.status).toBe(200);

    const manualRefreshResponse = await fetch(`${baseUrl}/api/monitor/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(manualRefreshResponse.status).toBe(200);

    expect(readFeedCalls).toEqual([
      {
        forceRefresh: false,
        refreshIfStale: true,
      },
      {
        forceRefresh: true,
        refreshIfStale: true,
      },
    ]);
  });
});
