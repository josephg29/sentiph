export type DeckTentacleStatus = "idle" | "active" | "blocked" | "needs-review";

export type DeckAgentAppearance = Record<string, unknown>;

export type DeckAvailableSkill = {
  name: string;
  description: string;
  source: "project" | "user";
};

export type DeckTentacleSummary = {
  tentacleId: string;
  displayName: string;
  description: string;
  status: DeckTentacleStatus;
  color: string | null;
  scope: {
    paths: string[];
    tags: string[];
  };
  vaultFiles: string[];
  suggestedSkills: string[];
};
