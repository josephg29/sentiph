export type DeckTentacleStatus = "idle" | "active" | "blocked" | "needs-review";

export type DeckOctopusAppearance = {
  animation: string | null;
  expression: string | null;
  accessory: string | null;
  hairColor: string | null;
};

export type DeckTentacleSummary = {
  tentacleId: string;
  displayName: string;
  description: string;
  status: DeckTentacleStatus;
  color: string | null;
  octopus: DeckOctopusAppearance;
  scope: {
    paths: string[];
    tags: string[];
  };
  vaultFiles: string[];
  todoTotal: number;
  todoDone: number;
  todoItems: { text: string; done: boolean }[];
};
