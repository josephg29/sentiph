import type {
  AgentRuntimeState,
  AgentState,
  TentacleWorkspaceMode,
} from "@sentiph/core";

export type GraphNode = {
  id: string;
  type: "tentacle" | "sentiph" | "active-session" | "inactive-session";
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  radius: number;
  tentacleId: string;
  label: string;
  color: string;
  sessionId?: string;
  agentState?: AgentState;
  agentRuntimeState?: AgentRuntimeState;
  waitingToolName?: string;
  hasUserPrompt?: boolean;
  workspaceMode?: TentacleWorkspaceMode;
  parentTerminalId?: string;
  firstPromptPreview?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
};
