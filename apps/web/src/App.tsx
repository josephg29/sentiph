import { buildTerminalList } from "@sentiph/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAgentGitLifecycle } from "./app/hooks/useAgentGitLifecycle";
import { useBackendLivenessPolling } from "./app/hooks/useBackendLivenessPolling";
import { SENTIPH_ID } from "./app/hooks/useCanvasGraphData";
import { useClaudeUsagePolling } from "./app/hooks/useClaudeUsagePolling";
import { useCodexUsagePolling } from "./app/hooks/useCodexUsagePolling";
import { useConsoleKeyboardShortcuts } from "./app/hooks/useConsoleKeyboardShortcuts";
import { useGitHubPrimaryViewModel } from "./app/hooks/useGitHubPrimaryViewModel";
import { useGithubSummaryPolling } from "./app/hooks/useGithubSummaryPolling";
import { useInitialColumnsHydration } from "./app/hooks/useInitialColumnsHydration";
import { usePersistedUiState } from "./app/hooks/usePersistedUiState";
import { useTerminalCompletionNotification } from "./app/hooks/useTerminalCompletionNotification";
import { useTerminalEventsSocket } from "./app/hooks/useTerminalEventsSocket";
import { useTerminalMutations } from "./app/hooks/useTerminalMutations";
import { useTerminalStateReconciliation } from "./app/hooks/useTerminalStateReconciliation";
import { useUsageHeatmapPolling } from "./app/hooks/useUsageHeatmapPolling";
import {
  createTerminalRuntimeStateStore,
  stripTerminalRuntimeStates,
} from "./app/terminalRuntimeStateStore";
import type { TerminalView } from "./app/types";
import { clampSidebarWidth } from "./app/uiStateNormalizers";
import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import { ConsolePrimaryNav } from "./components/ConsolePrimaryNav";
import { PrimaryViewRouter } from "./components/PrimaryViewRouter";
import { RouteNotFound } from "./components/RouteNotFound";
import { RuntimeStatusStrip } from "./components/RuntimeStatusStrip";
import { SidebarActionPanel } from "./components/SidebarActionPanel";
import { ShortcutsOverlay } from "./components/ui/ShortcutsOverlay";
import { HttpTerminalSnapshotReader } from "./runtime/HttpTerminalSnapshotReader";
import { buildTerminalSnapshotsUrl } from "./runtime/runtimeEndpoints";

// Sentiph has no client-side router; the console only ever lives at "/".
const readUnknownRoutePath = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const { pathname } = window.location;
  return pathname === "/" || pathname === "" ? null : pathname;
};

export const App = () => {
  const [unknownRoutePath, setUnknownRoutePath] = useState<string | null>(readUnknownRoutePath);
  const [terminals, setTerminals] = useState<TerminalView>([]);
  const [recentlyCreatedTerminal, setRecentlyCreatedTerminal] = useState<
    TerminalView[number] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredGitHubOverviewPointIndex, setHoveredGitHubOverviewPointIndex] = useState<
    number | null
  >(null);
  const [isShortcutsOverlayOpen, setIsShortcutsOverlayOpen] = useState(false);
  const runtimeStateStoreRef = useRef(createTerminalRuntimeStateStore());
  const runtimeStateStore = runtimeStateStoreRef.current;

  const {
    activePrimaryNav,
    setActivePrimaryNav,
    applyHydratedUiState,
    isActiveAgentsSectionExpanded,
    isAgentsSidebarVisible,
    isBottomTelemetryVisible,
    isClaudeUsageSectionExpanded,
    isCodexUsageSectionExpanded,
    isRuntimeStatusStripVisible,
    isUiStateHydrated,
    minimizedTerminalIds,
    readUiState,
    setIsActiveAgentsSectionExpanded,
    setIsAgentsSidebarVisible,
    setIsBottomTelemetryVisible,
    setIsClaudeUsageSectionExpanded,
    setIsCodexUsageSectionExpanded,
    setIsRuntimeStatusStripVisible,
    setIsUiStateHydrated,
    setMinimizedTerminalIds,
    setSidebarWidth,
    setTerminalCompletionSound,
    sidebarWidth,
    terminalCompletionSound,
    canvasOpenTerminalIds,
    setCanvasOpenTerminalIds,
    canvasOpenTentacleIds,
    setCanvasOpenTentacleIds,
    canvasTerminalsPanelWidth,
    setCanvasTerminalsPanelWidth,
  } = usePersistedUiState({ columns: terminals });

  const readColumns = useCallback(
    async (signal?: AbortSignal) => {
      const readerOptions: { endpoint: string; signal?: AbortSignal } = {
        endpoint: buildTerminalSnapshotsUrl(),
      };
      if (signal) {
        readerOptions.signal = signal;
      }
      const reader = new HttpTerminalSnapshotReader(readerOptions);
      const nextColumns = await buildTerminalList(reader);
      runtimeStateStore.syncFromTerminals(nextColumns);
      return stripTerminalRuntimeStates(nextColumns);
    },
    [runtimeStateStore],
  );

  const refreshColumns = useCallback(async () => {
    const nextColumns = await readColumns();
    setTerminals(nextColumns);
    return nextColumns;
  }, [readColumns]);

  const {
    clearPendingDeleteTerminal,
    confirmDeleteTerminal,
    createTerminal,
    isCreatingTerminal,
    isDeletingTerminalId,
    pendingDeleteTerminal,
    requestDeleteTerminal,
  } = useTerminalMutations({
    readColumns: async () => readColumns(),
    setColumns: setTerminals,
    setLoadError,
    setMinimizedTerminalIds,
  });

  const {
    gitStatusByAgentId,
    gitStatusLoadingByAgentId,
    pullRequestByAgentId,
    pullRequestLoadingByAgentId,
    openGitAgentId,
    openGitAgentStatus,
    openGitAgentPullRequest,
    gitCommitMessageDraft,
    gitDialogError,
    isGitDialogLoading,
    isGitDialogMutating,
    setGitCommitMessageDraft,
    openAgentGitActions,
    closeAgentGitActions,
    commitAgentChanges,
    commitAndPushAgentBranch,
    pushAgentBranch,
    syncAgentBranch,
    mergeAgentPullRequest,
  } = useAgentGitLifecycle({
    columns: terminals,
  });

  useInitialColumnsHydration({
    readColumns,
    readUiState,
    applyHydratedUiState,
    setColumns: setTerminals,
    setLoadError,
    setIsLoading,
    setIsUiStateHydrated,
  });

  useTerminalEventsSocket({
    refreshColumns,
    runtimeStateStore,
    setTerminals,
    setRecentlyCreatedTerminal,
  });

  const { codexUsageSnapshot, refreshCodexUsage } = useCodexUsagePolling();
  const { claudeUsageSnapshot, isRefreshingClaudeUsage, refreshClaudeUsage } =
    useClaudeUsagePolling();
  const backendLivenessStatus = useBackendLivenessPolling();
  const { githubRepoSummary, isRefreshingGitHubSummary, refreshGitHubRepoSummary } =
    useGithubSummaryPolling();
  const handleMaximizeTerminal = useCallback(
    (terminalId: string) => {
      setMinimizedTerminalIds((current) =>
        current.filter((currentTerminalId) => currentTerminalId !== terminalId),
      );
    },
    [setMinimizedTerminalIds],
  );
  const handleActiveTerminalIdsChange = useCallback(
    (activeTerminalIds: ReadonlySet<string>) => {
      runtimeStateStore.retainTerminalIds(activeTerminalIds);
    },
    [runtimeStateStore],
  );

  useTerminalStateReconciliation({
    columns: terminals,
    setMinimizedTerminalIds,
    onActiveTerminalIdsChange: handleActiveTerminalIdsChange,
  });
  const { playCompletionSoundPreview } = useTerminalCompletionNotification(
    runtimeStateStore,
    terminalCompletionSound,
  );
  const { heatmapData, isLoadingHeatmap, refreshHeatmap } = useUsageHeatmapPolling({
    enabled: isUiStateHydrated && (activePrimaryNav === 3 || isRuntimeStatusStripVisible),
  });

  const toggleShortcutsOverlay = useCallback(() => {
    setIsShortcutsOverlayOpen((open) => !open);
  }, []);
  const closeShortcutsOverlay = useCallback(() => {
    setIsShortcutsOverlayOpen(false);
  }, []);

  useConsoleKeyboardShortcuts({
    setActivePrimaryNav,
    onToggleShortcutsOverlay: toggleShortcutsOverlay,
  });

  const {
    githubCommitCount30d,
    sparklinePoints,
    githubOverviewGraphSeries,
    githubOverviewGraphPolylinePoints,
    githubOverviewHoverLabel,
    githubStatusPill,
    githubRepoLabel,
    githubStarCountLabel,
    githubOpenIssuesLabel,
    githubOpenPrsLabel,
    githubRecentCommits,
  } = useGitHubPrimaryViewModel({
    githubRepoSummary,
    hoveredGitHubOverviewPointIndex,
    setHoveredGitHubOverviewPointIndex,
  });
  const hasSidebarActionPanel =
    pendingDeleteTerminal !== null ||
    (openGitAgentId !== null &&
      terminals.find((terminal) => terminal.tentacleId === openGitAgentId)?.workspaceMode ===
        "worktree");

  const sidebarActionPanel = hasSidebarActionPanel ? (
    <SidebarActionPanel
      pendingDeleteTerminal={pendingDeleteTerminal}
      isDeletingTerminalId={isDeletingTerminalId}
      clearPendingDeleteTerminal={clearPendingDeleteTerminal}
      confirmDeleteTerminal={confirmDeleteTerminal}
      openGitAgentId={openGitAgentId}
      columns={terminals}
      openGitAgentStatus={openGitAgentStatus}
      openGitAgentPullRequest={openGitAgentPullRequest}
      gitCommitMessageDraft={gitCommitMessageDraft}
      gitDialogError={gitDialogError}
      isGitDialogLoading={isGitDialogLoading}
      isGitDialogMutating={isGitDialogMutating}
      setGitCommitMessageDraft={setGitCommitMessageDraft}
      closeAgentGitActions={closeAgentGitActions}
      commitAgentChanges={commitAgentChanges}
      commitAndPushAgentBranch={commitAndPushAgentBranch}
      pushAgentBranch={pushAgentBranch}
      syncAgentBranch={syncAgentBranch}
      mergeAgentPullRequest={mergeAgentPullRequest}
      requestDeleteTerminal={requestDeleteTerminal}
    />
  ) : null;

  useEffect(() => {
    if (!hasSidebarActionPanel || isAgentsSidebarVisible) {
      return;
    }
    setIsAgentsSidebarVisible(true);
  }, [isAgentsSidebarVisible, setIsAgentsSidebarVisible, hasSidebarActionPanel]);

  const handleTerminalRenamed = useCallback((terminalId: string, tentacleName: string) => {
    setTerminals((current) =>
      current.map((t) =>
        t.terminalId === terminalId ? { ...t, tentacleName, label: tentacleName } : t,
      ),
    );
  }, []);

  const handleTerminalActivity = useCallback((terminalId: string) => {
    setTerminals((current) =>
      current.map((t) => (t.terminalId === terminalId ? { ...t, hasUserPrompt: true } : t)),
    );
  }, []);

  if (unknownRoutePath !== null) {
    return (
      <RouteNotFound
        path={unknownRoutePath}
        onReturnHome={() => {
          window.history.replaceState(null, "", "/");
          setUnknownRoutePath(null);
        }}
      />
    );
  }

  return (
    <div className="page console-shell">
      {isRuntimeStatusStripVisible && (
        <RuntimeStatusStrip
          sparklinePoints={sparklinePoints}
          usageData={heatmapData}
          claudeUsage={claudeUsageSnapshot}
          isRefreshingClaudeUsage={isRefreshingClaudeUsage}
          onRefreshClaudeUsage={refreshClaudeUsage}
        />
      )}

      <ConsolePrimaryNav
        activePrimaryNav={activePrimaryNav}
        onPrimaryNavChange={setActivePrimaryNav}
        onShowShortcuts={toggleShortcutsOverlay}
      />

      <section className="console-main-canvas" aria-label="Main content canvas">
        <div
          className={`workspace-shell${isAgentsSidebarVisible && activePrimaryNav !== 1 && activePrimaryNav !== 3 && activePrimaryNav !== 8 && activePrimaryNav !== 9 ? "" : " workspace-shell--full"}`}
        >
          {isAgentsSidebarVisible &&
            activePrimaryNav !== 1 &&
            activePrimaryNav !== 3 &&
            activePrimaryNav !== 8 &&
            activePrimaryNav !== 9 && (
              <ActiveAgentsSidebar
                sidebarWidth={sidebarWidth}
                onSidebarWidthChange={(width) => {
                  setSidebarWidth(clampSidebarWidth(width));
                }}
                actionPanel={sidebarActionPanel}
              />
            )}

          <PrimaryViewRouter
            activePrimaryNav={activePrimaryNav}
            activityPrimaryViewProps={{
              usageChartProps: {
                data: heatmapData,
                isLoading: isLoadingHeatmap,
                onRefresh: refreshHeatmap,
              },
              githubPrimaryViewProps: {
                githubCommitCount30d,
                githubOpenIssuesLabel,
                githubOpenPrsLabel,
                githubRecentCommits,
                githubOverviewGraphPolylinePoints,
                githubOverviewGraphSeries,
                githubOverviewHoverLabel,
                githubRepoLabel,
                githubStarCountLabel,
                githubStatusPill,
                hoveredGitHubOverviewPointIndex,
                isRefreshingGitHubSummary,
                onHoveredGitHubOverviewPointIndexChange: setHoveredGitHubOverviewPointIndex,
                onRefresh: () => {
                  void refreshGitHubRepoSummary();
                },
              },
            }}
            settingsPrimaryViewProps={{
              isRuntimeStatusStripVisible,
              onRuntimeStatusStripVisibilityChange: setIsRuntimeStatusStripVisible,
              onPreviewTerminalCompletionSound: playCompletionSoundPreview,
              onTerminalCompletionSoundChange: setTerminalCompletionSound,
              terminalCompletionSound,
            }}
            canvasPrimaryViewProps={{
              columns: terminals,
              runtimeStateStore,
              isUiStateHydrated,
              recentlyCreatedTerminal,
              canvasOpenTerminalIds,
              canvasOpenTentacleIds,
              canvasTerminalsPanelWidth,
              onCanvasOpenTerminalIdsChange: setCanvasOpenTerminalIds,
              onCanvasOpenTentacleIdsChange: setCanvasOpenTentacleIds,
              onCanvasTerminalsPanelWidthChange: setCanvasTerminalsPanelWidth,
              onCreateAgent: async (tentacleId) => {
                return await createTerminal("shared", undefined, tentacleId);
              },
              onCreateTerminal: async () => {
                return await createTerminal("shared", undefined, SENTIPH_ID);
              },
              onCreateWorktreeTerminal: async () => {
                return await createTerminal("worktree", undefined, SENTIPH_ID);
              },
              onCloseActiveSession: (terminalId, terminalName, workspaceMode) => {
                requestDeleteTerminal(terminalId, terminalName, {
                  workspaceMode: workspaceMode === "worktree" ? "worktree" : "shared",
                  intent: "close-terminal",
                });
              },
              onDeleteActiveSession: (terminalId, terminalName, workspaceMode) => {
                requestDeleteTerminal(terminalId, terminalName, {
                  workspaceMode: workspaceMode === "worktree" ? "worktree" : "shared",
                  intent: "delete-terminal",
                });
              },
              pendingDeleteTerminal,
              isDeletingTerminalId,
              onCancelDelete: clearPendingDeleteTerminal,
              onConfirmDelete: () => {
                void confirmDeleteTerminal();
              },
              onTerminalRenamed: handleTerminalRenamed,
              onTerminalActivity: handleTerminalActivity,
              onRefreshColumns: async () => {
                await refreshColumns();
              },
            }}
          />
        </div>
      </section>

      <ShortcutsOverlay open={isShortcutsOverlayOpen} onClose={closeShortcutsOverlay} />
    </div>
  );
};
