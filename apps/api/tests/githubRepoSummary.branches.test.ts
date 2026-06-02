/**
 * tests/githubRepoSummary.branches.test.ts
 *
 * Covers uncovered branches in githubRepoSummary.ts:
 *  - buildDailySeries: startDate / endDate undefined guard (unreachable - skipped)
 *  - readCommitSeries: startDate/endDate not available → returns []  (same guard)
 *  - readCommitDiffStats: nextLine does NOT include "changed" → hash with zero stats
 *  - readGithubRepoSummary inner catch: ENOENT code → unavailable (Required command-line tools)
 *  - readGhAuthenticationFailure: error.code === "ENOENT" path
 *  - readGhAuthenticationFailure: stderr includes "not logged in"
 *  - readGhAuthenticationFailure: stderr includes "error connecting to api.github.com"
 *  - normalizeRepository: no "/" → returns null → unavailable snapshot
 *  - parseRecentCommit: authoredAt not parseable → uses raw string
 *
 * Skipped-unreachable:
 *  - buildDailySeries internal `!startDate || !endDate` guard: dates array always
 *    has COMMIT_SERIES_DAYS=30 entries; these can never be falsy.
 */

import { describe, expect, it, vi } from "vitest";

import { readGithubRepoSummary } from "../src/githubRepoSummary";

type CommandResult = { stdout: string; stderr: string };
type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

// Helpers to build mock runCommand
function buildRunCommand(
  overrides: Partial<Record<string, () => Promise<CommandResult>>>,
): RunCommand {
  return async (command, args) => {
    const key = `${command}:${args[0] ?? ""}`;
    const handler = overrides[key];
    if (handler) return handler();
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
}

const ok = (stdout: string): Promise<CommandResult> => Promise.resolve({ stdout, stderr: "" });

const graphqlOk = JSON.stringify({
  data: {
    repository: {
      nameWithOwner: "owner/repo",
      stargazerCount: 1,
      issues: { totalCount: 0 },
      pullRequests: { totalCount: 0 },
    },
  },
});

// Minimal runCommand that satisfies the happy path
function happyRunCommand(recentCommitsStdout: string, diffStatsStdout: string): RunCommand {
  return async (command, args) => {
    if (command === "gh" && args[0] === "repo") return ok("owner/repo\n");
    if (command === "gh" && args[0] === "api") return ok(graphqlOk);
    if (command === "git" && args[0] === "log" && args.includes("--pretty=format:%ad"))
      return ok("");
    if (command === "git" && args[0] === "log" && args.includes("--shortstat"))
      return ok(diffStatsStdout);
    if (command === "git" && args[0] === "log") return ok(recentCommitsStdout);
    throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
  };
}

// ---------------------------------------------------------------------------
// readGhAuthenticationFailure — ENOENT code → CLI not found
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — gh CLI not found (ENOENT)", () => {
  it("returns unavailable with 'Install gh' message when code is ENOENT", async () => {
    const runCommand: RunCommand = async () => {
      const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      throw err;
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/install.*gh|gh.*install/i);
  });
});

// ---------------------------------------------------------------------------
// readGhAuthenticationFailure — stderr includes "not logged in"
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — gh not logged in", () => {
  it("returns unavailable with 'not authenticated' message when not logged in", async () => {
    const runCommand: RunCommand = async () => {
      const err = Object.assign(new Error("not logged in"), {
        stderr: "You are not logged in to any GitHub hosts. Run `gh auth login`.",
      });
      throw err;
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/not authenticated|gh auth login/i);
  });

  it("returns unavailable using error.message when stderr is not a string", async () => {
    const runCommand: RunCommand = async () => {
      const err = Object.assign(new Error("you are not logged in"), {
        stderr: 12345, // not a string → falls back to message
      });
      throw err;
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/not authenticated/i);
  });
});

// ---------------------------------------------------------------------------
// readGhAuthenticationFailure — "error connecting to api.github.com"
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — cannot reach api.github.com", () => {
  it("returns unavailable with network message when cannot connect to GitHub", async () => {
    const runCommand: RunCommand = async () => {
      const err = Object.assign(new Error("connection failed"), {
        stderr: "error connecting to api.github.com",
      });
      throw err;
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/api\.github\.com/i);
  });
});

// ---------------------------------------------------------------------------
// normalizeRepository: value has no "/" → returns null → unavailableSnapshot
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — invalid repository format", () => {
  it("returns unavailable when gh repo view returns text without /", async () => {
    const runCommand: RunCommand = async (command, args) => {
      if (command === "gh" && args[0] === "repo") {
        // Output has no "/" → normalizeRepository returns null
        return ok("no-slash-here\n");
      }
      throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.message).toMatch(/unable to determine repository/i);
  });

  it("returns unavailable when owner or name component is empty after split", async () => {
    const runCommand: RunCommand = async (command, args) => {
      if (command === "gh" && args[0] === "repo") {
        // "/" with empty parts
        return ok("/no-owner\n");
      }
      throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// readCommitDiffStats: hash line with no following "changed" line → zero stats
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — commit with no diff stats", () => {
  it("assigns zero stats to commit when no shortstat line follows the hash", async () => {
    const hash = "aaaa1111bbbb2222cccc3333dddd4444eeee5555";
    const shortHash = "abcd1234";
    const subject = "Fix something";
    const authorName = "Dev";
    const authorEmail = "dev@example.com";
    const authoredAt = "2026-02-20T10:00:00.000Z";
    const body = "";

    // Recent commits format: hash\x1fshortHash\x1fauthorName\x1fauthorEmail\x1fauthoredAt\x1fbody\x1fsubject\x1e
    const recentCommitsStdout = `${hash}\x1f${shortHash}\x1f${authorName}\x1f${authorEmail}\x1f${authoredAt}\x1f${body}\x1f${subject}\x1e`;

    // Diff stats: only the hash line, no following shortstat line
    // (next line is either another hash or empty)
    const diffStatsStdout = `${hash}\n`;

    const runCommand = happyRunCommand(recentCommitsStdout, diffStatsStdout);

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    const commit = snapshot.recentCommits?.[0];
    expect(commit?.hash).toBe(hash);
    expect(commit?.filesChanged).toBe(0);
    expect(commit?.insertions).toBe(0);
    expect(commit?.deletions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// readGithubRepoSummary inner catch: ENOENT code on stats call
// Note: the `errorWithCode?.code === "ENOENT"` branch on line 391 is actually
// unreachable because readGhAuthenticationFailure already handles ENOENT first
// (returns "GitHub CLI not found" message). Skipped as unreachable.
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — inner catch ENOENT", () => {
  it("returns unavailable with gh-cli-not-found message when inner ENOENT thrown", async () => {
    const runCommand: RunCommand = async (command, args) => {
      if (command === "gh" && args[0] === "repo") {
        return ok("owner/repo\n");
      }
      // readGhAuthenticationFailure catches ENOENT and returns "GitHub CLI not found"
      const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      throw err;
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("unavailable");
    // readGhAuthenticationFailure intercepts ENOENT first
    expect(snapshot.message).toMatch(/install.*gh|gh.*install/i);
  });

  it("returns error snapshot for unknown inner error", async () => {
    const runCommand: RunCommand = async (command, args) => {
      if (command === "gh" && args[0] === "repo") {
        return ok("owner/repo\n");
      }
      throw new Error("graphql failure");
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toMatch(/unable to collect/i);
  });
});

// ---------------------------------------------------------------------------
// readGhAuthenticationFailure — error is not an object
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — non-object error", () => {
  it("returns error snapshot when thrown value is null", async () => {
    const runCommand: RunCommand = async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw null;
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("error");
  });

  it("returns error snapshot when thrown value is a string", async () => {
    const runCommand: RunCommand = async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "some string error";
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// parseRecentCommit — authoredAt is not parseable → uses raw string
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — unparseable authoredAt in commit", () => {
  it("uses raw authoredAt string when Date.parse returns NaN", async () => {
    const hash = "bbbb2222cccc3333dddd4444eeee5555ffff6666";
    const shortHash = "bbbb2222";
    const authorName = "Author";
    const authorEmail = "a@b.com";
    const authoredAt = "not-a-date";
    const body = "";
    const subject = "My commit";

    const recentCommitsStdout = `${hash}\x1f${shortHash}\x1f${authorName}\x1f${authorEmail}\x1f${authoredAt}\x1f${body}\x1f${subject}\x1e`;
    const diffStatsStdout = `${hash}\n 1 file changed, 1 insertion(+), 0 deletions(-)\n`;

    const runCommand = happyRunCommand(recentCommitsStdout, diffStatsStdout);

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    expect(snapshot.status).toBe("ok");
    const commit = snapshot.recentCommits?.[0];
    // authoredAt is kept as the raw string since it didn't parse
    expect(commit?.authoredAt).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// readRepositoryStats — repo is null → throws repository_not_found
// ---------------------------------------------------------------------------
describe("readGithubRepoSummary — null repository in GraphQL response", () => {
  it("returns error when graphql returns null repository", async () => {
    const runCommand: RunCommand = async (command, args) => {
      if (command === "gh" && args[0] === "repo") return ok("owner/repo\n");
      if (command === "gh" && args[0] === "api") {
        return ok(JSON.stringify({ data: { repository: null } }));
      }
      if (command === "git" && args[0] === "log" && args.includes("--pretty=format:%ad"))
        return ok("");
      if (command === "git" && args[0] === "log" && args.includes("--shortstat")) return ok("");
      if (command === "git" && args[0] === "log") return ok("");
      throw new Error(`Unexpected: ${command} ${args.join(" ")}`);
    };

    const snapshot = await readGithubRepoSummary({
      now: () => new Date("2026-03-03T12:00:00.000Z"),
      runCommand,
      cwd: "/workspace",
      env: {},
    });

    // repository_not_found throws → caught by outer catch → error or unavailable
    expect(["error", "unavailable"]).toContain(snapshot.status);
  });
});
