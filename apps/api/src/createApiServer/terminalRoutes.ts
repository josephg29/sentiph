import {
  RuntimeInputError,
  type TentacleWorkspaceMode,
  type TerminalAgentProvider,
  type TerminalEffort,
  type TerminalModel,
  type TerminalNameOrigin,
} from "../terminalRuntime";
import type { ApiRouteHandler } from "./routeHelpers";
import {
  readJsonBodyOrWriteError,
  writeJson,
  writeMethodNotAllowed,
  writeNoContent,
  writeText,
} from "./routeHelpers";
import {
  parseTerminalAgentProvider,
  parseTerminalColor,
  parseTerminalEffort,
  parseTerminalModel,
  parseTerminalName,
  parseTerminalNameOrigin,
  parseTerminalWorkspaceMode,
} from "./terminalParsers";

export const handleTerminalSnapshotsRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/terminal-snapshots") {
    return false;
  }

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const payload = runtime.listTerminalSnapshots();
  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleTerminalsCollectionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/terminals") {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const nameResult = parseTerminalName(bodyReadResult.payload);
  if (nameResult.error) {
    writeJson(response, 400, { error: nameResult.error }, corsOrigin);
    return true;
  }

  const workspaceModeResult = parseTerminalWorkspaceMode(bodyReadResult.payload);
  if (workspaceModeResult.error) {
    writeJson(response, 400, { error: workspaceModeResult.error }, corsOrigin);
    return true;
  }

  const agentProviderResult = parseTerminalAgentProvider(bodyReadResult.payload);
  if (agentProviderResult.error) {
    writeJson(response, 400, { error: agentProviderResult.error }, corsOrigin);
    return true;
  }

  const nameOriginResult = parseTerminalNameOrigin(bodyReadResult.payload);
  if (nameOriginResult.error) {
    writeJson(response, 400, { error: nameOriginResult.error }, corsOrigin);
    return true;
  }

  const colorResult = parseTerminalColor(bodyReadResult.payload);
  if (colorResult.error) {
    writeJson(response, 400, { error: colorResult.error }, corsOrigin);
    return true;
  }

  const modelResult = parseTerminalModel(bodyReadResult.payload);
  if (modelResult.error) {
    writeJson(response, 400, { error: modelResult.error }, corsOrigin);
    return true;
  }

  const effortResult = parseTerminalEffort(bodyReadResult.payload);
  if (effortResult.error) {
    writeJson(response, 400, { error: effortResult.error }, corsOrigin);
    return true;
  }

  try {
    const createTerminalInput: {
      terminalId?: string;
      tentacleId?: string;
      worktreeId?: string;
      tentacleName?: string;
      color?: string;
      workspaceMode: TentacleWorkspaceMode;
      agentProvider?: TerminalAgentProvider;
      nameOrigin?: TerminalNameOrigin;
      initialPrompt?: string;
      initialInputDraft?: string;
      autoRenamePromptContext?: string;
      parentTerminalId?: string;
      isGroupLeader?: boolean;
      model?: TerminalModel;
      effort?: TerminalEffort;
    } = {
      workspaceMode: workspaceModeResult.workspaceMode,
    };
    if (modelResult.model !== undefined) {
      createTerminalInput.model = modelResult.model;
    }
    if (effortResult.effort !== undefined) {
      createTerminalInput.effort = effortResult.effort;
    }
    if (nameResult.name !== undefined) {
      createTerminalInput.tentacleName = nameResult.name;
    }
    if (agentProviderResult.agentProvider !== undefined) {
      createTerminalInput.agentProvider = agentProviderResult.agentProvider;
    }
    if (nameOriginResult.nameOrigin !== undefined) {
      createTerminalInput.nameOrigin = nameOriginResult.nameOrigin;
    }
    if (colorResult.color !== undefined) {
      createTerminalInput.color = colorResult.color;
    }
    const bodyPayload = bodyReadResult.payload as Record<string, unknown> | null;
    if (
      bodyPayload &&
      typeof bodyPayload.terminalId === "string" &&
      bodyPayload.terminalId.trim().length > 0
    ) {
      createTerminalInput.terminalId = bodyPayload.terminalId.trim();
    }
    if (
      bodyPayload &&
      typeof bodyPayload.tentacleId === "string" &&
      bodyPayload.tentacleId.trim().length > 0
    ) {
      const tentacleId = bodyPayload.tentacleId.trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tentacleId)) {
        writeJson(
          response,
          400,
          { error: "tentacleId may only contain letters, digits, hyphens, and underscores (max 128 chars)." },
          corsOrigin,
        );
        return true;
      }
      createTerminalInput.tentacleId = tentacleId;
    }
    if (
      bodyPayload &&
      typeof bodyPayload.parentTerminalId === "string" &&
      bodyPayload.parentTerminalId.trim().length > 0
    ) {
      createTerminalInput.parentTerminalId = bodyPayload.parentTerminalId.trim();
    }
    if (
      bodyPayload &&
      typeof bodyPayload.autoRenamePromptContext === "string" &&
      bodyPayload.autoRenamePromptContext.trim().length > 0
    ) {
      createTerminalInput.autoRenamePromptContext = bodyPayload.autoRenamePromptContext.trim();
    }
    if (
      bodyPayload &&
      typeof bodyPayload.worktreeId === "string" &&
      bodyPayload.worktreeId.trim().length > 0
    ) {
      const worktreeId = bodyPayload.worktreeId.trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(worktreeId)) {
        writeJson(
          response,
          400,
          { error: "worktreeId may only contain letters, digits, hyphens, and underscores (max 128 chars)." },
          corsOrigin,
        );
        return true;
      }
      createTerminalInput.worktreeId = worktreeId;
    }

    const MAX_PROMPT_LENGTH = 65_536;
    if (
      bodyPayload &&
      typeof bodyPayload.initialPrompt === "string" &&
      bodyPayload.initialPrompt.trim().length > 0
    ) {
      if (bodyPayload.initialPrompt.length > MAX_PROMPT_LENGTH) {
        writeJson(response, 400, { error: "initialPrompt exceeds maximum allowed length." }, corsOrigin);
        return true;
      }
      createTerminalInput.initialPrompt = bodyPayload.initialPrompt.trim();
    }

    if (
      bodyPayload &&
      typeof bodyPayload.initialInputDraft === "string" &&
      bodyPayload.initialInputDraft.trim().length > 0
    ) {
      if (bodyPayload.initialInputDraft.length > MAX_PROMPT_LENGTH) {
        writeJson(response, 400, { error: "initialInputDraft exceeds maximum allowed length." }, corsOrigin);
        return true;
      }
      createTerminalInput.initialInputDraft = bodyPayload.initialInputDraft.trim();
    }

    if (bodyPayload && bodyPayload.isGroupLeader === true) {
      createTerminalInput.isGroupLeader = true;
    }

    const snapshot = runtime.createTerminal(createTerminalInput);
    const payload: Record<string, unknown> = { ...snapshot };
    if (createTerminalInput.initialPrompt) {
      payload.initialPrompt = createTerminalInput.initialPrompt;
    }
    writeJson(response, 201, payload, corsOrigin);
    return true;
  } catch (error) {
    if (error instanceof RuntimeInputError) {
      writeJson(response, 400, { error: error.message }, corsOrigin);
      return true;
    }

    throw error;
  }
};

const TERMINAL_SCROLLBACK_PATH_PATTERN = /^\/api\/terminals\/([^/]+)\/scrollback$/;

export const handleTerminalScrollbackRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const match = requestUrl.pathname.match(TERMINAL_SCROLLBACK_PATH_PATTERN);
  if (!match) return false;

  if (request.method !== "GET") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(match[1] ?? "");
  const scrollback = runtime.getScrollback(terminalId);
  if (scrollback === null) {
    writeJson(response, 404, { error: "Terminal not found or not active." }, corsOrigin);
    return true;
  }

  writeText(response, 200, scrollback, "text/plain; charset=utf-8", corsOrigin);
  return true;
};

const TERMINAL_ITEM_PATH_PATTERN = /^\/api\/terminals\/([^/]+)$/;
const TERMINAL_ACTION_PATH_PATTERN = /^\/api\/terminals\/([^/]+)\/(stop|kill)$/;

export const handleTerminalItemRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const renameMatch = requestUrl.pathname.match(TERMINAL_ITEM_PATH_PATTERN);
  if (!renameMatch) {
    return false;
  }

  if (request.method !== "PATCH" && request.method !== "DELETE") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(renameMatch[1] ?? "");
  if (request.method === "DELETE") {
    try {
      runtime.deleteTerminal(terminalId);
      writeNoContent(response, 204, corsOrigin);
      return true;
    } catch (error) {
      if (error instanceof RuntimeInputError) {
        writeJson(response, 409, { error: error.message }, corsOrigin);
        return true;
      }
      throw error;
    }
  }

  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const nameResult = parseTerminalName(bodyReadResult.payload);
  if (nameResult.error) {
    writeJson(response, 400, { error: nameResult.error }, corsOrigin);
    return true;
  }

  if (!nameResult.provided || !nameResult.name) {
    writeJson(response, 400, { error: "Terminal name is required." }, corsOrigin);
    return true;
  }

  const payload = runtime.renameTerminal(terminalId, nameResult.name);
  if (!payload) {
    writeJson(response, 404, { error: "Terminal not found." }, corsOrigin);
    return true;
  }

  writeJson(response, 200, payload, corsOrigin);
  return true;
};

export const handleTerminalActionRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const actionMatch = requestUrl.pathname.match(TERMINAL_ACTION_PATH_PATTERN);
  if (!actionMatch) {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(actionMatch[1] ?? "");
  const action = actionMatch[2];
  const snapshot =
    action === "kill" ? runtime.killTerminal(terminalId) : runtime.stopTerminal(terminalId);
  if (!snapshot) {
    writeJson(response, 404, { error: "Terminal not found." }, corsOrigin);
    return true;
  }

  writeJson(response, 200, snapshot, corsOrigin);
  return true;
};

const TERMINAL_INPUT_PATH_PATTERN = /^\/api\/terminals\/([^/]+)\/input$/;

export const handleTerminalInputRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  const match = requestUrl.pathname.match(TERMINAL_INPUT_PATH_PATTERN);
  if (!match) return false;

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  const terminalId = decodeURIComponent(match[1] ?? "");
  const bodyReadResult = await readJsonBodyOrWriteError(request, response, corsOrigin);
  if (!bodyReadResult.ok) {
    return true;
  }

  const bodyPayload = bodyReadResult.payload as Record<string, unknown> | null;
  const inputData = bodyPayload && typeof bodyPayload.data === "string" ? bodyPayload.data : null;
  if (!inputData || !inputData.trim()) {
    writeJson(response, 400, { error: "data is required" }, corsOrigin);
    return true;
  }

  const ok = runtime.writeInput(terminalId, inputData);
  if (!ok) {
    writeJson(response, 404, { error: "Terminal not found or not active." }, corsOrigin);
    return true;
  }

  writeJson(response, 200, { ok: true }, corsOrigin);
  return true;
};

export const handleTerminalPruneRoute: ApiRouteHandler = async (
  { request, response, requestUrl, corsOrigin },
  { runtime },
) => {
  if (requestUrl.pathname !== "/api/terminals/prune") {
    return false;
  }

  if (request.method !== "POST") {
    writeMethodNotAllowed(response, corsOrigin);
    return true;
  }

  writeJson(response, 200, { prunedTerminalIds: runtime.pruneTerminals() }, corsOrigin);
  return true;
};
