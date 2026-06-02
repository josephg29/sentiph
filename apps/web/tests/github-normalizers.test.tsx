import { describe, expect, it } from "vitest";

import { normalizeGitHubRepoSummarySnapshot } from "../src/app/githubNormalizers";

describe("normalizeGitHubRepoSummarySnapshot", () => {
  it("returns null for non-object or unrecognized status", () => {
    expect(normalizeGitHubRepoSummarySnapshot(null)).toBeNull();
    expect(normalizeGitHubRepoSummarySnapshot({ status: "weird" })).toBeNull();
  });

  it("normalizes commit points and recent commits, dropping malformed entries", () => {
    const result = normalizeGitHubRepoSummarySnapshot({
      status: "ok",
      source: "gh-cli",
      repo: "owner/repo",
      stargazerCount: 12,
      commitsPerDay: [{ date: "2026-01-01", count: 3.6 }, { date: "2026-01-02" }, "nope"],
      recentCommits: [
        {
          hash: "abcdef1",
          shortHash: "abcdef1",
          subject: "Fix",
          authorName: "Jo",
          authoredAt: "2026-01-01T00:00:00.000Z",
        },
        { hash: "x" },
      ],
    });

    expect(result?.status).toBe("ok");
    expect(result?.source).toBe("gh-cli");
    expect(result?.repo).toBe("owner/repo");
    expect(result?.stargazerCount).toBe(12);
    expect(result?.commitsPerDay).toEqual([{ date: "2026-01-01", count: 4 }]);
    expect(result?.recentCommits).toHaveLength(1);
    expect(result?.recentCommits?.[0]?.shortHash).toBe("abcdef1");
  });

  it("defaults an unknown source to none", () => {
    expect(
      normalizeGitHubRepoSummarySnapshot({ status: "unavailable", source: "??" })?.source,
    ).toBe("none");
  });
});
