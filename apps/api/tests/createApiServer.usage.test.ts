import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

import type { GitHubRepoSummarySnapshot } from "../src/githubRepoSummary";
import { setupServerHarness } from "./helpers/createApiServerHarness";

describe("createApiServer", () => {
  const h = setupServerHarness();

  afterEach(async () => {
    await h.teardown();
  });

  it("returns codex usage snapshot for GET /api/codex/usage", async () => {
    const codexSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-02-25T12:00:00.000Z",
      planType: "pro",
      primaryUsedPercent: 12,
      secondaryUsedPercent: 28,
      creditsBalance: 88.5,
      creditsUnlimited: false,
    } as const;

    const baseUrl = await h.startServer({
      readCodexUsageSnapshot: async () => codexSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/codex/usage`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(codexSnapshot);
  });

  it("returns claude usage snapshot for GET /api/claude/usage", async () => {
    const claudeSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-03-03T12:00:00.000Z",
      planType: "pro",
      primaryUsedPercent: 11,
      primaryResetAt: "2026-03-03T15:00:00.000Z",
      secondaryUsedPercent: 27,
      secondaryResetAt: "2026-03-05T00:00:00.000Z",
      sonnetUsedPercent: 19,
      sonnetResetAt: "2026-03-05T00:00:00.000Z",
    } as const;

    const baseUrl = await h.startServer({
      readClaudeUsageSnapshot: async () => claudeSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(claudeSnapshot);
  });

  it("returns oauth claude usage snapshot for GET /api/claude/usage/oauth", async () => {
    const claudeSnapshot = {
      status: "ok",
      source: "oauth-api",
      fetchedAt: "2026-03-03T12:00:00.000Z",
      primaryUsedPercent: 11,
      secondaryUsedPercent: 27,
    } as const;

    const baseUrl = await h.startServer({
      readClaudeOauthUsageSnapshot: async () => claudeSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/oauth`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(claudeSnapshot);
  });

  it("returns cli claude usage snapshot for GET /api/claude/usage/cli", async () => {
    const claudeSnapshot = {
      status: "ok",
      source: "cli-pty",
      fetchedAt: "2026-03-03T12:00:00.000Z",
      primaryUsedPercent: 9,
      secondaryUsedPercent: 22,
      sonnetUsedPercent: 14,
    } as const;

    const baseUrl = await h.startServer({
      readClaudeCliUsageSnapshot: async () => claudeSnapshot,
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/cli`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(claudeSnapshot);
  });

  it("returns github summary for GET /api/github/summary", async () => {
    const githubSummary: GitHubRepoSummarySnapshot = {
      status: "ok",
      fetchedAt: "2026-02-27T12:00:00.000Z",
      source: "gh-cli",
      repo: "josephg29/sentiph",
      stargazerCount: 42,
      openIssueCount: 7,
      openPullRequestCount: 3,
      commitsPerDay: [
        { date: "2026-02-25", count: 4 },
        { date: "2026-02-26", count: 6 },
        { date: "2026-02-27", count: 8 },
      ],
      recentCommits: [
        {
          hash: "d8f2d9b7aa9f53f8fa254d8e0f3a13270435e321",
          shortHash: "d8f2d9b",
          subject: "tighten monitor polling backoff strategy",
          authorName: "Hesam Sheikh",
          authorEmail: "hesam@example.com",
          authoredAt: "2026-02-27T10:12:00.000Z",
          body: "Reduce the backoff multiplier from 2x to 1.5x to improve\nresponsiveness when rate limits recover.",
          filesChanged: 3,
          insertions: 42,
          deletions: 7,
        },
      ],
    };

    const baseUrl = await h.startServer({
      readGithubRepoSummary: async () => githubSummary,
    });

    const response = await fetch(`${baseUrl}/api/github/summary`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(githubSummary);
  });

  it("returns 405 for unsupported methods on /api/codex/usage", async () => {
    const baseUrl = await h.startServer({
      readCodexUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-02-25T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/codex/usage`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/claude/usage", async () => {
    const baseUrl = await h.startServer({
      readClaudeUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-03-03T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/claude/usage/oauth", async () => {
    const baseUrl = await h.startServer({
      readClaudeOauthUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-03-03T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/oauth`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/claude/usage/cli", async () => {
    const baseUrl = await h.startServer({
      readClaudeCliUsageSnapshot: async () => ({
        status: "unavailable",
        source: "none",
        fetchedAt: "2026-03-03T12:00:00.000Z",
      }),
    });

    const response = await fetch(`${baseUrl}/api/claude/usage/cli`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("returns 405 for unsupported methods on /api/github/summary", async () => {
    const baseUrl = await h.startServer({
      readGithubRepoSummary: async () => ({
        status: "unavailable",
        fetchedAt: "2026-02-27T12:00:00.000Z",
        source: "none",
        message: "GitHub CLI not available.",
      }),
    });

    const response = await fetch(`${baseUrl}/api/github/summary`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("POST /api/hooks/session-start invalidates claude usage cache", async () => {
    let callCount = 0;
    const readClaudeUsageSnapshot = async () => {
      callCount++;
      return {
        status: "ok" as const,
        source: "oauth-api" as const,
        fetchedAt: "2026-03-03T12:00:00.000Z",
        planType: "pro",
        primaryUsedPercent: callCount * 10,
        secondaryUsedPercent: 50,
        sonnetUsedPercent: 30,
      };
    };

    const invalidateCalls: number[] = [];
    const invalidateClaudeUsageCache = () => {
      invalidateCalls.push(Date.now());
    };

    const baseUrl = await h.startServer({
      readClaudeUsageSnapshot,
      invalidateClaudeUsageCache,
    });

    // First GET — callCount becomes 1
    const first = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { primaryUsedPercent: number };
    expect(firstBody.primaryUsedPercent).toBe(10);

    // POST hook — should invalidate and warm cache
    const hookResponse = await fetch(`${baseUrl}/api/hooks/session-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "test-session" }),
    });
    expect(hookResponse.status).toBe(200);
    expect(invalidateCalls.length).toBe(1);

    // Next GET triggers a fresh read (callCount incremented again)
    const second = await fetch(`${baseUrl}/api/claude/usage`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { primaryUsedPercent: number };
    // callCount > 2 confirms the warm call + this GET both invoked the reader
    expect(secondBody.primaryUsedPercent).toBeGreaterThan(10);
  });
});
