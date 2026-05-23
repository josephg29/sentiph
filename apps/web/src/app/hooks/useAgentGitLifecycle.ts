import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  buildTentacleGitCommitUrl,
  buildTentacleGitPullRequestMergeUrl,
  buildTentacleGitPullRequestUrl,
  buildTentacleGitPushUrl,
  buildTentacleGitStatusUrl,
  buildTentacleGitSyncUrl,
} from "../../runtime/runtimeEndpoints";
import type {
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  TerminalView,
} from "../types";

type UseAgentGitLifecycleOptions = {
  columns: TerminalView;
};

type UseAgentGitLifecycleResult = {
  gitStatusByAgentId: Record<string, TentacleGitStatusSnapshot>;
  gitStatusLoadingByAgentId: Record<string, boolean>;
  pullRequestByAgentId: Record<string, TentaclePullRequestSnapshot>;
  pullRequestLoadingByAgentId: Record<string, boolean>;
  openGitAgentId: string | null;
  openGitAgentStatus: TentacleGitStatusSnapshot | null;
  openGitAgentPullRequest: TentaclePullRequestSnapshot | null;
  gitCommitMessageDraft: string;
  gitDialogError: string | null;
  isGitDialogLoading: boolean;
  isGitDialogMutating: boolean;
  setGitCommitMessageDraft: Dispatch<SetStateAction<string>>;
  openAgentGitActions: (tentacleId: string) => void;
  closeAgentGitActions: () => void;
  commitAgentChanges: () => Promise<void>;
  commitAndPushAgentBranch: () => Promise<void>;
  pushAgentBranch: () => Promise<void>;
  syncAgentBranch: () => Promise<void>;
  mergeAgentPullRequest: () => Promise<void>;
};

const parseGitError = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
  } catch {
    return fallback;
  }

  return fallback;
};

const parseAgentGitStatus = (payload: unknown): TentacleGitStatusSnapshot | null => {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.tentacleId !== "string" ||
    (record.workspaceMode !== "shared" && record.workspaceMode !== "worktree") ||
    typeof record.branchName !== "string" ||
    (record.upstreamBranchName !== null && typeof record.upstreamBranchName !== "string") ||
    typeof record.isDirty !== "boolean" ||
    typeof record.aheadCount !== "number" ||
    typeof record.behindCount !== "number" ||
    typeof record.hasConflicts !== "boolean" ||
    !Array.isArray(record.changedFiles) ||
    !record.changedFiles.every((file) => typeof file === "string") ||
    (record.defaultBaseBranchName !== null && typeof record.defaultBaseBranchName !== "string")
  ) {
    return null;
  }

  return {
    tentacleId: record.tentacleId,
    workspaceMode: record.workspaceMode,
    branchName: record.branchName,
    upstreamBranchName: record.upstreamBranchName,
    isDirty: record.isDirty,
    aheadCount: record.aheadCount,
    behindCount: record.behindCount,
    insertedLineCount: typeof record.insertedLineCount === "number" ? record.insertedLineCount : 0,
    deletedLineCount: typeof record.deletedLineCount === "number" ? record.deletedLineCount : 0,
    hasConflicts: record.hasConflicts,
    changedFiles: [...record.changedFiles],
    defaultBaseBranchName: record.defaultBaseBranchName,
  };
};

const parseAgentPullRequest = (payload: unknown): TentaclePullRequestSnapshot | null => {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.tentacleId !== "string" ||
    (record.workspaceMode !== "shared" && record.workspaceMode !== "worktree") ||
    (record.status !== "none" &&
      record.status !== "open" &&
      record.status !== "merged" &&
      record.status !== "closed") ||
    (record.number !== null && typeof record.number !== "number") ||
    (record.url !== null && typeof record.url !== "string") ||
    (record.title !== null && typeof record.title !== "string") ||
    (record.baseRef !== null && typeof record.baseRef !== "string") ||
    (record.headRef !== null && typeof record.headRef !== "string") ||
    (record.isDraft !== null && typeof record.isDraft !== "boolean") ||
    (record.mergeable !== null &&
      record.mergeable !== "MERGEABLE" &&
      record.mergeable !== "CONFLICTING" &&
      record.mergeable !== "UNKNOWN") ||
    (record.mergeStateStatus !== null && typeof record.mergeStateStatus !== "string")
  ) {
    return null;
  }

  return {
    tentacleId: record.tentacleId,
    workspaceMode: record.workspaceMode,
    status: record.status,
    number: record.number,
    url: record.url,
    title: record.title,
    baseRef: record.baseRef,
    headRef: record.headRef,
    isDraft: record.isDraft,
    mergeable: record.mergeable,
    mergeStateStatus: record.mergeStateStatus,
  };
};

export const useAgentGitLifecycle = ({
  columns,
}: UseAgentGitLifecycleOptions): UseAgentGitLifecycleResult => {
  const [gitStatusByAgentId, setGitStatusByAgentId] = useState<
    Record<string, TentacleGitStatusSnapshot>
  >({});
  const [gitStatusLoadingByAgentId, setGitStatusLoadingByAgentId] = useState<
    Record<string, boolean>
  >({});
  const [gitStatusAttemptedAgentIds, setGitStatusAttemptedAgentIds] = useState<
    Record<string, boolean>
  >({});
  const [pullRequestByAgentId, setPullRequestByAgentId] = useState<
    Record<string, TentaclePullRequestSnapshot>
  >({});
  const [pullRequestLoadingByAgentId, setPullRequestLoadingByAgentId] = useState<
    Record<string, boolean>
  >({});
  const [pullRequestAttemptedAgentIds, setPullRequestAttemptedAgentIds] = useState<
    Record<string, boolean>
  >({});
  const [openGitAgentId, setOpenGitAgentId] = useState<string | null>(null);
  const [gitCommitMessageDraft, setGitCommitMessageDraft] = useState("");
  const [gitDialogError, setGitDialogError] = useState<string | null>(null);
  const [isGitDialogMutating, setIsGitDialogMutating] = useState(false);

  const fetchAgentGitStatus = useCallback(async (tentacleId: string) => {
    setGitStatusLoadingByAgentId((current) => ({
      ...current,
      [tentacleId]: true,
    }));

    try {
      const response = await fetch(buildTentacleGitStatusUrl(tentacleId), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const errorMessage = await parseGitError(
          response,
          `Unable to fetch git status (${response.status}).`,
        );
        throw new Error(errorMessage);
      }

      const payload = parseAgentGitStatus(await response.json());
      if (!payload) {
        throw new Error("Unable to parse git status response.");
      }

      setGitStatusByAgentId((current) => ({
        ...current,
        [tentacleId]: payload,
      }));
      return payload;
    } finally {
      setGitStatusLoadingByAgentId((current) => ({
        ...current,
        [tentacleId]: false,
      }));
    }
  }, []);

  const fetchAgentPullRequest = useCallback(async (tentacleId: string) => {
    setPullRequestLoadingByAgentId((current) => ({
      ...current,
      [tentacleId]: true,
    }));

    try {
      const response = await fetch(buildTentacleGitPullRequestUrl(tentacleId), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const errorMessage = await parseGitError(
          response,
          `Unable to fetch pull request status (${response.status}).`,
        );
        throw new Error(errorMessage);
      }

      const payload = parseAgentPullRequest(await response.json());
      if (!payload) {
        throw new Error("Unable to parse pull request response.");
      }

      setPullRequestByAgentId((current) => ({
        ...current,
        [tentacleId]: payload,
      }));
      return payload;
    } finally {
      setPullRequestLoadingByAgentId((current) => ({
        ...current,
        [tentacleId]: false,
      }));
    }
  }, []);

  const worktreeAgentIds = useMemo(
    () =>
      columns
        .filter((column) => column.workspaceMode === "worktree")
        .map((column) => column.tentacleId),
    [columns],
  );

  useEffect(() => {
    const activeAgentIds = new Set(columns.map((column) => column.tentacleId));
    setGitStatusByAgentId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([tentacleId]) => activeAgentIds.has(tentacleId)),
      ),
    );
    setGitStatusLoadingByAgentId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([tentacleId]) => activeAgentIds.has(tentacleId)),
      ),
    );
    setGitStatusAttemptedAgentIds((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([tentacleId]) => activeAgentIds.has(tentacleId)),
      ),
    );
    setPullRequestByAgentId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([tentacleId]) => activeAgentIds.has(tentacleId)),
      ),
    );
    setPullRequestLoadingByAgentId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([tentacleId]) => activeAgentIds.has(tentacleId)),
      ),
    );
    setPullRequestAttemptedAgentIds((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([tentacleId]) => activeAgentIds.has(tentacleId)),
      ),
    );
    if (openGitAgentId && !activeAgentIds.has(openGitAgentId)) {
      setOpenGitAgentId(null);
      setGitDialogError(null);
      setGitCommitMessageDraft("");
    }
  }, [columns, openGitAgentId]);

  useEffect(() => {
    for (const tentacleId of worktreeAgentIds) {
      if (gitStatusAttemptedAgentIds[tentacleId]) {
        continue;
      }

      setGitStatusAttemptedAgentIds((current) => ({
        ...current,
        [tentacleId]: true,
      }));
      void fetchAgentGitStatus(tentacleId).catch((error: unknown) => {
        console.warn(`[git] Failed to fetch status for tentacle ${tentacleId}:`, error);
      });
    }
  }, [fetchAgentGitStatus, gitStatusAttemptedAgentIds, worktreeAgentIds]);

  useEffect(() => {
    for (const tentacleId of worktreeAgentIds) {
      if (pullRequestAttemptedAgentIds[tentacleId]) {
        continue;
      }

      setPullRequestAttemptedAgentIds((current) => ({
        ...current,
        [tentacleId]: true,
      }));
      void fetchAgentPullRequest(tentacleId).catch((error: unknown) => {
        console.warn(`[git] Failed to fetch pull request for tentacle ${tentacleId}:`, error);
      });
    }
  }, [fetchAgentPullRequest, pullRequestAttemptedAgentIds, worktreeAgentIds]);

  const openAgentGitActions = useCallback(
    (tentacleId: string) => {
      setOpenGitAgentId(tentacleId);
      setGitDialogError(null);
      setGitCommitMessageDraft("");

      void Promise.all([
        fetchAgentGitStatus(tentacleId),
        fetchAgentPullRequest(tentacleId),
      ]).catch((error: unknown) => {
        setGitDialogError(
          error instanceof Error ? error.message : "Unable to fetch git lifecycle data.",
        );
      });
    },
    [fetchAgentGitStatus, fetchAgentPullRequest],
  );

  const closeAgentGitActions = useCallback(() => {
    setOpenGitAgentId(null);
    setGitDialogError(null);
    setGitCommitMessageDraft("");
  }, []);

  const runGitMutation = useCallback(
    async (
      action: "commit" | "push" | "sync",
      request: { body?: string; headers?: Record<string, string> } = {},
    ): Promise<TentacleGitStatusSnapshot | null> => {
      if (!openGitAgentId) {
        return null;
      }

      const endpoint =
        action === "commit"
          ? buildTentacleGitCommitUrl(openGitAgentId)
          : action === "push"
            ? buildTentacleGitPushUrl(openGitAgentId)
            : buildTentacleGitSyncUrl(openGitAgentId);

      setIsGitDialogMutating(true);
      setGitDialogError(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...request.headers,
          },
          body: request.body ?? null,
        });

        if (!response.ok) {
          const errorMessage = await parseGitError(
            response,
            `Unable to ${action} (${response.status}).`,
          );
          throw new Error(errorMessage);
        }

        const payload = parseAgentGitStatus(await response.json());
        if (!payload) {
          throw new Error("Unable to parse git lifecycle response.");
        }

        setGitStatusByAgentId((current) => ({
          ...current,
          [openGitAgentId]: payload,
        }));
        return payload;
      } catch (error) {
        setGitDialogError(
          error instanceof Error ? error.message : `Unable to ${action} tentacle worktree.`,
        );
        return null;
      } finally {
        setIsGitDialogMutating(false);
      }
    },
    [openGitAgentId],
  );

  const runPullRequestMutation = useCallback(
    async (request: { body?: string; headers?: Record<string, string> } = {}) => {
      if (!openGitAgentId) {
        return;
      }

      const endpoint = buildTentacleGitPullRequestMergeUrl(openGitAgentId);

      setIsGitDialogMutating(true);
      setGitDialogError(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...request.headers,
          },
          body: request.body ?? null,
        });

        if (!response.ok) {
          const errorMessage = await parseGitError(
            response,
            `Unable to merge pull request (${response.status}).`,
          );
          throw new Error(errorMessage);
        }

        const payload = parseAgentPullRequest(await response.json());
        if (!payload) {
          throw new Error("Unable to parse pull request response.");
        }

        setPullRequestByAgentId((current) => ({
          ...current,
          [openGitAgentId]: payload,
        }));
      } catch (error) {
        setGitDialogError(error instanceof Error ? error.message : "Unable to merge pull request.");
      } finally {
        setIsGitDialogMutating(false);
      }
    },
    [openGitAgentId],
  );

  const commitAgentChanges = useCallback(async () => {
    const message = gitCommitMessageDraft.trim();
    if (message.length === 0) {
      setGitDialogError("Commit message cannot be empty.");
      return;
    }

    const committed = await runGitMutation("commit", {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    if (committed) {
      setGitCommitMessageDraft("");
    }
  }, [gitCommitMessageDraft, runGitMutation]);

  const commitAndPushAgentBranch = useCallback(async () => {
    const message = gitCommitMessageDraft.trim();
    if (message.length === 0) {
      setGitDialogError("Commit message cannot be empty.");
      return;
    }

    const committed = await runGitMutation("commit", {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    if (!committed) {
      return;
    }
    setGitCommitMessageDraft("");
    await runGitMutation("push");
  }, [gitCommitMessageDraft, runGitMutation]);

  const pushAgentBranch = useCallback(async () => {
    await runGitMutation("push");
  }, [runGitMutation]);

  const syncAgentBranch = useCallback(async () => {
    await runGitMutation("sync");
  }, [runGitMutation]);

  const mergeAgentPullRequest = useCallback(async () => {
    await runPullRequestMutation();
  }, [runPullRequestMutation]);

  const openGitAgentStatus =
    openGitAgentId !== null ? (gitStatusByAgentId[openGitAgentId] ?? null) : null;
  const openGitAgentPullRequest =
    openGitAgentId !== null ? (pullRequestByAgentId[openGitAgentId] ?? null) : null;
  const isGitDialogLoading =
    openGitAgentId !== null
      ? (gitStatusLoadingByAgentId[openGitAgentId] ?? false) ||
        (pullRequestLoadingByAgentId[openGitAgentId] ?? false)
      : false;

  return {
    gitStatusByAgentId,
    gitStatusLoadingByAgentId,
    pullRequestByAgentId,
    pullRequestLoadingByAgentId,
    openGitAgentId,
    openGitAgentStatus,
    openGitAgentPullRequest,
    gitCommitMessageDraft,
    gitDialogError,
    isGitDialogLoading,
    isGitDialogMutating,
    setGitCommitMessageDraft,
    openAgentGitActions,
    closeAgentGitActions,
    commitAgentChanges,
    commitAndPushAgentBranch,
    pushAgentBranch,
    syncAgentBranch,
    mergeAgentPullRequest,
  };
};
