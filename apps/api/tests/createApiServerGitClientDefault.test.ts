/**
 * Regression test: createApiServer must give the terminal runtime a real git
 * client when the caller (the CLI) does not inject one. Without this, worktree
 * terminals silently failed with "Worktree terminals require a git repository".
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { defaultGitClient, createDefaultGitClientMock } = vi.hoisted(() => {
  const defaultGitClient = {
    assertAvailable: vi.fn(),
    isRepository: vi.fn(() => true),
    addWorktree: vi.fn(),
    removeWorktree: vi.fn(),
    removeBranch: vi.fn(),
    readWorktreeStatus: vi.fn(),
    commitAll: vi.fn(),
    pushCurrentBranch: vi.fn(),
    syncWithBase: vi.fn(),
    readCurrentBranchPullRequest: vi.fn(() => null),
    createPullRequest: vi.fn(() => null),
    mergeCurrentBranchPullRequest: vi.fn(),
  };
  return {
    defaultGitClient,
    createDefaultGitClientMock: vi.fn(() => defaultGitClient),
  };
});

vi.mock("../src/terminalRuntime/systemClients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/terminalRuntime/systemClients")>();
  return { ...actual, createDefaultGitClient: createDefaultGitClientMock };
});

import { createApiServer } from "../src/createApiServer";

let workspaceCwd: string;
let projectStateDir: string;

beforeEach(() => {
  workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-gitdefault-cwd-"));
  projectStateDir = mkdtempSync(join(tmpdir(), "sentiph-gitdefault-state-"));
  createDefaultGitClientMock.mockClear();
});

afterEach(() => {
  rmSync(workspaceCwd, { recursive: true, force: true });
  rmSync(projectStateDir, { recursive: true, force: true });
});

describe("createApiServer git client defaulting", () => {
  it("uses createDefaultGitClient when no gitClient is injected", () => {
    createApiServer({ workspaceCwd, projectStateDir });
    expect(createDefaultGitClientMock).toHaveBeenCalledTimes(1);
  });

  it("does not call createDefaultGitClient when a gitClient is injected", () => {
    createApiServer({ workspaceCwd, projectStateDir, gitClient: defaultGitClient });
    expect(createDefaultGitClientMock).not.toHaveBeenCalled();
  });
});
