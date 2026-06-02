import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApiServer } from "../../src/createApiServer";
import type { GitClient } from "../../src/terminalRuntime";

export class FakeGitClient implements GitClient {
  private readonly worktreeStatusByCwd = new Map<
    string,
    {
      branchName: string;
      upstreamBranchName: string | null;
      isDirty: boolean;
      aheadCount: number;
      behindCount: number;
      insertedLineCount: number;
      deletedLineCount: number;
      hasConflicts: boolean;
      changedFiles: string[];
      defaultBaseBranchName: string | null;
    }
  >();
  private readonly commitsByCwd = new Map<string, string[]>();
  private readonly pushesByCwd = new Map<string, number>();
  private readonly syncsByCwd = new Map<string, string[]>();
  private readonly pullRequestByCwd = new Map<
    string,
    {
      number: number;
      url: string;
      title: string;
      baseRef: string;
      headRef: string;
      state: "OPEN" | "MERGED" | "CLOSED";
      isDraft: boolean;
      mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
      mergeStateStatus: string | null;
    } | null
  >();
  private readonly worktrees = new Map<
    string,
    { branchName: string; baseRef: string; cwd: string }
  >();
  private readonly branches = new Set<string>();
  private repositoryAvailable = true;
  private failRemoveWorktree = false;
  private failCommit = false;
  private failPush = false;
  private failSync = false;
  private failCreatePullRequest = false;
  private failMergePullRequest = false;

  assertAvailable(): void {}

  isRepository(): boolean {
    return this.repositoryAvailable;
  }

  addWorktree({
    cwd,
    path,
    branchName,
    baseRef,
  }: {
    cwd: string;
    path: string;
    branchName: string;
    baseRef: string;
  }): void {
    if (this.worktrees.has(path)) {
      throw new Error(`Worktree already exists: ${path}`);
    }
    mkdirSync(path, { recursive: true });
    this.branches.add(branchName);
    this.worktrees.set(path, { cwd, branchName, baseRef });
    this.worktreeStatusByCwd.set(path, {
      branchName,
      upstreamBranchName: null,
      isDirty: false,
      aheadCount: 0,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
      changedFiles: [],
      defaultBaseBranchName: "main",
    });
    this.pullRequestByCwd.set(path, null);
  }

  removeWorktree({ path }: { cwd: string; path: string }): void {
    if (this.failRemoveWorktree) {
      throw new Error(`Unable to remove worktree: ${path}`);
    }
    this.worktrees.delete(path);
    this.worktreeStatusByCwd.delete(path);
    this.commitsByCwd.delete(path);
    this.pushesByCwd.delete(path);
    this.syncsByCwd.delete(path);
    this.pullRequestByCwd.delete(path);
  }

  removeBranch({ branchName }: { cwd: string; branchName: string }): void {
    this.branches.delete(branchName);
  }

  setRepositoryAvailable(available: boolean): void {
    this.repositoryAvailable = available;
  }

  setFailRemoveWorktree(shouldFail: boolean): void {
    this.failRemoveWorktree = shouldFail;
  }

  setFailCommit(shouldFail: boolean): void {
    this.failCommit = shouldFail;
  }

  setFailPush(shouldFail: boolean): void {
    this.failPush = shouldFail;
  }

  setFailSync(shouldFail: boolean): void {
    this.failSync = shouldFail;
  }

  setFailCreatePullRequest(shouldFail: boolean): void {
    this.failCreatePullRequest = shouldFail;
  }

  setFailMergePullRequest(shouldFail: boolean): void {
    this.failMergePullRequest = shouldFail;
  }

  setWorktreeStatus(
    cwd: string,
    status: {
      branchName: string;
      upstreamBranchName: string | null;
      isDirty: boolean;
      aheadCount: number;
      behindCount: number;
      insertedLineCount: number;
      deletedLineCount: number;
      hasConflicts: boolean;
      changedFiles: string[];
      defaultBaseBranchName: string | null;
    },
  ): void {
    this.worktreeStatusByCwd.set(cwd, status);
  }

  readWorktreeStatus({
    cwd,
  }: {
    cwd: string;
  }): {
    branchName: string;
    upstreamBranchName: string | null;
    isDirty: boolean;
    aheadCount: number;
    behindCount: number;
    insertedLineCount: number;
    deletedLineCount: number;
    hasConflicts: boolean;
    changedFiles: string[];
    defaultBaseBranchName: string | null;
  } {
    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }
    return {
      ...status,
      changedFiles: [...status.changedFiles],
    };
  }

  commitAll({ cwd, message }: { cwd: string; message: string }): void {
    if (this.failCommit) {
      throw new Error("Simulated commit failure");
    }

    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }
    if (!status.isDirty) {
      throw new Error("No local changes to commit.");
    }

    const commits = this.commitsByCwd.get(cwd) ?? [];
    commits.push(message);
    this.commitsByCwd.set(cwd, commits);
    this.worktreeStatusByCwd.set(cwd, {
      ...status,
      isDirty: false,
      changedFiles: [],
      aheadCount: status.aheadCount + 1,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
    });
  }

  pushCurrentBranch({ cwd }: { cwd: string }): void {
    if (this.failPush) {
      throw new Error("Simulated push failure");
    }

    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }

    this.pushesByCwd.set(cwd, (this.pushesByCwd.get(cwd) ?? 0) + 1);
    this.worktreeStatusByCwd.set(cwd, {
      ...status,
      upstreamBranchName: status.upstreamBranchName ?? `origin/${status.branchName}`,
      aheadCount: 0,
    });
  }

  syncWithBase({ cwd, baseRef }: { cwd: string; baseRef: string }): void {
    if (this.failSync) {
      throw new Error("Simulated sync failure");
    }

    const status = this.worktreeStatusByCwd.get(cwd);
    if (!status) {
      throw new Error(`Missing fake status for ${cwd}`);
    }
    const syncs = this.syncsByCwd.get(cwd) ?? [];
    syncs.push(baseRef);
    this.syncsByCwd.set(cwd, syncs);
    this.worktreeStatusByCwd.set(cwd, {
      ...status,
      behindCount: 0,
      insertedLineCount: 0,
      deletedLineCount: 0,
      hasConflicts: false,
    });
  }

  setWorktreePullRequest(
    cwd: string,
    pullRequest: {
      number: number;
      url: string;
      title: string;
      baseRef: string;
      headRef: string;
      state: "OPEN" | "MERGED" | "CLOSED";
      isDraft: boolean;
      mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
      mergeStateStatus: string | null;
    } | null,
  ): void {
    this.pullRequestByCwd.set(cwd, pullRequest);
  }

  readCurrentBranchPullRequest({
    cwd,
  }: {
    cwd: string;
  }): {
    number: number;
    url: string;
    title: string;
    baseRef: string;
    headRef: string;
    state: "OPEN" | "MERGED" | "CLOSED";
    isDraft: boolean;
    mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
    mergeStateStatus: string | null;
  } | null {
    const pullRequest = this.pullRequestByCwd.get(cwd);
    if (pullRequest === undefined || pullRequest === null) {
      return null;
    }

    return {
      ...pullRequest,
    };
  }

  createPullRequest({
    cwd,
    title,
    baseRef,
    headRef,
  }: {
    cwd: string;
    title: string;
    body: string;
    baseRef: string;
    headRef: string;
  }): {
    number: number;
    url: string;
    title: string;
    baseRef: string;
    headRef: string;
    state: "OPEN" | "MERGED" | "CLOSED";
    isDraft: boolean;
    mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
    mergeStateStatus: string | null;
  } | null {
    if (this.failCreatePullRequest) {
      throw new Error("Simulated create PR failure");
    }

    const nextNumber = (this.pullRequestByCwd.get(cwd)?.number ?? 100) + 1;
    const pullRequest = {
      number: nextNumber,
      url: `https://github.com/josephg29/sentiph/pull/${nextNumber}`,
      title,
      baseRef,
      headRef,
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE" as const,
      mergeStateStatus: "CLEAN",
    };
    this.pullRequestByCwd.set(cwd, pullRequest);
    return pullRequest;
  }

  mergeCurrentBranchPullRequest({
    cwd,
  }: {
    cwd: string;
    strategy: "squash" | "merge" | "rebase";
  }): void {
    if (this.failMergePullRequest) {
      throw new Error("Simulated merge PR failure");
    }

    const pullRequest = this.pullRequestByCwd.get(cwd);
    if (!pullRequest) {
      throw new Error("No open pull request for this branch.");
    }

    this.pullRequestByCwd.set(cwd, {
      ...pullRequest,
      state: "MERGED",
      mergeable: "UNKNOWN",
      mergeStateStatus: "MERGED",
    });
  }

  getWorktree(path: string): { branchName: string; baseRef: string; cwd: string } | null {
    return this.worktrees.get(path) ?? null;
  }

  hasBranch(branchName: string): boolean {
    return this.branches.has(branchName);
  }

  getLastCommitMessage(cwd: string): string | null {
    const commits = this.commitsByCwd.get(cwd);
    if (!commits || commits.length === 0) {
      return null;
    }
    return commits[commits.length - 1] ?? null;
  }

  getPushCount(cwd: string): number {
    return this.pushesByCwd.get(cwd) ?? 0;
  }

  getSyncBaseRefs(cwd: string): string[] {
    return [...(this.syncsByCwd.get(cwd) ?? [])];
  }

  getPullRequestState(cwd: string): "OPEN" | "MERGED" | "CLOSED" | null {
    return this.pullRequestByCwd.get(cwd)?.state ?? null;
  }
}

interface ServerHarness {
  temporaryDirectories: string[];
  stopServer: (() => Promise<void>) | null;
  startServer: (options?: Partial<Parameters<typeof createApiServer>[0]>) => Promise<string>;
  toWebSocketBaseUrl: (httpBaseUrl: string) => string;
  waitForRegistryDocument: <TDocument>(
    workspaceCwd: string,
    predicate: (document: TDocument) => boolean,
  ) => Promise<TDocument>;
  writeConversationTranscript: (workspaceCwd: string, sessionId: string, events: unknown[]) => void;
  writeClaudeTurns: (
    workspaceCwd: string,
    sessionId: string,
    turns: Array<{
      turnId: string;
      role: string;
      content: string;
      startedAt: string;
      endedAt: string;
    }>,
  ) => void;
}

function createServerHarness(): ServerHarness {
  const temporaryDirectories: string[] = [];
  let stopServer: (() => Promise<void>) | null = null;

  const startServer = async (
    options: Partial<Parameters<typeof createApiServer>[0]> = {},
  ): Promise<string> => {
    const workspaceCwd =
      options.workspaceCwd ??
      (() => {
        const directory = mkdtempSync(join(tmpdir(), "sentiph-api-test-"));
        temporaryDirectories.push(directory);
        return directory;
      })();
    const apiServer = createApiServer({
      workspaceCwd,
      gitClient: options.gitClient ?? new FakeGitClient(),
      ...options,
    });
    const address = await apiServer.start(0, "127.0.0.1");
    stopServer = () => apiServer.stop();
    return `http://${address.host}:${address.port}`;
  };

  const toWebSocketBaseUrl = (httpBaseUrl: string) =>
    httpBaseUrl.startsWith("https://")
      ? httpBaseUrl.replace("https://", "wss://")
      : httpBaseUrl.replace("http://", "ws://");

  const waitForRegistryDocument = async <TDocument>(
    workspaceCwd: string,
    predicate: (document: TDocument) => boolean,
  ): Promise<TDocument> => {
    const registryPath = join(workspaceCwd, ".sentiph", "state", "tentacles.json");
    const timeoutAt = Date.now() + 2_000;

    while (Date.now() < timeoutAt) {
      if (existsSync(registryPath)) {
        try {
          const document = JSON.parse(readFileSync(registryPath, "utf8")) as TDocument;
          if (predicate(document)) {
            return document;
          }
        } catch {
          // The registry may be mid-write; retry on the next tick.
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    throw new Error(`Timed out waiting for registry persistence at ${registryPath}`);
  };

  const writeConversationTranscript = (
    workspaceCwd: string,
    sessionId: string,
    events: unknown[],
  ) => {
    const transcriptDirectory = join(workspaceCwd, ".sentiph", "state", "transcripts");
    mkdirSync(transcriptDirectory, { recursive: true });
    const transcriptPath = join(transcriptDirectory, `${encodeURIComponent(sessionId)}.jsonl`);
    writeFileSync(
      transcriptPath,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
  };

  const writeClaudeTurns = (
    workspaceCwd: string,
    sessionId: string,
    turns: Array<{
      turnId: string;
      role: string;
      content: string;
      startedAt: string;
      endedAt: string;
    }>,
  ) => {
    const transcriptDirectory = join(workspaceCwd, ".sentiph", "state", "transcripts");
    mkdirSync(transcriptDirectory, { recursive: true });
    const turnsPath = join(
      transcriptDirectory,
      `${encodeURIComponent(sessionId)}.claude-turns.json`,
    );
    writeFileSync(turnsPath, JSON.stringify(turns), "utf8");
  };

  return {
    get temporaryDirectories() {
      return temporaryDirectories;
    },
    get stopServer() {
      return stopServer;
    },
    set stopServer(value) {
      stopServer = value;
    },
    startServer,
    toWebSocketBaseUrl,
    waitForRegistryDocument,
    writeConversationTranscript,
    writeClaudeTurns,
  };
}

export function setupServerHarness() {
  const harness = createServerHarness();

  return {
    get temporaryDirectories() {
      return harness.temporaryDirectories;
    },
    get stopServer() {
      return harness.stopServer;
    },
    set stopServer(value) {
      harness.stopServer = value;
    },
    startServer: harness.startServer,
    toWebSocketBaseUrl: harness.toWebSocketBaseUrl,
    waitForRegistryDocument: harness.waitForRegistryDocument,
    writeConversationTranscript: harness.writeConversationTranscript,
    writeClaudeTurns: harness.writeClaudeTurns,
    async teardown() {
      if (harness.stopServer) {
        await harness.stopServer();
        harness.stopServer = null;
      }
      for (const directory of harness.temporaryDirectories) {
        rmSync(directory, { recursive: true, force: true });
      }
      harness.temporaryDirectories.length = 0;
    },
  };
}
