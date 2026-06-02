import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import type { TerminalSnapshot } from "@sentiph/core";

import { DEFAULT_AGENT_PROVIDER, SENTIPH_TENTACLE_ID, TERMINAL_ID_PREFIX } from "./constants";
import type {
  PersistedTerminal,
  TentacleWorkspaceMode,
  TerminalAgentProvider,
  TerminalEffort,
  TerminalModel,
  TerminalNameOrigin,
  TerminalSession,
} from "./types";
import { RuntimeInputError } from "./types";

const MAX_CHILDREN_PER_PARENT = 32;

// ---------------------------------------------------------------------------
// ID / name allocation
// ---------------------------------------------------------------------------

const allocateTerminalId = (
  terminals: Map<string, PersistedTerminal>,
  sessions: Map<string, TerminalSession>,
  hasTentacleWorktree: (id: string) => boolean,
): string => {
  // O(n) linear probe where n is the number of live terminals (small in practice;
  // the loop stops at the lowest free index, so it runs at most ~liveCount+1 times).
  // The `terminals`/`sessions` checks are O(1) Map lookups; `hasTentacleWorktree`
  // performs one existsSync per candidate, but the bounded iteration count keeps
  // total filesystem probes small, so the cost is acceptable as-is.
  let candidateNumber = 1;
  while (candidateNumber < Number.MAX_SAFE_INTEGER) {
    const candidateId = `${TERMINAL_ID_PREFIX}${candidateNumber}`;
    if (terminals.has(candidateId)) {
      candidateNumber += 1;
      continue;
    }

    if (sessions.has(candidateId)) {
      candidateNumber += 1;
      continue;
    }

    if (hasTentacleWorktree(candidateId)) {
      candidateNumber += 1;
      continue;
    }

    return candidateId;
  }

  throw new Error("Unable to allocate terminal id.");
};

const allocateDefaultTerminalName = (terminals: Map<string, PersistedTerminal>): string => {
  const usedNumbers = new Set<number>();
  const pattern = /^Agent (\d+)$/;
  for (const t of terminals.values()) {
    const match = pattern.exec(t.tentacleName);
    if (match) usedNumbers.add(Number(match[1]));
  }
  let n = 1;
  while (usedNumbers.has(n)) n++;
  return `Agent ${n}`;
};

// ---------------------------------------------------------------------------
// createTerminal
// ---------------------------------------------------------------------------

export type CreateTerminalContext = {
  terminals: Map<string, PersistedTerminal>;
  sessions: Map<string, TerminalSession>;
  stateDir: string;
  workspaceCwd: string;
  persistRegistry: () => void;
  broadcastTerminalEvent: (event: Record<string, unknown>) => void;
  toTerminalSnapshot: (terminal: PersistedTerminal) => TerminalSnapshot;
  hasTentacleWorktree: (id: string) => boolean;
  createTentacleWorktree: (id: string, baseRef?: string) => void;
  startSession: (terminalId: string) => boolean;
  getSessionCapacity: () => { active: number; max: number };
};

export type CreateTerminalParams = {
  terminalId?: string;
  tentacleId?: string;
  worktreeId?: string;
  tentacleName?: string;
  color?: string;
  workspaceMode?: TentacleWorkspaceMode;
  agentProvider?: TerminalAgentProvider;
  initialPrompt?: string;
  initialInputDraft?: string;
  baseRef?: string;
  parentTerminalId?: string;
  nameOrigin?: TerminalNameOrigin;
  autoRenamePromptContext?: string;
  isGroupLeader?: boolean;
  model?: TerminalModel;
  effort?: TerminalEffort;
};

export const createTerminal = (
  params: CreateTerminalParams,
  ctx: CreateTerminalContext,
): TerminalSnapshot => {
  const {
    terminalId: requestedTerminalId,
    tentacleId: requestedTentacleId,
    worktreeId: requestedWorktreeId,
    tentacleName,
    color,
    workspaceMode = "shared",
    agentProvider,
    baseRef,
    parentTerminalId,
    nameOrigin,
    autoRenamePromptContext,
    isGroupLeader,
    model,
    effort,
  } = params;

  let { initialPrompt, initialInputDraft } = params;

  // Sentiph is a singleton: if a terminal with that tentacleId already exists,
  // ensure its session is running and return the existing snapshot instead of
  // creating a duplicate that would orphan the live session.
  if (requestedTentacleId === SENTIPH_TENTACLE_ID) {
    const existingSentiph = [...ctx.terminals.values()].find(
      (t) => t.tentacleId === SENTIPH_TENTACLE_ID,
    );
    if (existingSentiph) {
      ctx.startSession(existingSentiph.terminalId);
      return ctx.toTerminalSnapshot(existingSentiph);
    }
  }

  // Enforce max children per parent.
  if (parentTerminalId) {
    const childCount = [...ctx.terminals.values()].filter(
      (t) => t.parentTerminalId === parentTerminalId,
    ).length;
    if (childCount >= MAX_CHILDREN_PER_PARENT) {
      throw new RuntimeInputError(
        `Parent terminal "${parentTerminalId}" already has ${MAX_CHILDREN_PER_PARENT} children (limit reached).`,
      );
    }
  }

  const terminalId =
    requestedTerminalId && !ctx.terminals.has(requestedTerminalId)
      ? requestedTerminalId
      : allocateTerminalId(ctx.terminals, ctx.sessions, ctx.hasTentacleWorktree);

  if (initialPrompt) {
    const capacity = ctx.getSessionCapacity();
    if (capacity.active >= capacity.max) {
      throw new RuntimeInputError(
        `Terminal session limit reached (${capacity.max}). Close an existing terminal session or increase SENTIPH_MAX_TERMINAL_SESSIONS.`,
      );
    }
  }

  // Allow explicit tentacleId so multiple terminals can share a tentacle context (e.g. swarm workers).
  const tentacleId = requestedTentacleId ?? terminalId;
  const effectiveName =
    tentacleName ??
    (tentacleId === SENTIPH_TENTACLE_ID ? "Sentiph" : allocateDefaultTerminalName(ctx.terminals));

  // Auto-generate initialInputDraft from tentacle CONTEXT.md when not explicitly provided.
  if (!initialInputDraft && tentacleId && tentacleId !== SENTIPH_TENTACLE_ID) {
    const tentacleDir = join(ctx.stateDir, "tentacles", tentacleId);
    const contextPath = join(tentacleDir, "CONTEXT.md");
    if (existsSync(contextPath)) {
      const contextContent = readFileSync(contextPath, "utf8");
      const headingMatch = /^#\s+(.+)$/m.exec(contextContent);
      if (headingMatch) {
        const sectionName = (headingMatch[1] ?? "").trim();
        const relativeTentacleDir = relative(ctx.workspaceCwd, tentacleDir);
        initialInputDraft = `You are working on the ${sectionName} section. For tool-list items, context, and docs, check ${relativeTentacleDir}.`;
      }
    }
  }

  // Auto-allocate a unique worktreeId when creating a worktree terminal
  // so multiple worktree terminals can coexist (each gets its own directory).
  const worktreeId = requestedWorktreeId ?? (workspaceMode === "worktree" ? terminalId : undefined);

  const terminal: PersistedTerminal = {
    terminalId,
    tentacleId,
    ...(worktreeId ? { worktreeId } : {}),
    tentacleName: effectiveName,
    ...(color ? { color } : {}),
    nameOrigin: nameOrigin ?? (tentacleName ? "user" : "generated"),
    ...(autoRenamePromptContext ? { autoRenamePromptContext } : {}),
    createdAt: new Date().toISOString(),
    workspaceMode,
    agentProvider: agentProvider ?? DEFAULT_AGENT_PROVIDER,
    lifecycleState: "registered",
    lifecycleUpdatedAt: new Date().toISOString(),
    ...(initialPrompt ? { initialPrompt } : {}),
    ...(initialInputDraft ? { initialInputDraft } : {}),
    ...(initialPrompt ? { lastActiveAt: new Date().toISOString() } : {}),
    ...(parentTerminalId ? { parentTerminalId } : {}),
    ...(isGroupLeader ? { isGroupLeader: true } : {}),
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };

  const effectiveWorktreeId = worktreeId ?? tentacleId;
  const shouldCreateWorktree = workspaceMode === "worktree";
  if (shouldCreateWorktree) {
    ctx.createTentacleWorktree(effectiveWorktreeId, baseRef);
  }

  ctx.terminals.set(terminalId, terminal);
  ctx.persistRegistry();
  ctx.broadcastTerminalEvent({
    type: "terminal-created",
    snapshot: ctx.toTerminalSnapshot(terminal),
  });

  if (initialPrompt || tentacleId === SENTIPH_TENTACLE_ID) {
    ctx.startSession(terminalId);
  }

  return ctx.toTerminalSnapshot(terminal);
};
