import { pruneUiStateTerminalReferences } from "./registry";
import type { PersistedTerminal, PersistedUiState } from "./types";

/**
 * Returns a deep-ish copy of the UI state with stale terminal references pruned.
 * Arrays/records are cloned so callers cannot mutate the persisted state.
 */
export const readUiStateSnapshot = (
  uiState: PersistedUiState,
  terminals: Map<string, PersistedTerminal>,
): PersistedUiState => {
  const normalized = pruneUiStateTerminalReferences(uiState, terminals);
  const result: PersistedUiState = { ...normalized };
  if (normalized.minimizedTerminalIds) {
    result.minimizedTerminalIds = [...normalized.minimizedTerminalIds];
  }
  if (normalized.terminalWidths) {
    result.terminalWidths = { ...normalized.terminalWidths };
  }
  if (normalized.terminalCompletionSound !== undefined) {
    result.terminalCompletionSound = normalized.terminalCompletionSound;
  }
  return result;
};

/**
 * Applies a partial UI-state patch onto the live `uiState` object in place.
 * Only fields present (not `undefined`) on the patch are copied; array/record
 * fields are cloned to avoid sharing references with the caller's patch.
 */
export const applyUiStatePatch = (uiState: PersistedUiState, patch: PersistedUiState): void => {
  if (patch.activePrimaryNav !== undefined) {
    uiState.activePrimaryNav = patch.activePrimaryNav;
  }
  if (patch.isAgentsSidebarVisible !== undefined) {
    uiState.isAgentsSidebarVisible = patch.isAgentsSidebarVisible;
  }
  if (patch.sidebarWidth !== undefined) {
    uiState.sidebarWidth = patch.sidebarWidth;
  }
  if (patch.isActiveAgentsSectionExpanded !== undefined) {
    uiState.isActiveAgentsSectionExpanded = patch.isActiveAgentsSectionExpanded;
  }
  if (patch.isRuntimeStatusStripVisible !== undefined) {
    uiState.isRuntimeStatusStripVisible = patch.isRuntimeStatusStripVisible;
  }
  if (patch.isBottomTelemetryVisible !== undefined) {
    uiState.isBottomTelemetryVisible = patch.isBottomTelemetryVisible;
  }
  if (patch.isCodexUsageVisible !== undefined) {
    uiState.isCodexUsageVisible = patch.isCodexUsageVisible;
  }
  if (patch.isClaudeUsageVisible !== undefined) {
    uiState.isClaudeUsageVisible = patch.isClaudeUsageVisible;
  }
  if (patch.isClaudeUsageSectionExpanded !== undefined) {
    uiState.isClaudeUsageSectionExpanded = patch.isClaudeUsageSectionExpanded;
  }
  if (patch.isCodexUsageSectionExpanded !== undefined) {
    uiState.isCodexUsageSectionExpanded = patch.isCodexUsageSectionExpanded;
  }
  if (patch.terminalCompletionSound !== undefined) {
    uiState.terminalCompletionSound = patch.terminalCompletionSound;
  }
  if (patch.minimizedTerminalIds !== undefined) {
    uiState.minimizedTerminalIds = [...patch.minimizedTerminalIds];
  }
  if (patch.terminalWidths !== undefined) {
    uiState.terminalWidths = { ...patch.terminalWidths };
  }
  if (patch.canvasOpenTerminalIds !== undefined) {
    uiState.canvasOpenTerminalIds = [...patch.canvasOpenTerminalIds];
  }
  if (patch.canvasOpenTentacleIds !== undefined) {
    uiState.canvasOpenTentacleIds = [...patch.canvasOpenTentacleIds];
  }
  if (patch.canvasTerminalsPanelWidth !== undefined) {
    uiState.canvasTerminalsPanelWidth = patch.canvasTerminalsPanelWidth;
  }
};
