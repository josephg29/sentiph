export type AgentState = "live" | "idle" | "queued" | "blocked";

export type AgentSnapshot = {
  agentId: string;
  label: string;
  state: AgentState;
  tentacleId: string;
  tentacleName?: string;
  createdAt: string;
  parentAgentId?: string;
};

export type TentacleColumn = {
  tentacleId: string;
  tentacleName: string;
  agents: AgentSnapshot[];
};
