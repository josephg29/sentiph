/**
 * Shared test fixtures for terminal snapshot mock data.
 *
 * Update these factories when the snapshot shape changes
 * instead of updating mock data across 15+ test files.
 */

export type MockTerminalSnapshot = {
  terminalId: string;
  label: string;
  state: "live" | "idle" | "queued" | "blocked";
  tentacleId: string;
  tentacleName: string;
  createdAt: string;
  workspaceMode?: "shared" | "worktree";
};

let counter = 0;

export const resetFixtureCounter = () => {
  counter = 0;
};

/**
 * Build a terminal snapshot with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export const buildTerminalSnapshot = (
  overrides: Partial<MockTerminalSnapshot> = {},
): MockTerminalSnapshot => {
  counter += 1;
  const id = overrides.terminalId ?? `terminal-${counter}`;
  const tentacleId = overrides.tentacleId ?? `tentacle-${counter}`;
  return {
    terminalId: id,
    label: overrides.label ?? id,
    state: overrides.state ?? "live",
    tentacleId,
    tentacleName: overrides.tentacleName ?? tentacleId,
    createdAt:
      overrides.createdAt ?? `2026-02-24T10:${String(counter * 5).padStart(2, "0")}:00.000Z`,
    ...(overrides.workspaceMode !== undefined ? { workspaceMode: overrides.workspaceMode } : {}),
  };
};

/** Convenience: build a pair of snapshots (common in layout/resize tests). */
export const buildTerminalSnapshotPair = (
  overridesA: Partial<MockTerminalSnapshot> = {},
  overridesB: Partial<MockTerminalSnapshot> = {},
): [MockTerminalSnapshot, MockTerminalSnapshot] => [
  buildTerminalSnapshot({
    terminalId: "terminal-a",
    tentacleId: "tentacle-a",
    tentacleName: "tentacle-a",
    ...overridesA,
  }),
  buildTerminalSnapshot({
    terminalId: "terminal-b",
    tentacleId: "tentacle-b",
    tentacleName: "tentacle-b",
    ...overridesB,
  }),
];

/** Standard codex-unavailable response used in most tests that don't test codex. */
export const codexUnavailableResponse = {
  status: "unavailable",
  source: "none",
  fetchedAt: "2026-03-03T12:00:00.000Z",
};

/** Standard github-unavailable response. */
export const githubUnavailableResponse = {
  status: "unavailable",
  source: "none",
  fetchedAt: "2026-02-28T12:00:00.000Z",
  commitsPerDay: [],
};
