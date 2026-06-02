import { describe, expect, it, vi } from "vitest";

import { createGitOps } from "../src/terminalRuntime/gitOps";
import type { GitClient, PersistedTerminal } from "../src/terminalRuntime/types";
import { RuntimeInputError } from "../src/terminalRuntime/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

const worktreesDir = "/fake/worktrees";

const makeTerminal = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "worktree",
  ...overrides,
});

const makeWorktreeStatus = () => ({
  branchName: "feat/demo",
  upstreamBranchName: "origin/feat/demo",
  isDirty: false,
  aheadCount: 1,
  behindCount: 0,
  insertedLineCount: 10,
  deletedLineCount: 2,
  hasConflicts: false,
  changedFiles: ["src/a.ts"],
  defaultBaseBranchName: "main",
});

const makePr = (state: "OPEN" | "MERGED" | "CLOSED" = "OPEN") => ({
  number: 42,
  url: "https://github.com/org/repo/pull/42",
  title: "My PR",
  baseRef: "main",
  headRef: "feat/demo",
  state,
  isDraft: false,
  mergeable: "MERGEABLE" as const,
  mergeStateStatus: null,
});

const makeGitClient = (overrides: Partial<GitClient> = {}): GitClient => ({
  assertAvailable: vi.fn(),
  isRepository: vi.fn(() => true),
  addWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  removeBranch: vi.fn(),
  readWorktreeStatus: vi.fn(() => makeWorktreeStatus()),
  commitAll: vi.fn(),
  pushCurrentBranch: vi.fn(),
  syncWithBase: vi.fn(),
  readCurrentBranchPullRequest: vi.fn(() => null),
  createPullRequest: vi.fn(() => makePr("OPEN")),
  mergeCurrentBranchPullRequest: vi.fn(),
  ...overrides,
});

const makeOps = (terminals: PersistedTerminal[], gitClient?: GitClient | null) => {
  const map = new Map(terminals.map((t) => [t.terminalId, t]));
  // When gitClient is not supplied at all (undefined via default), use a real client.
  // When null is passed explicitly, treat as no client (undefined).
  const gc = gitClient === null ? undefined : (gitClient ?? makeGitClient());
  return createGitOps({ terminals: map, worktreesDir, gitClient: gc });
};

// ─── readTentacleGitStatus ────────────────────────────────────────────────────

describe("readTentacleGitStatus", () => {
  it("returns null when no terminal matches the tentacleId", () => {
    const ops = makeOps([]);
    expect(ops.readTentacleGitStatus("nonexistent")).toBeNull();
  });

  it("returns null when terminal is shared mode (not worktree)", () => {
    const ops = makeOps([makeTerminal({ workspaceMode: "shared" })]);
    expect(() => ops.readTentacleGitStatus("t1")).toThrow(RuntimeInputError);
  });

  it("returns null when gitClient is undefined", () => {
    const ops = makeOps([makeTerminal()], null);
    expect(ops.readTentacleGitStatus("t1")).toBeNull();
  });

  it("returns status snapshot for a valid worktree terminal", () => {
    const ops = makeOps([makeTerminal()]);
    const result = ops.readTentacleGitStatus("t1");
    expect(result).not.toBeNull();
    expect(result?.tentacleId).toBe("t1");
    expect(result?.workspaceMode).toBe("worktree");
    expect(result?.branchName).toBe("feat/demo");
  });

  it("uses worktreeId when set", () => {
    const gc = makeGitClient();
    const ops = makeOps([makeTerminal({ worktreeId: "custom-wt" })], gc);
    ops.readTentacleGitStatus("t1");
    const callArg = (gc.readWorktreeStatus as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      cwd: string;
    };
    expect(callArg.cwd).toContain("custom-wt");
  });
});

// ─── commitTentacleWorktree ───────────────────────────────────────────────────

describe("commitTentacleWorktree", () => {
  it("returns null when no terminal matches", () => {
    const ops = makeOps([]);
    expect(ops.commitTentacleWorktree("nope", "msg")).toBeNull();
  });

  it("throws RuntimeInputError for shared mode terminal", () => {
    const ops = makeOps([makeTerminal({ workspaceMode: "shared" })]);
    expect(() => ops.commitTentacleWorktree("t1", "msg")).toThrow(RuntimeInputError);
  });

  it("returns null when gitClient is undefined", () => {
    const ops = makeOps([makeTerminal()], null);
    expect(ops.commitTentacleWorktree("t1", "msg")).toBeNull();
  });

  it("calls gitClient.commitAll with the correct message", () => {
    const gc = makeGitClient();
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.commitTentacleWorktree("t1", "fix: my commit");
    expect(gc.commitAll).toHaveBeenCalledWith(
      expect.objectContaining({ message: "fix: my commit" }),
    );
    expect(result?.tentacleId).toBe("t1");
  });
});

// ─── pushTentacleWorktree ─────────────────────────────────────────────────────

describe("pushTentacleWorktree", () => {
  it("returns null when no terminal matches", () => {
    const ops = makeOps([]);
    expect(ops.pushTentacleWorktree("nope")).toBeNull();
  });

  it("returns null when gitClient is undefined", () => {
    const ops = makeOps([makeTerminal()], null);
    expect(ops.pushTentacleWorktree("t1")).toBeNull();
  });

  it("calls pushCurrentBranch and returns status snapshot", () => {
    const gc = makeGitClient();
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.pushTentacleWorktree("t1");
    expect(gc.pushCurrentBranch).toHaveBeenCalledOnce();
    expect(result?.workspaceMode).toBe("worktree");
  });
});

// ─── syncTentacleWorktree ─────────────────────────────────────────────────────

describe("syncTentacleWorktree", () => {
  it("returns null when no terminal matches", () => {
    const ops = makeOps([]);
    expect(ops.syncTentacleWorktree("nope")).toBeNull();
  });

  it("calls syncWithBase with provided baseRef", () => {
    const gc = makeGitClient();
    const ops = makeOps([makeTerminal()], gc);
    ops.syncTentacleWorktree("t1", "origin/main");
    expect(gc.syncWithBase).toHaveBeenCalledWith(
      expect.objectContaining({ baseRef: "origin/main" }),
    );
  });

  it("defaults baseRef to HEAD when not provided", () => {
    const gc = makeGitClient();
    const ops = makeOps([makeTerminal()], gc);
    ops.syncTentacleWorktree("t1");
    expect(gc.syncWithBase).toHaveBeenCalledWith(expect.objectContaining({ baseRef: "HEAD" }));
  });
});

// ─── readTentaclePullRequest ──────────────────────────────────────────────────

describe("readTentaclePullRequest", () => {
  it("returns null when no terminal matches", () => {
    const ops = makeOps([]);
    expect(ops.readTentaclePullRequest("nope")).toBeNull();
  });

  it("returns empty object when no PR exists", () => {
    const gc = makeGitClient({ readCurrentBranchPullRequest: vi.fn(() => null) });
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.readTentaclePullRequest("t1");
    expect(result).toEqual({ tentacleId: "t1", workspaceMode: "worktree" });
  });

  it("returns PR snapshot with status field lowercased", () => {
    const gc = makeGitClient({ readCurrentBranchPullRequest: vi.fn(() => makePr("MERGED")) });
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.readTentaclePullRequest("t1");
    if (!result || !("status" in result)) throw new Error("Expected PR snapshot");
    expect(result.status).toBe("merged");
    expect(result.number).toBe(42);
  });
});

// ─── createTentaclePullRequest ────────────────────────────────────────────────

describe("createTentaclePullRequest", () => {
  it("returns null when no terminal matches", () => {
    const ops = makeOps([]);
    expect(ops.createTentaclePullRequest("nope", {})).toBeNull();
  });

  it("throws RuntimeInputError when open PR already exists", () => {
    const gc = makeGitClient({ readCurrentBranchPullRequest: vi.fn(() => makePr("OPEN")) });
    const ops = makeOps([makeTerminal()], gc);
    expect(() => ops.createTentaclePullRequest("t1", { title: "T", body: "B" })).toThrow(
      RuntimeInputError,
    );
  });

  it("creates PR when no existing PR is open", () => {
    const gc = makeGitClient({
      readCurrentBranchPullRequest: vi.fn(() => null),
      createPullRequest: vi.fn(() => makePr("OPEN")),
    });
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.createTentaclePullRequest("t1", { title: "My PR", body: "desc" });
    expect(gc.createPullRequest).toHaveBeenCalledOnce();
    expect(result?.status).toBe("open");
  });

  it("returns null when createPullRequest returns null", () => {
    const gc = makeGitClient({
      readCurrentBranchPullRequest: vi.fn(() => null),
      createPullRequest: vi.fn(() => null),
    });
    const ops = makeOps([makeTerminal()], gc);
    expect(ops.createTentaclePullRequest("t1", {})).toBeNull();
  });

  it("uses defaultBaseBranchName from worktree status when baseRef is not provided", () => {
    const gc = makeGitClient({
      readCurrentBranchPullRequest: vi.fn(() => null),
      createPullRequest: vi.fn(() => makePr("OPEN")),
    });
    const ops = makeOps([makeTerminal()], gc);
    ops.createTentaclePullRequest("t1", {});
    expect(gc.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ baseRef: "main" }));
  });

  it("allows creating PR when existing PR is already merged", () => {
    const gc = makeGitClient({
      readCurrentBranchPullRequest: vi.fn(() => makePr("MERGED")),
      createPullRequest: vi.fn(() => makePr("OPEN")),
    });
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.createTentaclePullRequest("t1", {});
    expect(result?.status).toBe("open");
  });
});

// ─── mergeTentaclePullRequest ─────────────────────────────────────────────────

describe("mergeTentaclePullRequest", () => {
  it("returns null when no terminal matches", () => {
    const ops = makeOps([]);
    expect(ops.mergeTentaclePullRequest("nope")).toBeNull();
  });

  it("throws RuntimeInputError when no open PR exists", () => {
    const gc = makeGitClient({ readCurrentBranchPullRequest: vi.fn(() => null) });
    const ops = makeOps([makeTerminal()], gc);
    expect(() => ops.mergeTentaclePullRequest("t1")).toThrow(RuntimeInputError);
  });

  it("throws RuntimeInputError when existing PR is already merged", () => {
    const gc = makeGitClient({ readCurrentBranchPullRequest: vi.fn(() => makePr("MERGED")) });
    const ops = makeOps([makeTerminal()], gc);
    expect(() => ops.mergeTentaclePullRequest("t1")).toThrow(RuntimeInputError);
  });

  it("merges the PR and returns updated snapshot", () => {
    const mergedPr = makePr("MERGED");
    const gc = makeGitClient({
      readCurrentBranchPullRequest: vi
        .fn()
        .mockReturnValueOnce(makePr("OPEN"))
        .mockReturnValueOnce(mergedPr),
      mergeCurrentBranchPullRequest: vi.fn(),
    });
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.mergeTentaclePullRequest("t1");
    expect(gc.mergeCurrentBranchPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "squash" }),
    );
    if (!result || !("status" in result)) throw new Error("Expected PR snapshot");
    expect(result.status).toBe("merged");
  });

  it("returns base snapshot when post-merge PR read returns null", () => {
    const gc = makeGitClient({
      readCurrentBranchPullRequest: vi
        .fn()
        .mockReturnValueOnce(makePr("OPEN"))
        .mockReturnValueOnce(null),
      mergeCurrentBranchPullRequest: vi.fn(),
    });
    const ops = makeOps([makeTerminal()], gc);
    const result = ops.mergeTentaclePullRequest("t1");
    expect(result).toEqual({ tentacleId: "t1", workspaceMode: "worktree" });
  });
});
