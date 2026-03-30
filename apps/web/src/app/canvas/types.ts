import type { AgentState, DeckOctopusAppearance, TentacleWorkspaceMode } from "@octogent/core";

export type GraphNode = {
  id: string;
  type: "tentacle" | "octoboss" | "active-session" | "inactive-session";
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
  workspaceMode?: TentacleWorkspaceMode;
  firstPromptPreview?: string;
  octopus?: DeckOctopusAppearance;
};

export type GraphEdge = {
  source: string;
  target: string;
};
