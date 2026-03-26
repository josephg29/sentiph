export const UI_STATE_SAVE_DEBOUNCE_MS = 250;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 520;
export const DEFAULT_SIDEBAR_WIDTH = MIN_SIDEBAR_WIDTH;

export const PRIMARY_NAV_ITEMS = [
  { index: 1, label: "Agents" },
  { index: 2, label: "Deck" },
  { index: 3, label: "Conversations" },
] as const;

export const PRIMARY_NAV_MAX = PRIMARY_NAV_ITEMS.length;

export type PrimaryNavIndex = (typeof PRIMARY_NAV_ITEMS)[number]["index"];
