import type { IncomingMessage } from "node:http";

import type { MonitorConfigPatchInput } from "../monitor";
import type { PersistedUiState, TentacleWorkspaceMode } from "../terminalRuntime";

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {}

export const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  let totalBytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const nextChunk = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += nextChunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new RequestBodyTooLargeError("Request body too large.");
    }
    chunks.push(nextChunk);
  }

  const payload = Buffer.concat(chunks).toString("utf8").trim();
  if (payload.length === 0) {
    return null;
  }

  return JSON.parse(payload);
};

export const parseTentacleName = (payload: unknown) => {
  if (payload === null || payload === undefined) {
    return {
      provided: false,
      name: undefined as string | undefined,
      error: null as string | null,
    };
  }

  if (typeof payload !== "object") {
    return {
      provided: true,
      name: undefined as string | undefined,
      error: "Expected a JSON object body.",
    };
  }

  const rawName = (payload as Record<string, unknown>).name;
  if (rawName === undefined) {
    return {
      provided: false,
      name: undefined as string | undefined,
      error: null as string | null,
    };
  }

  if (typeof rawName !== "string") {
    return {
      provided: true,
      name: undefined as string | undefined,
      error: "Tentacle name must be a string.",
    };
  }

  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return {
      provided: true,
      name: undefined as string | undefined,
      error: "Tentacle name cannot be empty.",
    };
  }

  return {
    provided: true,
    name: trimmed,
    error: null as string | null,
  };
};

export const parseTentacleWorkspaceMode = (payload: unknown) => {
  if (payload === null || payload === undefined) {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: null as string | null,
    };
  }

  if (typeof payload !== "object") {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: "Expected a JSON object body.",
    };
  }

  const rawWorkspaceMode = (payload as Record<string, unknown>).workspaceMode;
  if (rawWorkspaceMode === undefined) {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: null as string | null,
    };
  }

  if (rawWorkspaceMode !== "shared" && rawWorkspaceMode !== "worktree") {
    return {
      workspaceMode: "shared" as TentacleWorkspaceMode,
      error: "Tentacle workspace mode must be either 'shared' or 'worktree'.",
    };
  }

  return {
    workspaceMode: rawWorkspaceMode as TentacleWorkspaceMode,
    error: null as string | null,
  };
};

export const parseUiStatePatch = (
  payload: unknown,
): { patch: PersistedUiState | null; error: string | null } => {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return {
      patch: null,
      error: "Expected a JSON object body.",
    };
  }

  const record = payload as Record<string, unknown>;
  const patch: PersistedUiState = {};

  if (record.isAgentsSidebarVisible !== undefined) {
    if (typeof record.isAgentsSidebarVisible !== "boolean") {
      return {
        patch: null,
        error: "isAgentsSidebarVisible must be a boolean.",
      };
    }
    patch.isAgentsSidebarVisible = record.isAgentsSidebarVisible;
  }

  if (record.sidebarWidth !== undefined) {
    if (typeof record.sidebarWidth !== "number" || !Number.isFinite(record.sidebarWidth)) {
      return {
        patch: null,
        error: "sidebarWidth must be a finite number.",
      };
    }
    patch.sidebarWidth = record.sidebarWidth;
  }

  if (record.isActiveAgentsSectionExpanded !== undefined) {
    if (typeof record.isActiveAgentsSectionExpanded !== "boolean") {
      return {
        patch: null,
        error: "isActiveAgentsSectionExpanded must be a boolean.",
      };
    }
    patch.isActiveAgentsSectionExpanded = record.isActiveAgentsSectionExpanded;
  }

  if (record.isCodexUsageSectionExpanded !== undefined) {
    if (typeof record.isCodexUsageSectionExpanded !== "boolean") {
      return {
        patch: null,
        error: "isCodexUsageSectionExpanded must be a boolean.",
      };
    }
    patch.isCodexUsageSectionExpanded = record.isCodexUsageSectionExpanded;
  }

  if (record.minimizedTentacleIds !== undefined) {
    if (!Array.isArray(record.minimizedTentacleIds)) {
      return {
        patch: null,
        error: "minimizedTentacleIds must be an array of strings.",
      };
    }

    const minimizedTentacleIds = record.minimizedTentacleIds.filter(
      (tentacleId): tentacleId is string => typeof tentacleId === "string",
    );
    if (minimizedTentacleIds.length !== record.minimizedTentacleIds.length) {
      return {
        patch: null,
        error: "minimizedTentacleIds must be an array of strings.",
      };
    }
    patch.minimizedTentacleIds = [...new Set(minimizedTentacleIds)];
  }

  if (record.tentacleWidths !== undefined) {
    if (
      record.tentacleWidths === null ||
      typeof record.tentacleWidths !== "object" ||
      Array.isArray(record.tentacleWidths)
    ) {
      return {
        patch: null,
        error: "tentacleWidths must be an object map of numbers.",
      };
    }

    const tentacleWidths = Object.entries(record.tentacleWidths).reduce<Record<string, number>>(
      (acc, [tentacleId, width]) => {
        if (typeof width === "number" && Number.isFinite(width)) {
          acc[tentacleId] = width;
        }
        return acc;
      },
      {},
    );
    if (Object.keys(tentacleWidths).length !== Object.keys(record.tentacleWidths).length) {
      return {
        patch: null,
        error: "tentacleWidths must be an object map of numbers.",
      };
    }
    patch.tentacleWidths = tentacleWidths;
  }

  return { patch, error: null };
};

export const parseMonitorConfigPatch = (
  payload: unknown,
): { patch: MonitorConfigPatchInput | null; error: string | null } => {
  if (payload === null || payload === undefined || typeof payload !== "object") {
    return {
      patch: null,
      error: "Expected a JSON object body.",
    };
  }

  const record = payload as Record<string, unknown>;
  const patch: MonitorConfigPatchInput = {};

  if (record.providerId !== undefined) {
    if (record.providerId !== "x") {
      return {
        patch: null,
        error: "providerId must be 'x'.",
      };
    }

    patch.providerId = "x";
  }

  if (record.queryTerms !== undefined) {
    if (!Array.isArray(record.queryTerms)) {
      return {
        patch: null,
        error: "queryTerms must be an array of strings.",
      };
    }

    const queryTerms = record.queryTerms.filter((term): term is string => typeof term === "string");
    if (queryTerms.length !== record.queryTerms.length) {
      return {
        patch: null,
        error: "queryTerms must be an array of strings.",
      };
    }

    patch.queryTerms = queryTerms;
  }

  if (record.refreshPolicy !== undefined) {
    if (
      record.refreshPolicy === null ||
      typeof record.refreshPolicy !== "object" ||
      Array.isArray(record.refreshPolicy)
    ) {
      return {
        patch: null,
        error: "refreshPolicy must be an object.",
      };
    }

    const refreshPolicyRecord = record.refreshPolicy as Record<string, unknown>;
    if (
      refreshPolicyRecord.maxCacheAgeMs !== undefined &&
      (typeof refreshPolicyRecord.maxCacheAgeMs !== "number" ||
        !Number.isFinite(refreshPolicyRecord.maxCacheAgeMs) ||
        refreshPolicyRecord.maxCacheAgeMs <= 0)
    ) {
      return {
        patch: null,
        error: "refreshPolicy.maxCacheAgeMs must be a positive number.",
      };
    }

    if (
      refreshPolicyRecord.maxPosts !== undefined &&
      (typeof refreshPolicyRecord.maxPosts !== "number" ||
        !Number.isFinite(refreshPolicyRecord.maxPosts) ||
        refreshPolicyRecord.maxPosts <= 0)
    ) {
      return {
        patch: null,
        error: "refreshPolicy.maxPosts must be a positive number.",
      };
    }

    if (
      refreshPolicyRecord.searchWindowDays !== undefined &&
      (typeof refreshPolicyRecord.searchWindowDays !== "number" ||
        !Number.isFinite(refreshPolicyRecord.searchWindowDays) ||
        ![1, 3, 7].includes(Math.floor(refreshPolicyRecord.searchWindowDays)))
    ) {
      return {
        patch: null,
        error: "refreshPolicy.searchWindowDays must be one of: 1, 3, 7.",
      };
    }

    patch.refreshPolicy = {};
    if (refreshPolicyRecord.maxCacheAgeMs !== undefined) {
      patch.refreshPolicy.maxCacheAgeMs = refreshPolicyRecord.maxCacheAgeMs;
    }
    if (refreshPolicyRecord.maxPosts !== undefined) {
      patch.refreshPolicy.maxPosts = refreshPolicyRecord.maxPosts;
    }
    if (refreshPolicyRecord.searchWindowDays !== undefined) {
      patch.refreshPolicy.searchWindowDays = Math.floor(refreshPolicyRecord.searchWindowDays) as
        | 1
        | 3
        | 7;
    }
  }

  if (record.credentials !== undefined) {
    if (record.credentials === null || typeof record.credentials !== "object" || Array.isArray(record.credentials)) {
      return {
        patch: null,
        error: "credentials must be an object.",
      };
    }

    patch.credentials = record.credentials;
  }

  if (record.validateCredentials !== undefined) {
    if (typeof record.validateCredentials !== "boolean") {
      return {
        patch: null,
        error: "validateCredentials must be a boolean.",
      };
    }

    patch.validateCredentials = record.validateCredentials;
  }

  return { patch, error: null };
};
