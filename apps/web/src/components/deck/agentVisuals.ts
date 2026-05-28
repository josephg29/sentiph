import type { DeckTentacleSummary } from "@sentiph/core";
import type { AgentAccessory, AgentAnimation, AgentExpression } from "../EmptyAgents";

// ─── Agent visual derivation (seeded from agent id) ────────────────────────

export const OCTOPUS_COLORS = [
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

export const ANIMATIONS: AgentAnimation[] = ["sway", "walk", "jog", "bounce", "float", "swim-up"];
export const EXPRESSIONS: AgentExpression[] = ["normal", "happy", "angry", "surprised"];
export const ACCESSORIES: AgentAccessory[] = [
  "none",
  "none",
  "long",
  "mohawk",
  "side-sweep",
  "curly",
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export type AgentVisuals = {
  color: string;
  animation: AgentAnimation;
  expression: AgentExpression;
  accessory: AgentAccessory;
  hairColor?: string | undefined;
};

function deriveAgentVisuals(agent: DeckTentacleSummary): AgentVisuals {
  const rng = seededRandom(hashString(agent.tentacleId));
  const stored = agent.octopus;
  return {
    color:
      agent.color ??
      (OCTOPUS_COLORS[hashString(agent.tentacleId) % OCTOPUS_COLORS.length] as string),
    animation:
      (stored?.animation as AgentAnimation | null) ??
      (ANIMATIONS[Math.floor(rng() * ANIMATIONS.length)] as AgentAnimation),
    expression:
      (stored?.expression as AgentExpression | null) ??
      (EXPRESSIONS[Math.floor(rng() * EXPRESSIONS.length)] as AgentExpression),
    accessory:
      (stored?.accessory as AgentAccessory | null) ??
      (ACCESSORIES[Math.floor(rng() * ACCESSORIES.length)] as AgentAccessory),
    hairColor: stored?.hairColor ?? undefined,
  };
}
