import { describe, expect, it, vi } from "vitest";

import { readGithubRepoSummary } from "../src/githubRepoSummary";

describe("readGithubRepoSummary", () => {
  it("returns repository stats, 30-day commit series, and last 50 recent commits", async () => {
    const recentCommitRecords = Array.from({ length: 52 }, (_, index) => {
      const offset = index + 1;
      const day = String(Math.min(28, 28 - index)).padStart(2, "0");
      return `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${offset.toString(16)}\u001fshort${offset}\u001fAuthor ${offset}\u001f2026-02-${day}T10:00:00.000Z\u001fsubject ${offset}\u001e`;
    }).join("");

    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return {
          stdout: "hesamsheikh/octogent\n",
          stderr: "",
        };
      }

      if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
        return {
          stdout: JSON.stringify({
            data: {
              repository: {
                nameWithOwner: "hesamsheikh/octogent",
                stargazerCount: 42,
                issues: { totalCount: 7 },
                pullRequests: { totalCount: 3 },
              },
            },
          }),
          stderr: "",
        };
      }

      if (
        command === "git" &&
        args[0] === "log" &&
        args.includes("--pretty=format:%ad")
      ) {
        return {
          stdout: "2026-02-27\n2026-02-27\n2026-03-01\n",
          stderr: "",
        };
      }

      if (
        command === "git" &&
        args[0] === "log" &&
        args.includes("--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e")
      ) {
        return {
          stdout: recentCommitRecords,
          stderr: "",
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.repo).toBe("hesamsheikh/octogent");
    expect(snapshot.stargazerCount).toBe(42);
    expect(snapshot.openIssueCount).toBe(7);
    expect(snapshot.openPullRequestCount).toBe(3);
    expect(snapshot.commitsPerDay).toHaveLength(30);
    expect(snapshot.commitsPerDay?.find((point) => point.date === "2026-02-27")?.count).toBe(2);
    expect(snapshot.commitsPerDay?.find((point) => point.date === "2026-03-01")?.count).toBe(1);
    expect(snapshot.recentCommits).toHaveLength(50);
    expect(snapshot.recentCommits?.[0]).toEqual({
      hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
      shortHash: "short1",
      subject: "subject 1",
      authorName: "Author 1",
      authoredAt: "2026-02-28T10:00:00.000Z",
    });
    expect(snapshot.recentCommits?.[49]?.shortHash).toBe("short50");
  });
});
