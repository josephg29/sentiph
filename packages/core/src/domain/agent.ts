export type AgentState = "live" | "idle" | "queued" | "blocked";
export type TentacleWorkspaceMode = "shared" | "worktree";

export type AgentSnapshot = {
  agentId: string;
  label: string;
  state: AgentState;
  tentacleId: string;
  tentacleName?: string;
  tentacleWorkspaceMode?: TentacleWorkspaceMode;
  createdAt: string;
  parentAgentId?: string;
};

export type TentacleColumn = {
  tentacleId: string;
  tentacleName: string;
  tentacleWorkspaceMode: TentacleWorkspaceMode;
  agents: AgentSnapshot[];
};
