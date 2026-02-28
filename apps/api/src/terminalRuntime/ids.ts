import { TENTACLE_ID_PREFIX, TMUX_SESSION_PREFIX } from "./constants";

export const parseTentacleNumber = (tentacleId: string): number | null => {
  if (!tentacleId.startsWith(TENTACLE_ID_PREFIX)) {
    return null;
  }

  const numericPart = tentacleId.slice(TENTACLE_ID_PREFIX.length);
  if (!/^\d+$/.test(numericPart)) {
    return null;
  }

  const parsed = Number.parseInt(numericPart, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
};

export const tmuxSessionNameForTentacle = (tentacleId: string) => {
  // tmux target parsing treats punctuation as selectors; keep names explicit and stable.
  const sanitizedTentacleId = tentacleId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${TMUX_SESSION_PREFIX}${sanitizedTentacleId}`;
};
