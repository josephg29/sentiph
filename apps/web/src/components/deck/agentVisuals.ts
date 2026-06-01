import type { DeckTentacleSummary } from "@sentiph/core";

export const AGENT_COLORS = [
  "#ff6b2b",
  "#ff2d6b",
  "#00ffaa",
  "#bf5fff",
  "#00c8ff",
  "#ffee00",
  "#39ff14",
  "#ff4df0",
  "#00fff7",
  "#ff9500",
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type AgentVisuals = {
  color: string;
};

export function deriveAgentVisuals(tentacle: DeckTentacleSummary): AgentVisuals {
  return {
    color:
      tentacle.color ??
      (AGENT_COLORS[hashString(tentacle.tentacleId) % AGENT_COLORS.length] as string),
  };
}
