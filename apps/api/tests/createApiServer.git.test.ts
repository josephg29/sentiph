import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

import { FakeGitClient, setupServerHarness } from "./helpers/createApiServerHarness";

describe("createApiServer", () => {
  const h = setupServerHarness();

  afterEach(async () => {
    await h.teardown();
  });

  it("creates isolated worktree terminals with dedicated cwd", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "planner",
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual(
      expect.objectContaining({
        tentacleId: "terminal-1",
        tentacleName: "planner",
        workspaceMode: "worktree",
      }),
    );

    const expectedWorktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    expect(gitClient.getWorktree(expectedWorktreePath)).toEqual(
      expect.objectContaining({
        cwd: workspaceCwd,
        branchName: "sentiph/terminal-1",
        baseRef: "HEAD",
      }),
    );

    const registryDocument = await h.waitForRegistryDocument<{
      terminals: Array<{
        terminalId: string;
        tentacleId: string;
        workspaceMode: "shared" | "worktree";
      }>;
    }>(workspaceCwd, (document) =>
      document.terminals.some(
        (terminal) =>
          terminal.terminalId === "terminal-1" &&
          terminal.tentacleId === "terminal-1" &&
          terminal.workspaceMode === "worktree",
      ),
    );
    expect(registryDocument.terminals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
          workspaceMode: "worktree",
        }),
      ]),
    );
  });

  it("returns git status for worktree tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: true,
      aheadCount: 2,
      behindCount: 1,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: ["apps/web/src/App.tsx", "README.md"],
      defaultBaseBranchName: "main",
    });

    const statusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: true,
      aheadCount: 2,
      behindCount: 1,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: ["apps/web/src/App.tsx", "README.md"],
      defaultBaseBranchName: "main",
    });
  });

  it("returns 409 for git status on shared tentacles", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const statusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(statusResponse.status).toBe(409);
    await expect(statusResponse.json()).resolves.toEqual({
      error: "Git lifecycle actions are only available for worktree terminals.",
    });
  });

  it("commits pending worktree changes with a required message", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: true,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: ["apps/web/src/App.tsx"],
      defaultBaseBranchName: "main",
    });

    const commitResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/commit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "feat: add worktree git actions",
      }),
    });
    expect(commitResponse.status).toBe(200);
    expect(gitClient.getLastCommitMessage(worktreePath)).toBe("feat: add worktree git actions");
    await expect(commitResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: false,
      aheadCount: 1,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
  });

  it("returns 400 for commit when message is empty", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    const commitResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/commit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "   ",
      }),
    });
    expect(commitResponse.status).toBe(400);
    expect(gitClient.getLastCommitMessage(worktreePath)).toBeNull();
    await expect(commitResponse.json()).resolves.toEqual({
      error: "Commit message cannot be empty.",
    });
  });

  it("pushes worktree branch and updates ahead count", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "sentiph/terminal-1",
      upstreamBranchName: null,
      isDirty: false,
      aheadCount: 3,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });

    const pushResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/push`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(pushResponse.status).toBe(200);
    expect(gitClient.getPushCount(worktreePath)).toBe(1);
    await expect(pushResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
  });

  it("syncs worktree branch with base ref", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 4,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });

    const syncResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseRef: "main",
      }),
    });
    expect(syncResponse.status).toBe(200);
    expect(gitClient.getSyncBaseRefs(worktreePath)).toEqual(["main"]);
    await expect(syncResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
  });

  it("returns PR status for worktree tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreePullRequest(worktreePath, {
      number: 142,
      url: "https://github.com/josephg29/sentiph/pull/142",
      title: "feat: worktree git lifecycle menu",
      baseRef: "main",
      headRef: "sentiph/terminal-1",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const prStatusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(prStatusResponse.status).toBe(200);
    await expect(prStatusResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      status: "open",
      number: 142,
      url: "https://github.com/josephg29/sentiph/pull/142",
      title: "feat: worktree git lifecycle menu",
      baseRef: "main",
      headRef: "sentiph/terminal-1",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });
  });

  it("creates PR for worktree tentacles and returns PR snapshot", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });

    const createPrResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "feat: expose worktree lifecycle actions",
        body: "Adds PR controls in the tentacle header.",
        baseRef: "main",
      }),
    });
    expect(createPrResponse.status).toBe(200);
    await expect(createPrResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      status: "open",
      number: 101,
      url: "https://github.com/josephg29/sentiph/pull/101",
      title: "feat: expose worktree lifecycle actions",
      baseRef: "main",
      headRef: "sentiph/terminal-1",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });
  });

  it("returns 409 when creating a PR and an open PR already exists for the branch", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreeStatus(worktreePath, {
      branchName: "sentiph/terminal-1",
      upstreamBranchName: "origin/sentiph/terminal-1",
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
    gitClient.setWorktreePullRequest(worktreePath, {
      number: 142,
      url: "https://github.com/josephg29/sentiph/pull/142",
      title: "feat: existing worktree lifecycle PR",
      baseRef: "main",
      headRef: "sentiph/terminal-1",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const createPrResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "feat: should not create duplicate PR",
        body: "Should fail because the branch already has an open PR.",
        baseRef: "main",
      }),
    });
    expect(createPrResponse.status).toBe(409);
    await expect(createPrResponse.json()).resolves.toEqual({
      error: "An open pull request already exists for this branch.",
    });

    expect(gitClient.getPullRequestState(worktreePath)).toBe("OPEN");
  });

  it("merges the current branch PR for worktree tentacles", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const worktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setWorktreePullRequest(worktreePath, {
      number: 190,
      url: "https://github.com/josephg29/sentiph/pull/190",
      title: "feat: ship worktree lifecycle",
      baseRef: "main",
      headRef: "sentiph/terminal-1",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    const mergeResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr/merge`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(mergeResponse.status).toBe(200);
    expect(gitClient.getPullRequestState(worktreePath)).toBe("MERGED");
    await expect(mergeResponse.json()).resolves.toEqual({
      tentacleId: "terminal-1",
      workspaceMode: "worktree",
      status: "merged",
      number: 190,
      url: "https://github.com/josephg29/sentiph/pull/190",
      title: "feat: ship worktree lifecycle",
      baseRef: "main",
      headRef: "sentiph/terminal-1",
      isDraft: false,
      mergeable: "UNKNOWN",
      mergeStateStatus: "MERGED",
    });
  });

  it("returns 409 for PR actions on shared tentacles", async () => {
    const baseUrl = await h.startServer();

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    expect(createResponse.status).toBe(201);

    const prStatusResponse = await fetch(`${baseUrl}/api/tentacles/terminal-1/git/pr`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(prStatusResponse.status).toBe(409);
    await expect(prStatusResponse.json()).resolves.toEqual({
      error: "Git lifecycle actions are only available for worktree terminals.",
    });
  });

  it("removes isolated worktree metadata when deleting a worktree tentacle", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const expectedWorktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    expect(gitClient.getWorktree(expectedWorktreePath)).toEqual(
      expect.objectContaining({
        cwd: workspaceCwd,
        branchName: "sentiph/terminal-1",
      }),
    );

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(204);
    expect(gitClient.getWorktree(expectedWorktreePath)).toBeNull();
    expect(gitClient.hasBranch("sentiph/terminal-1")).toBe(false);
  });

  it("returns 409 and keeps tentacle state when worktree deletion fails", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(201);

    const expectedWorktreePath = join(workspaceCwd, ".sentiph", "worktrees", "terminal-1");
    gitClient.setFailRemoveWorktree(true);

    const deleteResponse = await fetch(`${baseUrl}/api/terminals/terminal-1`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    expect(deleteResponse.status).toBe(409);
    await expect(deleteResponse.json()).resolves.toEqual({
      error: expect.stringContaining("Unable to remove worktree for terminal-1"),
    });
    expect(gitClient.getWorktree(expectedWorktreePath)).toEqual(
      expect.objectContaining({
        cwd: workspaceCwd,
        branchName: "sentiph/terminal-1",
      }),
    );

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminalId: "terminal-1",
          tentacleId: "terminal-1",
        }),
      ]),
    );
  });

  it("returns 400 when creating worktree tentacle outside a git repository", async () => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
    h.temporaryDirectories.push(workspaceCwd);
    const gitClient = new FakeGitClient();
    gitClient.setRepositoryAvailable(false);
    const baseUrl = await h.startServer({
      workspaceCwd,
      gitClient,
    });

    const createResponse = await fetch(`${baseUrl}/api/terminals`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceMode: "worktree",
      }),
    });
    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toEqual({
      error: "Worktree terminals require a git repository at the workspace root.",
    });

    const listResponse = await fetch(`${baseUrl}/api/terminal-snapshots`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([]);
  });
});
