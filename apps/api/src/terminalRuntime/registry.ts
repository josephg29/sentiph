import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { TENTACLE_REGISTRY_VERSION } from "./constants";
import { parseTentacleNumber } from "./ids";
import { toErrorMessage } from "./systemClients";
import type {
  PersistedTentacle,
  PersistedUiState,
  TentacleRegistryDocument,
  TentacleWorkspaceMode,
} from "./types";
import { isTentacleCompletionSound } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parsePersistedUiState = (value: unknown): PersistedUiState => {
  if (!isRecord(value)) {
    return {};
  }

  const nextState: PersistedUiState = {};

  if (typeof value.isAgentsSidebarVisible === "boolean") {
    nextState.isAgentsSidebarVisible = value.isAgentsSidebarVisible;
  }

  if (typeof value.sidebarWidth === "number" && Number.isFinite(value.sidebarWidth)) {
    nextState.sidebarWidth = value.sidebarWidth;
  }

  if (typeof value.isActiveAgentsSectionExpanded === "boolean") {
    nextState.isActiveAgentsSectionExpanded = value.isActiveAgentsSectionExpanded;
  }

  if (typeof value.isCodexUsageSectionExpanded === "boolean") {
    nextState.isCodexUsageSectionExpanded = value.isCodexUsageSectionExpanded;
  }

  if (isTentacleCompletionSound(value.tentacleCompletionSound)) {
    nextState.tentacleCompletionSound = value.tentacleCompletionSound;
  }

  if (Array.isArray(value.minimizedTentacleIds)) {
    const minimizedTentacleIds = value.minimizedTentacleIds.filter(
      (tentacleId): tentacleId is string => typeof tentacleId === "string",
    );
    nextState.minimizedTentacleIds = [...new Set(minimizedTentacleIds)];
  }

  if (isRecord(value.tentacleWidths)) {
    const tentacleWidths = Object.entries(value.tentacleWidths).reduce<Record<string, number>>(
      (acc, [tentacleId, width]) => {
        if (typeof width === "number" && Number.isFinite(width)) {
          acc[tentacleId] = width;
        }
        return acc;
      },
      {},
    );
    nextState.tentacleWidths = tentacleWidths;
  }

  return nextState;
};

export const pruneUiStateTentacleReferences = (
  uiState: PersistedUiState,
  tentacles: Map<string, PersistedTentacle>,
): PersistedUiState => {
  const activeTentacleIds = new Set(tentacles.keys());
  const nextState: PersistedUiState = {
    ...uiState,
  };

  if (nextState.minimizedTentacleIds) {
    nextState.minimizedTentacleIds = nextState.minimizedTentacleIds.filter((tentacleId) =>
      activeTentacleIds.has(tentacleId),
    );
  }

  if (nextState.tentacleWidths) {
    nextState.tentacleWidths = Object.entries(nextState.tentacleWidths).reduce<
      Record<string, number>
    >((acc, [tentacleId, width]) => {
      if (activeTentacleIds.has(tentacleId)) {
        acc[tentacleId] = width;
      }
      return acc;
    }, {});
  }

  return nextState;
};

export const parseRegistryDocument = (
  raw: string,
  registryPath: string,
): {
  tentacles: Map<string, PersistedTentacle>;
  uiState: PersistedUiState;
} => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid tentacle registry JSON (${registryPath}): ${toErrorMessage(error)}`);
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Invalid tentacle registry shape (${registryPath}).`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== 1 && record.version !== TENTACLE_REGISTRY_VERSION) {
    throw new Error(
      `Unsupported tentacle registry version in ${registryPath}: ${String(record.version)}`,
    );
  }

  const rawTentacles = record.tentacles;
  if (!Array.isArray(rawTentacles)) {
    throw new Error(`Invalid tentacle registry tentacles array (${registryPath}).`);
  }

  const tentacles = new Map<string, PersistedTentacle>();
  for (const item of rawTentacles) {
    if (item === null || typeof item !== "object") {
      throw new Error(`Invalid tentacle entry in registry (${registryPath}).`);
    }

    const entry = item as Record<string, unknown>;
    const tentacleId = typeof entry.tentacleId === "string" ? entry.tentacleId : null;
    const tentacleName = typeof entry.tentacleName === "string" ? entry.tentacleName : null;
    const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : null;

    if (!tentacleId || !tentacleName || !createdAt) {
      throw new Error(`Incomplete tentacle entry in registry (${registryPath}).`);
    }

    const rawWorkspaceMode = entry.workspaceMode;
    const workspaceMode: TentacleWorkspaceMode =
      rawWorkspaceMode === "worktree" || rawWorkspaceMode === "shared"
        ? rawWorkspaceMode
        : "shared";

    const tentacleNumber = parseTentacleNumber(tentacleId);
    if (tentacleNumber === null) {
      throw new Error(`Invalid tentacle id in registry (${registryPath}): ${tentacleId}`);
    }

    if (tentacles.has(tentacleId)) {
      throw new Error(`Duplicate tentacle id in registry (${registryPath}): ${tentacleId}`);
    }

    tentacles.set(tentacleId, {
      tentacleId,
      tentacleName,
      createdAt,
      workspaceMode,
    });
  }

  return {
    tentacles,
    uiState: pruneUiStateTentacleReferences(parsePersistedUiState(record.uiState), tentacles),
  };
};

export const loadTentacleRegistry = (registryPath: string) => {
  if (!existsSync(registryPath)) {
    return {
      tentacles: new Map<string, PersistedTentacle>(),
      uiState: {} as PersistedUiState,
    };
  }

  const raw = readFileSync(registryPath, "utf8");
  return parseRegistryDocument(raw, registryPath);
};

export const persistTentacleRegistry = (
  registryPath: string,
  state: {
    tentacles: Map<string, PersistedTentacle>;
    uiState: PersistedUiState;
  },
) => {
  const document: TentacleRegistryDocument = {
    version: TENTACLE_REGISTRY_VERSION,
    tentacles: [...state.tentacles.values()],
    uiState: state.uiState,
  };

  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
};
