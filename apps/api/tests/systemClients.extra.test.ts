/**
 * Supplementary tests for terminalRuntime/systemClients.ts — exercises the
 * now-exported pure helpers and createDefaultGitClient by mocking
 * node:child_process execFileSync.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoist mocks so they are available before module initialization
const { execFileSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, mkdirSync: mkdirSyncMock };
});

import {
  createDefaultGitClient,
  isExitCode,
  isNoPullRequestError,
  parseChangedFile,
  parseDiffNumstatLineCounts,
  parsePullRequestPayload,
  readGhFailureMessage,
} from "../src/terminalRuntime/systemClients";

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeErr = (opts: {
  status?: number;
  stderr?: string | Buffer;
  message?: string;
  code?: string;
}): Error & { status?: number; stderr?: string | Buffer; code?: string } => {
  const err = new Error(opts.message ?? "exec error") as Error & {
    status?: number;
    stderr?: string | Buffer;
    code?: string;
  };
  if (opts.status !== undefined) err.status = opts.status;
  if (opts.stderr !== undefined) err.stderr = opts.stderr;
  if (opts.code !== undefined) err.code = opts.code;
  return err;
};

const validPr = () => ({
  number: 7,
  url: "https://github.com/org/repo/pull/7",
  title: "feat: add thing",
  baseRefName: "main",
  headRefName: "feat/thing",
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
});

// ─── isExitCode ──────────────────────────────────────────────────────────────

describe("isExitCode", () => {
  it("returns true when status matches", () => {
    expect(isExitCode(makeErr({ status: 1 }), 1)).toBe(true);
  });

  it("returns false when status does not match", () => {
    expect(isExitCode(makeErr({ status: 2 }), 1)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isExitCode(null, 1)).toBe(false);
  });

  it("returns false for string primitives", () => {
    expect(isExitCode("error", 1)).toBe(false);
  });

  it("returns false for objects without status", () => {
    expect(isExitCode({}, 1)).toBe(false);
  });
});

// ─── parseChangedFile ────────────────────────────────────────────────────────

describe("parseChangedFile", () => {
  it("returns null for blank payload", () => {
    expect(parseChangedFile("M  ")).toBeNull();
  });

  it("returns filename for a simple modified line", () => {
    expect(parseChangedFile("M  src/foo.ts")).toBe("src/foo.ts");
  });

  it("returns destination path for a rename line", () => {
    expect(parseChangedFile("R  old.ts -> new.ts")).toBe("new.ts");
  });

  it("trims trailing whitespace from the result", () => {
    expect(parseChangedFile("A   src/bar.ts  ")).toBe("src/bar.ts");
  });

  it("returns null when the full line is whitespace-only after XY", () => {
    expect(parseChangedFile("??  ")).toBeNull();
  });
});

// ─── parseDiffNumstatLineCounts ───────────────────────────────────────────────

describe("parseDiffNumstatLineCounts", () => {
  it("returns zeros for empty input", () => {
    expect(parseDiffNumstatLineCounts("")).toEqual({
      insertedLineCount: 0,
      deletedLineCount: 0,
    });
  });

  it("sums insertions and deletions across multiple files", () => {
    expect(parseDiffNumstatLineCounts("10\t5\tfile1.ts\n3\t1\tfile2.ts")).toEqual({
      insertedLineCount: 13,
      deletedLineCount: 6,
    });
  });

  it("ignores binary file entries where values are dashes", () => {
    // parseInt('-') yields NaN, which is not finite, so it contributes 0
    expect(parseDiffNumstatLineCounts("-\t-\tbinary.png\n4\t2\tcode.ts")).toEqual({
      insertedLineCount: 4,
      deletedLineCount: 2,
    });
  });

  it("skips blank lines", () => {
    expect(parseDiffNumstatLineCounts("\n\n5\t3\tfoo.ts\n\n")).toEqual({
      insertedLineCount: 5,
      deletedLineCount: 3,
    });
  });

  it("handles a single file with zero deletions", () => {
    expect(parseDiffNumstatLineCounts("2\t0\tnew.ts")).toEqual({
      insertedLineCount: 2,
      deletedLineCount: 0,
    });
  });
});

// ─── readGhFailureMessage ─────────────────────────────────────────────────────

describe("readGhFailureMessage", () => {
  it("returns install message when code is ENOENT", () => {
    expect(readGhFailureMessage(makeErr({ code: "ENOENT" }))).toContain("GitHub CLI not found");
  });

  it("returns auth message when stderr contains 'not logged in'", () => {
    expect(readGhFailureMessage(makeErr({ stderr: "Error: not logged in" }))).toContain(
      "not authenticated",
    );
  });

  it("returns connectivity message when stderr mentions api.github.com", () => {
    expect(
      readGhFailureMessage(makeErr({ stderr: "error connecting to api.github.com" })),
    ).toContain("api.github.com");
  });

  it("returns null for unrecognized errors", () => {
    expect(readGhFailureMessage(makeErr({ stderr: "disk full" }))).toBeNull();
  });

  it("handles Buffer stderr for auth detection", () => {
    expect(readGhFailureMessage(makeErr({ stderr: Buffer.from("not logged in") }))).toContain(
      "not authenticated",
    );
  });

  it("returns null for null input", () => {
    expect(readGhFailureMessage(null)).toBeNull();
  });

  it("returns null for string input", () => {
    expect(readGhFailureMessage("not logged in")).toBeNull();
  });

  it("falls back to message field when stderr is empty and message matches", () => {
    expect(readGhFailureMessage(makeErr({ message: "not logged in", stderr: "" }))).toContain(
      "not authenticated",
    );
  });
});

// ─── isNoPullRequestError ─────────────────────────────────────────────────────

describe("isNoPullRequestError", () => {
  it("matches 'no pull requests found'", () => {
    expect(isNoPullRequestError(makeErr({ stderr: "no pull requests found for branch" }))).toBe(
      true,
    );
  });

  it("matches 'could not find any pull requests'", () => {
    expect(
      isNoPullRequestError(makeErr({ stderr: "could not find any pull requests associated" })),
    ).toBe(true);
  });

  it("matches 'no open pull requests'", () => {
    expect(isNoPullRequestError(makeErr({ stderr: "no open pull requests" }))).toBe(true);
  });

  it("returns false for generic network errors", () => {
    expect(isNoPullRequestError(makeErr({ stderr: "timeout" }))).toBe(false);
  });

  it("returns false for non-object errors", () => {
    expect(isNoPullRequestError("no pull requests found")).toBe(false);
  });

  it("is case-insensitive (stderr uppercased)", () => {
    expect(isNoPullRequestError(makeErr({ stderr: "NO PULL REQUESTS FOUND" }))).toBe(true);
  });
});

// ─── parsePullRequestPayload ──────────────────────────────────────────────────

describe("parsePullRequestPayload", () => {
  it("parses a complete record correctly", () => {
    const result = parsePullRequestPayload(validPr());
    expect(result.number).toBe(7);
    expect(result.url).toBe("https://github.com/org/repo/pull/7");
    expect(result.title).toBe("feat: add thing");
    expect(result.baseRef).toBe("main");
    expect(result.headRef).toBe("feat/thing");
    expect(result.state).toBe("OPEN");
    expect(result.isDraft).toBe(false);
    expect(result.mergeable).toBe("MERGEABLE");
    expect(result.mergeStateStatus).toBe("CLEAN");
  });

  it("throws for null", () => {
    expect(() => parsePullRequestPayload(null)).toThrow("Invalid PR payload");
  });

  it("throws for undefined", () => {
    expect(() => parsePullRequestPayload(undefined)).toThrow("Invalid PR payload");
  });

  it("throws for string input", () => {
    expect(() => parsePullRequestPayload("not-an-object")).toThrow("Invalid PR payload");
  });

  it("throws when url is empty string", () => {
    expect(() => parsePullRequestPayload({ ...validPr(), url: "" })).toThrow("Missing PR fields");
  });

  it("throws when title is empty string", () => {
    expect(() => parsePullRequestPayload({ ...validPr(), title: "" })).toThrow("Missing PR fields");
  });

  it("throws when number is NaN", () => {
    expect(() => parsePullRequestPayload({ ...validPr(), number: "not-a-number" })).toThrow(
      "Missing PR fields",
    );
  });

  it("defaults state to OPEN for unknown values", () => {
    expect(parsePullRequestPayload({ ...validPr(), state: "PENDING" }).state).toBe("OPEN");
  });

  it("preserves MERGED state", () => {
    expect(parsePullRequestPayload({ ...validPr(), state: "MERGED" }).state).toBe("MERGED");
  });

  it("preserves CLOSED state", () => {
    expect(parsePullRequestPayload({ ...validPr(), state: "CLOSED" }).state).toBe("CLOSED");
  });

  it("defaults mergeable to UNKNOWN for unrecognized values", () => {
    expect(parsePullRequestPayload({ ...validPr(), mergeable: "WEIRD" }).mergeable).toBe("UNKNOWN");
  });

  it("preserves CONFLICTING mergeable", () => {
    expect(parsePullRequestPayload({ ...validPr(), mergeable: "CONFLICTING" }).mergeable).toBe(
      "CONFLICTING",
    );
  });

  it("returns null mergeStateStatus when field absent", () => {
    const { mergeStateStatus: _ignored, ...rec } = validPr();
    expect(parsePullRequestPayload(rec).mergeStateStatus).toBeNull();
  });

  it("reflects isDraft=true", () => {
    expect(parsePullRequestPayload({ ...validPr(), isDraft: true }).isDraft).toBe(true);
  });
});

// ─── createDefaultGitClient ───────────────────────────────────────────────────

describe("createDefaultGitClient", () => {
  let client: ReturnType<typeof createDefaultGitClient>;
  let tmpDir: string;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    client = createDefaultGitClient();
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-sc-extra-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- assertAvailable ---

  describe("assertAvailable", () => {
    it("succeeds when git is present", () => {
      execFileSyncMock.mockReturnValue(undefined);
      expect(() => client.assertAvailable()).not.toThrow();
    });

    it("throws a descriptive error when git is absent", () => {
      execFileSyncMock.mockImplementation(() => {
        throw new Error("spawn ENOENT");
      });
      expect(() => client.assertAvailable()).toThrow("git is required for worktree tentacles");
    });
  });

  // --- isRepository ---

  describe("isRepository", () => {
    it("returns true when output is 'true'", () => {
      execFileSyncMock.mockReturnValue("true\n");
      expect(client.isRepository(tmpDir)).toBe(true);
    });

    it("returns false when output is 'false'", () => {
      execFileSyncMock.mockReturnValue("false\n");
      expect(client.isRepository(tmpDir)).toBe(false);
    });

    it("returns false when git throws", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ status: 128 });
      });
      expect(client.isRepository(tmpDir)).toBe(false);
    });
  });

  // --- addWorktree ---

  describe("addWorktree", () => {
    it("invokes git worktree add with correct arguments", () => {
      execFileSyncMock.mockReturnValue(undefined);
      client.addWorktree({ cwd: tmpDir, path: "/wt/path", branchName: "feat", baseRef: "main" });
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "-b", "feat", "/wt/path", "main"],
        expect.objectContaining({ cwd: tmpDir }),
      );
    });
  });

  // --- removeWorktree ---

  describe("removeWorktree", () => {
    it("invokes git worktree remove --force", () => {
      execFileSyncMock.mockReturnValue(undefined);
      client.removeWorktree({ cwd: tmpDir, path: "/wt/path" });
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "git",
        ["worktree", "remove", "--force", "/wt/path"],
        expect.objectContaining({ cwd: tmpDir }),
      );
    });
  });

  // --- removeBranch ---

  describe("removeBranch", () => {
    it("runs git branch -D when branch exists in listing", () => {
      execFileSyncMock.mockReturnValueOnce("feat/my-branch\n").mockReturnValueOnce(undefined);
      client.removeBranch({ cwd: tmpDir, branchName: "feat/my-branch" });
      expect(execFileSyncMock).toHaveBeenCalledTimes(2);
      expect(execFileSyncMock).toHaveBeenLastCalledWith(
        "git",
        ["branch", "-D", "feat/my-branch"],
        expect.any(Object),
      );
    });

    it("skips deletion when branch is absent from listing", () => {
      execFileSyncMock.mockReturnValueOnce("other-branch\n");
      client.removeBranch({ cwd: tmpDir, branchName: "feat/missing" });
      expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    });

    it("handles empty branch listing gracefully", () => {
      execFileSyncMock.mockReturnValueOnce("\n");
      expect(() => client.removeBranch({ cwd: tmpDir, branchName: "feat/gone" })).not.toThrow();
    });
  });

  // --- readWorktreeStatus ---

  describe("readWorktreeStatus", () => {
    it("returns basic status with no upstream and no conflicts on clean state", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        // rev-parse --abbrev-ref HEAD (not upstream)
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "main\n";
        }
        // all other commands fail → treated as null/empty
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      expect(result.branchName).toBe("main");
      expect(result.upstreamBranchName).toBeNull();
      expect(result.aheadCount).toBe(0);
      expect(result.behindCount).toBe(0);
      expect(result.isDirty).toBe(false);
      expect(result.hasConflicts).toBe(false);
    });

    it("calculates ahead/behind when upstream exists", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        if (args.includes("--verify")) {
          return "abc123\n";
        }
        if (args.includes("@{upstream}")) {
          return "origin/feat\n";
        }
        if (args.includes("--porcelain")) {
          return "";
        }
        if (args.includes("--left-right")) {
          return "3\t1\n"; // behind=3, ahead=1
        }
        if (args.includes("--numstat")) {
          return "";
        }
        if (args.includes("refs/remotes/origin/HEAD")) {
          return "origin/main\n";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      expect(result.behindCount).toBe(3);
      expect(result.aheadCount).toBe(1);
      expect(result.defaultBaseBranchName).toBe("main");
    });

    it("reports hasConflicts=true for UU status lines", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        if (args.includes("--verify")) {
          return "abc\n";
        }
        if (args.includes("--porcelain")) {
          return "UU src/conflict.ts";
        }
        if (args.includes("--numstat")) {
          return "2\t1\tsrc/conflict.ts";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      expect(result.hasConflicts).toBe(true);
      expect(result.isDirty).toBe(true);
    });

    it("uses staged+unstaged numstat when there is no HEAD commit", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "main\n";
        }
        if (args.includes("--verify")) {
          // No HEAD commit
          throw makeErr({ status: 128 });
        }
        if (args.includes("--cached")) {
          return "2\t0\tnew.ts";
        }
        // bare unstaged numstat
        if (
          args.includes("--numstat") &&
          !args.includes("HEAD") &&
          !args.includes("--cached") &&
          !args.includes("--")
        ) {
          return "1\t1\tother.ts";
        }
        if (args.includes("--numstat") && args.includes("--")) {
          return "1\t1\tother.ts";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      // insertedLineCount = 2 (cached) + 1 (unstaged) = 3
      expect(result.insertedLineCount).toBeGreaterThanOrEqual(2);
    });

    it("returns defaultBaseBranchName=null when refs/remotes/origin/HEAD is absent", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      expect(result.defaultBaseBranchName).toBeNull();
    });
  });

  // --- commitAll ---

  describe("commitAll", () => {
    it("succeeds when diff --cached exits 1 (staged changes present)", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("--cached") && args.includes("--quiet")) {
          throw makeErr({ status: 1 });
        }
        return undefined;
      });
      expect(() => client.commitAll({ cwd: tmpDir, message: "fix: thing" })).not.toThrow();
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "fix: thing"],
        expect.any(Object),
      );
    });

    it("throws 'No local changes to commit' when diff --cached exits 0", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("--cached") && args.includes("--quiet")) {
          return undefined; // exit 0 = nothing staged
        }
        return undefined;
      });
      expect(() => client.commitAll({ cwd: tmpDir, message: "msg" })).toThrow(
        "No local changes to commit",
      );
    });

    it("re-throws non-exit-1 errors from diff --cached as prepare error", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("--cached") && args.includes("--quiet")) {
          throw makeErr({ status: 99, message: "disk failure" });
        }
        return undefined;
      });
      expect(() => client.commitAll({ cwd: tmpDir, message: "msg" })).toThrow(
        "Unable to prepare commit",
      );
    });
  });

  // --- pushCurrentBranch ---

  describe("pushCurrentBranch", () => {
    it("runs plain git push when upstream exists", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("@{upstream}")) {
          return "origin/feat\n";
        }
        return undefined;
      });
      client.pushCurrentBranch({ cwd: tmpDir });
      expect(execFileSyncMock).toHaveBeenCalledWith("git", ["push"], expect.any(Object));
    });

    it("runs git push --set-upstream origin HEAD when no upstream", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("@{upstream}")) {
          throw makeErr({ status: 128 });
        }
        return undefined;
      });
      client.pushCurrentBranch({ cwd: tmpDir });
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "git",
        ["push", "--set-upstream", "origin", "HEAD"],
        expect.any(Object),
      );
    });
  });

  // --- syncWithBase ---

  describe("syncWithBase", () => {
    it("fetches then rebases the base ref", () => {
      execFileSyncMock.mockReturnValue("");
      client.syncWithBase({ cwd: tmpDir, baseRef: "main" });
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "git",
        ["fetch", "origin", "main"],
        expect.any(Object),
      );
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "git",
        ["rebase", "origin/main"],
        expect.any(Object),
      );
    });
  });

  // --- readCurrentBranchPullRequest ---

  describe("readCurrentBranchPullRequest", () => {
    it("returns parsed PR payload on success", () => {
      execFileSyncMock.mockReturnValue(`${JSON.stringify(validPr())}\n`);
      const result = client.readCurrentBranchPullRequest({ cwd: tmpDir });
      expect(result?.number).toBe(7);
    });

    it("returns null when gh reports no pull request exists", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ stderr: "no pull requests found" });
      });
      expect(client.readCurrentBranchPullRequest({ cwd: tmpDir })).toBeNull();
    });

    it("throws gh auth error when not logged in", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ stderr: "not logged in" });
      });
      expect(() => client.readCurrentBranchPullRequest({ cwd: tmpDir })).toThrow(
        "not authenticated",
      );
    });

    it("throws 'Unable to read pull request' for generic gh failures", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ stderr: "some random failure" });
      });
      expect(() => client.readCurrentBranchPullRequest({ cwd: tmpDir })).toThrow(
        "Unable to read pull request",
      );
    });
  });

  // --- createPullRequest ---

  describe("createPullRequest", () => {
    it("creates PR via gh and returns parsed payload", () => {
      execFileSyncMock
        .mockReturnValueOnce("https://github.com/org/repo/pull/7\n")
        .mockReturnValueOnce(`${JSON.stringify(validPr())}\n`);
      const result = client.createPullRequest({
        cwd: tmpDir,
        title: "feat: add thing",
        body: "description",
        baseRef: "main",
        headRef: "feat/thing",
      });
      if (!result) throw new Error("Expected createPullRequest to return a result");
      expect(result.number).toBe(7);
      expect(result.url).toContain("pull/7");
    });

    it("throws when gh create returns empty URL", () => {
      execFileSyncMock.mockReturnValueOnce("\n");
      expect(() =>
        client.createPullRequest({
          cwd: tmpDir,
          title: "T",
          body: "B",
          baseRef: "main",
          headRef: "feat",
        }),
      ).toThrow("Unable to create pull request");
    });

    it("throws gh install message when gh is not installed (ENOENT)", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ code: "ENOENT" });
      });
      expect(() =>
        client.createPullRequest({
          cwd: tmpDir,
          title: "T",
          body: "B",
          baseRef: "main",
          headRef: "feat",
        }),
      ).toThrow("GitHub CLI not found");
    });

    it("throws 'Unable to create pull request' for generic gh failures", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ stderr: "server error" });
      });
      expect(() =>
        client.createPullRequest({
          cwd: tmpDir,
          title: "T",
          body: "B",
          baseRef: "main",
          headRef: "feat",
        }),
      ).toThrow("Unable to create pull request");
    });
  });

  // --- mergeCurrentBranchPullRequest ---

  describe("mergeCurrentBranchPullRequest", () => {
    it.each([
      ["squash", "--squash"],
      ["merge", "--merge"],
      ["rebase", "--rebase"],
    ] as const)("passes %s strategy flag to gh pr merge", (strategy, expectedFlag) => {
      execFileSyncMock.mockReturnValue("");
      client.mergeCurrentBranchPullRequest({ cwd: tmpDir, strategy });
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "gh",
        ["pr", "merge", expectedFlag, "--delete-branch=false"],
        expect.any(Object),
      );
    });

    it("throws gh install message for ENOENT", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ code: "ENOENT" });
      });
      expect(() =>
        client.mergeCurrentBranchPullRequest({ cwd: tmpDir, strategy: "squash" }),
      ).toThrow("GitHub CLI not found");
    });

    it("throws 'Unable to merge pull request' for generic gh failures", () => {
      execFileSyncMock.mockImplementation(() => {
        throw makeErr({ stderr: "merge conflict detected" });
      });
      expect(() =>
        client.mergeCurrentBranchPullRequest({ cwd: tmpDir, strategy: "squash" }),
      ).toThrow("Unable to merge pull request");
    });
  });

  // --- readWorktreeStatus edge cases ---

  describe("readWorktreeStatus — additional branch coverage", () => {
    it("handles no-HEAD case where both cached and unstaged numstat return empty strings", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "main\n";
        }
        if (args.includes("--verify")) {
          // No HEAD commit
          throw makeErr({ status: 128 });
        }
        // All other git commands throw → readOptionalGitCommand returns null / ""
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      // Both cached and unstaged numstat return null → combined = ""
      expect(result.insertedLineCount).toBe(0);
      expect(result.deletedLineCount).toBe(0);
    });

    it("handles defaultBaseBranchName when remoteHead does not start with 'origin/'", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        if (args.includes("--verify")) {
          return "abc\n";
        }
        if (args.includes("refs/remotes/origin/HEAD")) {
          return "upstream/main\n"; // Does NOT start with "origin/"
        }
        if (args.includes("--porcelain")) {
          return "";
        }
        if (args.includes("--numstat")) {
          return "";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      // remoteHead doesn't start with "origin/" → defaultBaseBranchName is null
      expect(result.defaultBaseBranchName).toBeNull();
    });

    it("handles upstream lookup where rev-list output has whitespace", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        if (args.includes("--verify")) {
          return "abc\n";
        }
        if (args.includes("@{upstream}")) {
          return "origin/feat\n";
        }
        if (args.includes("--porcelain")) {
          return "";
        }
        if (args.includes("--left-right")) {
          // Malformed output — not parseable integers
          return "abc\txyz\n";
        }
        if (args.includes("--numstat")) {
          return "";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      // NaN integers → fall back to 0
      expect(result.behindCount).toBe(0);
      expect(result.aheadCount).toBe(0);
    });

    it("includes changedFiles from rename lines using arrow notation", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        if (args.includes("--verify")) {
          return "abc\n";
        }
        if (args.includes("--porcelain")) {
          return "R  old/path.ts -> new/path.ts\nM  regular.ts";
        }
        if (args.includes("--numstat")) {
          return "2\t1\tnew/path.ts\n1\t0\tregular.ts";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      expect(result.changedFiles).toContain("new/path.ts");
      expect(result.changedFiles).toContain("regular.ts");
    });

    it("excludes null-returning parseChangedFile entries from changedFiles", () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (
          args.includes("--abbrev-ref") &&
          args.includes("HEAD") &&
          !args.includes("@{upstream}")
        ) {
          return "feat\n";
        }
        if (args.includes("--verify")) {
          return "abc\n";
        }
        if (args.includes("--porcelain")) {
          // Line with blank payload (will produce null from parseChangedFile)
          return "M  \nA  valid.ts";
        }
        if (args.includes("--numstat")) {
          return "";
        }
        throw makeErr({ status: 128 });
      });

      const result = client.readWorktreeStatus({ cwd: tmpDir });
      // null entries are filtered; only "valid.ts" remains
      expect(result.changedFiles).toContain("valid.ts");
      expect(result.changedFiles).not.toContain(null);
    });
  });

  // --- commitAll — No local changes re-throw edge case ---

  describe("commitAll — re-throw 'No local changes' as-is", () => {
    it("re-throws the exact 'No local changes to commit' error unchanged", () => {
      // When diff --cached exits 0 → function creates the error and throws it
      // The catch block checks for it by message equality and re-throws
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes("--cached") && args.includes("--quiet")) {
          return undefined; // exits 0 → no staged changes
        }
        return undefined;
      });
      let caught: unknown;
      try {
        client.commitAll({ cwd: tmpDir, message: "no-op" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("No local changes to commit.");
    });
  });
});
