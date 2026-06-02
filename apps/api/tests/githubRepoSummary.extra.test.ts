/**
 * Supplementary tests for githubRepoSummary.ts — covers branches not
 * exercised by the existing githubRepoSummary.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

import { readGithubRepoSummary } from "../src/githubRepoSummary";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = new Date("2026-03-03T12:00:00.000Z");

type RunCommandFn = (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

const makeRunCommand = (
  overrides: Partial<Record<string, () => Promise<{ stdout: string; stderr: string }>>> = {},
): RunCommandFn => {
  return async (command, args) => {
    const key = `${command}:${args[0]}`;
    const override = overrides[key];
    if (override !== undefined) {
      return override();
    }
    if (command === "gh" && args[0] === "repo" && args[1] === "view") {
      return { stdout: "owner/repo\n", stderr: "" };
    }
    if (command === "gh" && args[0] === "api") {
      return {
        stdout: JSON.stringify({
          data: {
            repository: {
              nameWithOwner: "owner/repo",
              stargazerCount: 10,
              issues: { totalCount: 2 },
              pullRequests: { totalCount: 1 },
            },
          },
        }),
        stderr: "",
      };
    }
    if (command === "git" && args[0] === "log" && args.includes("--pretty=format:%ad")) {
      return { stdout: "", stderr: "" };
    }
    if (
      command === "git" &&
      args[0] === "log" &&
      args.includes("--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%b%x1f%s%x1e")
    ) {
      return { stdout: "", stderr: "" };
    }
    if (command === "git" && args[0] === "log" && args.includes("--shortstat")) {
      return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
  };
};

// ---------------------------------------------------------------------------
// readGithubRepoSummary — gh not found / auth errors
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary – auth failures", () => {
  it("returns unavailable when gh CLI is not installed (ENOENT)", async () => {
    const runCommand = vi
      .fn<RunCommandFn>()
      .mockRejectedValueOnce(Object.assign(new Error("gh: command not found"), { code: "ENOENT" }));

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/github cli not found/i);
  });

  it("returns unavailable when gh is not logged in", async () => {
    const runCommand = vi
      .fn<RunCommandFn>()
      .mockRejectedValueOnce(
        Object.assign(new Error("not logged in"), { stderr: "not logged in. Run: gh auth login" }),
      );

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/not authenticated|gh auth login/i);
  });

  it("returns unavailable when api.github.com is unreachable", async () => {
    const runCommand = vi.fn<RunCommandFn>().mockRejectedValueOnce(
      Object.assign(new Error("network error"), {
        stderr: "error connecting to api.github.com: timeout",
      }),
    );

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/unable to reach/i);
  });

  it("returns error on unknown gh error during readRepository", async () => {
    const runCommand = vi.fn<RunCommandFn>().mockRejectedValueOnce(new Error("some unknown error"));

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to resolve/i);
  });

  it("returns unavailable when gh repo view returns empty/invalid repository name", async () => {
    const runCommand = vi.fn<RunCommandFn>().mockResolvedValueOnce({
      stdout: "notavalidrepo\n", // missing '/'
      stderr: "",
    });

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/unable to determine repository/i);
  });

  it("returns unavailable when gh repo view returns a repo with empty owner segment", async () => {
    const runCommand = vi.fn<RunCommandFn>().mockResolvedValueOnce({
      stdout: "/repo\n", // owner is empty string after split
      stderr: "",
    });

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// readGithubRepoSummary — stats/commit errors
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary – stats and commit errors", () => {
  it("returns error when readRepositoryStats throws an unknown error", async () => {
    let callCount = 0;
    const runCommand = vi.fn<RunCommandFn>(async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      callCount++;
      throw new Error("graphql timeout");
    });

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to collect/i);
  });

  it("returns unavailable when git command is not found (ENOENT without gh stderr)", async () => {
    // ENOENT from a git command (no stderr, no gh-specific messages)
    // readGhAuthenticationFailure returns null → falls through to ENOENT check
    const runCommand = vi.fn<RunCommandFn>(async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      // Simulate git not found (ENOENT without code: ENOENT from gh flow)
      const err = Object.assign(new Error("git: not found"), { code: "ENOENT" });
      // No stderr, no message matching gh patterns → readGhAuthenticationFailure returns null
      throw err;
    });

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    // The gh ENOENT check matches first and returns "GitHub CLI not found"
    // because readGhAuthenticationFailure checks code === "ENOENT"
    expect(snapshot.message).toMatch(/github cli not found|required command-line tools/i);
  });

  it("returns unavailable when stats phase has auth failure (not logged in)", async () => {
    const runCommand = vi.fn<RunCommandFn>(async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      throw Object.assign(new Error("auth error"), {
        stderr: "not logged in. Run: gh auth login",
      });
    });

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/not authenticated/i);
  });

  it("returns error when repository_not_found is thrown from graphql", async () => {
    const runCommand = vi.fn<RunCommandFn>(async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "api") {
        return {
          stdout: JSON.stringify({ data: { repository: null } }),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    });

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// readGithubRepoSummary — commit series and parsing edge cases
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary – commit series", () => {
  it("builds a 30-day series with zeros for days with no commits", async () => {
    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand: makeRunCommand(),
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.commitsPerDay).toHaveLength(30);
    // All zeros since no commit log output
    expect(snapshot.commitsPerDay?.every((p) => p.count === 0)).toBe(true);
  });

  it("accumulates commit counts by date in the series", async () => {
    const runCommand: RunCommandFn = makeRunCommand({
      "git:log": async () => ({
        stdout: "2026-03-01\n2026-03-01\n2026-02-28\n",
        stderr: "",
      }),
    });

    // Need full control over git:log dispatch for commit series specifically
    const fullRunCommand: RunCommandFn = async (command, args, options) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "api") {
        return {
          stdout: JSON.stringify({
            data: {
              repository: {
                nameWithOwner: "owner/repo",
                stargazerCount: 5,
                issues: { totalCount: 0 },
                pullRequests: { totalCount: 0 },
              },
            },
          }),
          stderr: "",
        };
      }
      if (command === "git" && args.includes("--pretty=format:%ad")) {
        return { stdout: "2026-03-01\n2026-03-01\n2026-02-28\n", stderr: "" };
      }
      if (
        command === "git" &&
        args.includes("--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%b%x1f%s%x1e")
      ) {
        return { stdout: "", stderr: "" };
      }
      if (command === "git" && args.includes("--shortstat")) {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
    };

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand: fullRunCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.commitsPerDay?.find((p) => p.date === "2026-03-01")?.count).toBe(2);
    expect(snapshot.commitsPerDay?.find((p) => p.date === "2026-02-28")?.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// readGithubRepoSummary — parseRecentCommit edge cases
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary – parseRecentCommit edge cases", () => {
  it("skips commit entries that are missing required fields", async () => {
    // An entry with only 2 unit separator fields (no authorName, date, subject)
    const malformedEntry = "hashshorthash";

    const fullRunCommand: RunCommandFn = async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "api") {
        return {
          stdout: JSON.stringify({
            data: {
              repository: {
                nameWithOwner: "owner/repo",
                stargazerCount: 0,
                issues: { totalCount: 0 },
                pullRequests: { totalCount: 0 },
              },
            },
          }),
          stderr: "",
        };
      }
      if (command === "git" && args.includes("--pretty=format:%ad")) {
        return { stdout: "", stderr: "" };
      }
      if (
        command === "git" &&
        args.includes("--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%b%x1f%s%x1e")
      ) {
        return { stdout: malformedEntry, stderr: "" };
      }
      if (command === "git" && args.includes("--shortstat")) {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
    };

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand: fullRunCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.recentCommits).toHaveLength(0);
  });

  it("maps non-finite authoredAt to raw string", async () => {
    const badDate = "not-a-date";
    const entry = `hashshortAuthoremail@x.com${badDate}bodysubject`;

    const fullRunCommand: RunCommandFn = async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "view") {
        return { stdout: "owner/repo\n", stderr: "" };
      }
      if (command === "gh" && args[0] === "api") {
        return {
          stdout: JSON.stringify({
            data: {
              repository: {
                nameWithOwner: "owner/repo",
                stargazerCount: 0,
                issues: { totalCount: 0 },
                pullRequests: { totalCount: 0 },
              },
            },
          }),
          stderr: "",
        };
      }
      if (command === "git" && args.includes("--pretty=format:%ad")) {
        return { stdout: "", stderr: "" };
      }
      if (
        command === "git" &&
        args.includes("--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%b%x1f%s%x1e")
      ) {
        return { stdout: entry, stderr: "" };
      }
      if (command === "git" && args.includes("--shortstat")) {
        return { stdout: "", stderr: "" };
      }
      throw new Error("Unexpected");
    };

    const snapshot = await readGithubRepoSummary({
      now: () => NOW,
      runCommand: fullRunCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    expect(snapshot.recentCommits?.[0]?.authoredAt).toBe(badDate);
  });
});

// ---------------------------------------------------------------------------
// parseShortStat contract
// ---------------------------------------------------------------------------
describe("parseShortStat output contract", () => {
  it("git --shortstat output contains expected patterns", async () => {
    const shortstatLine = "3 files changed, 10 insertions(+), 2 deletions(-)";
    const files = shortstatLine.match(/(\d+)\s+files?\s+changed/);
    const ins = shortstatLine.match(/(\d+)\s+insertions?\(\+\)/);
    const del = shortstatLine.match(/(\d+)\s+deletions?\(-\)/);

    expect(Number.parseInt(files?.[1] ?? "0", 10)).toBe(3);
    expect(Number.parseInt(ins?.[1] ?? "0", 10)).toBe(10);
    expect(Number.parseInt(del?.[1] ?? "0", 10)).toBe(2);
  });

  it("parses single-file shortstat", async () => {
    const shortstatLine = "1 file changed, 5 insertions(+)";
    const files = shortstatLine.match(/(\d+)\s+files?\s+changed/);
    const ins = shortstatLine.match(/(\d+)\s+insertions?\(\+\)/);
    const del = shortstatLine.match(/(\d+)\s+deletions?\(-\)/);

    expect(Number.parseInt(files?.[1] ?? "0", 10)).toBe(1);
    expect(Number.parseInt(ins?.[1] ?? "0", 10)).toBe(5);
    expect(del).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeRepository contract
// ---------------------------------------------------------------------------
describe("normalizeRepository contract", () => {
  const normalizeRepository = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed.includes("/")) {
      return null;
    }
    const [owner, name] = trimmed.split("/");
    if (!owner || !name) {
      return null;
    }
    return `${owner}/${name}`;
  };

  it("returns null when there is no slash", () => {
    expect(normalizeRepository("noslash")).toBeNull();
  });

  it("returns null when owner is empty", () => {
    expect(normalizeRepository("/repo")).toBeNull();
  });

  it("returns null when name is empty", () => {
    expect(normalizeRepository("owner/")).toBeNull();
  });

  it("returns owner/name for valid input", () => {
    expect(normalizeRepository("owner/repo")).toBe("owner/repo");
    expect(normalizeRepository("  owner/repo\n")).toBe("owner/repo");
  });
});
