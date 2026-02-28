import type { IncomingMessage } from "node:http";

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
