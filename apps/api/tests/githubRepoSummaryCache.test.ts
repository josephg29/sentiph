import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readGithubRepoSummaryCached, resetGithubRepoSummaryCache } from "../src/githubRepoSummary";

const makeRunCommand = (repo: string) =>
  vi.fn(async (command: string, args: string[]) => {
    if (command === "gh" && args[0] === "repo" && args[1] === "view") {
      return { stdout: `${repo}\n`, stderr: "" };
    }
    if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
      return {
        stdout: JSON.stringify({
          data: {
            repository: {
              nameWithOwner: repo,
              stargazerCount: 1,
              issues: { totalCount: 0 },
              pullRequests: { totalCount: 0 },
            },
          },
        }),
        stderr: "",
      };
    }
    // any git log call
    return { stdout: "", stderr: "" };
  });

describe("readGithubRepoSummaryCached", () => {
  beforeEach(() => {
    resetGithubRepoSummaryCache();
  });

  afterEach(() => {
    resetGithubRepoSummaryCache();
  });

  it("fetches on a cold cache and serves the cached snapshot on the next call", async () => {
    const runCommand = makeRunCommand("owner/one");
    const first = await readGithubRepoSummaryCached({ cwd: "/w", env: {}, runCommand });
    expect(first.status).toBe("ok");

    // Second call within TTL should not invoke runCommand again (dedup served from cache).
    const callsAfterFirst = runCommand.mock.calls.length;
    const second = await readGithubRepoSummaryCached({ cwd: "/w", env: {}, runCommand });
    expect(second).toBe(first);
    expect(runCommand.mock.calls.length).toBe(callsAfterFirst);
  });

  it("re-fetches after the cache is reset", async () => {
    const runCommand = makeRunCommand("owner/two");
    await readGithubRepoSummaryCached({ cwd: "/w", env: {}, runCommand });
    const callsAfterFirst = runCommand.mock.calls.length;

    resetGithubRepoSummaryCache();
    await readGithubRepoSummaryCached({ cwd: "/w", env: {}, runCommand });
    expect(runCommand.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("serves a stale snapshot immediately while refreshing in the background", async () => {
    vi.useFakeTimers();
    try {
      const runCommand = makeRunCommand("owner/three");
      await readGithubRepoSummaryCached({ cwd: "/w", env: {}, runCommand });
      const callsAfterFirst = runCommand.mock.calls.length;

      // Advance past the 60s TTL so the cached entry is stale.
      vi.advanceTimersByTime(61_000);

      const stale = await readGithubRepoSummaryCached({ cwd: "/w", env: {}, runCommand });
      // Returned the stale (cached) snapshot synchronously without awaiting a fresh fetch.
      expect(stale.status).toBe("ok");
      // A background refresh was kicked off (more commands issued).
      expect(runCommand.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });
});
