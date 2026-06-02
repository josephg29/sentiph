export const CODEX_USAGE_SCAN_INTERVAL_MS = 600_000;
export const GITHUB_SUMMARY_SCAN_INTERVAL_MS = 60_000;
export const BACKEND_LIVENESS_SCAN_INTERVAL_MS = 120_000;
export const UI_STATE_SAVE_DEBOUNCE_MS = 250;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 520;

// `index` is the stable internal nav identifier (intentionally non-contiguous so
// removing a middle tab doesn't renumber persisted state). `shortcut` is the
// contiguous 1-based number shown to the user and bound to the keyboard — keeping
// the two separate means the UI reads "1 2 3 4" while routing/persistence stay stable.
export const PRIMARY_NAV_ITEMS = [
  { index: 1, shortcut: 1, label: "Agents" },
  { index: 3, shortcut: 2, label: "Activity" },
  { index: 8, shortcut: 3, label: "Settings" },
  { index: 9, shortcut: 4, label: "Observe" },
] as const;

export const PRIMARY_NAV_SHORTCUT_MAX = Math.max(...PRIMARY_NAV_ITEMS.map((item) => item.shortcut));

export const GITHUB_COMMIT_SERIES_LENGTH = 30;
export const GITHUB_SPARKLINE_WIDTH = 148;
export const GITHUB_SPARKLINE_HEIGHT = 36;
export const GITHUB_OVERVIEW_GRAPH_WIDTH = 640;
export const GITHUB_OVERVIEW_GRAPH_HEIGHT = 180;

// Max valid index (not array length) so removed dead-end tabs in the middle
// don't invalidate higher indices like Settings (8).
export const PRIMARY_NAV_MAX = Math.max(...PRIMARY_NAV_ITEMS.map((item) => item.index));

export type PrimaryNavIndex = (typeof PRIMARY_NAV_ITEMS)[number]["index"];
