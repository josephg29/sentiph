import { buildTentacleColumns } from "@octogent/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type GitHubSubtabId, PRIMARY_NAV_ITEMS, type PrimaryNavIndex } from "./app/constants";
import { useBackendLivenessPolling } from "./app/hooks/useBackendLivenessPolling";
import { useClaudeUsagePolling } from "./app/hooks/useClaudeUsagePolling";
import { useCodexUsagePolling } from "./app/hooks/useCodexUsagePolling";
import { useConsoleKeyboardShortcuts } from "./app/hooks/useConsoleKeyboardShortcuts";
import { useGitHubPrimaryViewModel } from "./app/hooks/useGitHubPrimaryViewModel";
import { useGithubSummaryPolling } from "./app/hooks/useGithubSummaryPolling";
import { useInitialColumnsHydration } from "./app/hooks/useInitialColumnsHydration";
import { useMonitorRuntime } from "./app/hooks/useMonitorRuntime";
import { usePersistedUiState } from "./app/hooks/usePersistedUiState";
import { useTentacleGitLifecycle } from "./app/hooks/useTentacleGitLifecycle";
import { useTentacleBoardInteractions } from "./app/hooks/useTentacleBoardInteractions";
import { useTentacleCompletionNotification } from "./app/hooks/useTentacleCompletionNotification";
import { useTentacleMutations } from "./app/hooks/useTentacleMutations";
import { useTentacleNameInputFocus } from "./app/hooks/useTentacleNameInputFocus";
import { useTentacleStateReconciliation } from "./app/hooks/useTentacleStateReconciliation";
import { clampSidebarWidth } from "./app/normalizers";
import type { TentacleView } from "./app/types";
import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import type { CodexState } from "./components/CodexStateBadge";
import { ConsoleHeader } from "./components/ConsoleHeader";
import { ConsolePrimaryNav } from "./components/ConsolePrimaryNav";
import { DeleteTentacleDialog } from "./components/DeleteTentacleDialog";
import { GitHubPrimaryView } from "./components/GitHubPrimaryView";
import { MonitorPrimaryView } from "./components/MonitorPrimaryView";
import { RuntimeStatusStrip } from "./components/RuntimeStatusStrip";
import { SettingsPrimaryView } from "./components/SettingsPrimaryView";
import { TelemetryTape } from "./components/TelemetryTape";
import { TentacleBoard } from "./components/TentacleBoard";
import { TentacleGitActionsDialog } from "./components/TentacleGitActionsDialog";
import { HttpAgentSnapshotReader } from "./runtime/HttpAgentSnapshotReader";
import { buildAgentSnapshotsUrl } from "./runtime/runtimeEndpoints";

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tentacleStates, setTentacleStates] = useState<Record<string, CodexState>>({});
  const [selectedTentacleId, setSelectedTentacleId] = useState<string | null>(null);
  const [activePrimaryNav, setActivePrimaryNav] = useState<PrimaryNavIndex>(0);
  const [activeGitHubSubtab, setActiveGitHubSubtab] = useState<GitHubSubtabId>("overview");
  const [hoveredGitHubOverviewPointIndex, setHoveredGitHubOverviewPointIndex] = useState<
    number | null
  >(null);
  const tentaclesRef = useRef<HTMLElement | null>(null);
  const tentacleNameInputRef = useRef<HTMLInputElement | null>(null);

  const {
    applyHydratedUiState,
    isActiveAgentsSectionExpanded,
    isAgentsSidebarVisible,
    isClaudeUsageVisible,
    isClaudeUsageSectionExpanded,
    isCodexUsageVisible,
    isCodexUsageSectionExpanded,
    isUiStateHydrated,
    minimizedTentacleIds,
    readUiState,
    setIsActiveAgentsSectionExpanded,
    setIsAgentsSidebarVisible,
    setIsClaudeUsageVisible,
    setIsClaudeUsageSectionExpanded,
    setIsCodexUsageVisible,
    setIsCodexUsageSectionExpanded,
    setIsUiStateHydrated,
    setMinimizedTentacleIds,
    setSidebarWidth,
    setTentacleCompletionSound,
    setTentacleWidths,
    sidebarWidth,
    tentacleCompletionSound,
    tentacleWidths,
  } = usePersistedUiState({ columns });

  const visibleColumns = useMemo(
    () => columns.filter((column) => !minimizedTentacleIds.includes(column.tentacleId)),
    [columns, minimizedTentacleIds],
  );

  useEffect(() => {
    const visibleTentacleIds = new Set(visibleColumns.map((column) => column.tentacleId));
    setSelectedTentacleId((currentSelectedTentacleId) => {
      if (
        currentSelectedTentacleId !== null &&
        visibleTentacleIds.has(currentSelectedTentacleId)
      ) {
        return currentSelectedTentacleId;
      }

      return visibleColumns[0]?.tentacleId ?? null;
    });
  }, [visibleColumns]);

  const readColumns = useCallback(async (signal?: AbortSignal) => {
    const readerOptions: { endpoint: string; signal?: AbortSignal } = {
      endpoint: buildAgentSnapshotsUrl(),
    };
    if (signal) {
      readerOptions.signal = signal;
    }
    const reader = new HttpAgentSnapshotReader(readerOptions);
    return buildTentacleColumns(reader);
  }, []);

  const {
    beginTentacleNameEdit,
    cancelTentacleRename,
    clearPendingDeleteTentacle,
    confirmDeleteTentacle,
    createTentacle,
    editingTentacleId,
    isCreatingTentacle,
    isDeletingTentacleId,
    pendingDeleteTentacle,
    requestDeleteTentacle,
    setEditingTentacleId,
    setTentacleNameDraft,
    submitTentacleRename,
    tentacleNameDraft,
  } = useTentacleMutations({
    readColumns: async () => readColumns(),
    setColumns,
    setLoadError,
    setMinimizedTentacleIds,
  });

  const {
    gitStatusByTentacleId,
    gitStatusLoadingByTentacleId,
    pullRequestByTentacleId,
    pullRequestLoadingByTentacleId,
    openGitTentacleId,
    openGitTentacleStatus,
    openGitTentaclePullRequest,
    gitCommitMessageDraft,
    gitDialogError,
    isGitDialogLoading,
    isGitDialogMutating,
    setGitCommitMessageDraft,
    openTentacleGitActions,
    closeTentacleGitActions,
    commitTentacleChanges,
    commitAndPushTentacleBranch,
    pushTentacleBranch,
    syncTentacleBranch,
    mergeTentaclePullRequest,
  } = useTentacleGitLifecycle({
    columns,
  });

  useInitialColumnsHydration({
    readColumns,
    readUiState,
    applyHydratedUiState,
    setColumns,
    setLoadError,
    setIsLoading,
    setIsUiStateHydrated,
  });

  const codexUsageSnapshot = useCodexUsagePolling();
  const claudeUsageSnapshot = useClaudeUsagePolling();
  const backendLivenessStatus = useBackendLivenessPolling();
  const { githubRepoSummary, isRefreshingGitHubSummary, refreshGitHubRepoSummary } =
    useGithubSummaryPolling();
  const {
    handleMaximizeTentacle,
    handleMinimizeTentacle,
    handleTentacleDividerKeyDown,
    handleTentacleDividerPointerDown,
    handleTentacleHeaderWheel,
  } = useTentacleBoardInteractions({
    tentaclesRef,
    visibleColumns,
    tentacleWidths,
    setTentacleWidths,
    setMinimizedTentacleIds,
    editingTentacleId,
    setEditingTentacleId,
    setTentacleNameDraft,
  });

  useTentacleNameInputFocus({
    columns,
    editingTentacleId,
    setEditingTentacleId,
    tentacleNameInputRef,
  });
  useTentacleStateReconciliation({
    columns,
    setMinimizedTentacleIds,
    setTentacleStates,
  });
  const { playCompletionSoundPreview } = useTentacleCompletionNotification(
    tentacleStates,
    tentacleCompletionSound,
  );
  const {
    monitorConfig,
    monitorFeed,
    monitorError,
    isRefreshingMonitorFeed,
    isSavingMonitorConfig,
    refreshMonitorFeed,
    patchMonitorConfig,
  } = useMonitorRuntime();

  useConsoleKeyboardShortcuts({ setActivePrimaryNav });

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
  } = useGitHubPrimaryViewModel({
    githubRepoSummary,
    hoveredGitHubOverviewPointIndex,
    setHoveredGitHubOverviewPointIndex,
  });
  const isGitHubPrimaryView = activePrimaryNav === 1;
  const isMonitorPrimaryView = activePrimaryNav === 2;
  const isSettingsPrimaryView = activePrimaryNav === 3;
  const openGitTentacleColumn =
    openGitTentacleId !== null ? columns.find((column) => column.tentacleId === openGitTentacleId) : null;
  const sidebarActionPanel = pendingDeleteTentacle ? (
    <DeleteTentacleDialog
      isDeletingTentacleId={isDeletingTentacleId}
      onCancel={clearPendingDeleteTentacle}
      onConfirmDelete={() => {
        void confirmDeleteTentacle();
      }}
      pendingDeleteTentacle={pendingDeleteTentacle}
    />
  ) : openGitTentacleColumn && openGitTentacleColumn.tentacleWorkspaceMode === "worktree" ? (
    <TentacleGitActionsDialog
      errorMessage={gitDialogError}
      gitCommitMessage={gitCommitMessageDraft}
      gitPullRequest={openGitTentaclePullRequest}
      gitStatus={openGitTentacleStatus}
      isLoading={isGitDialogLoading}
      isMutating={isGitDialogMutating}
      onClose={closeTentacleGitActions}
      onCommit={() => {
        void commitTentacleChanges();
      }}
      onCommitAndPush={() => {
        void commitAndPushTentacleBranch();
      }}
      onCommitMessageChange={setGitCommitMessageDraft}
      onMergePullRequest={() => {
        void mergeTentaclePullRequest();
      }}
      onPush={() => {
        void pushTentacleBranch();
      }}
      onSync={() => {
        void syncTentacleBranch();
      }}
      onCleanupWorktree={() => {
        requestDeleteTentacle(
          openGitTentacleColumn.tentacleId,
          openGitTentacleColumn.tentacleName,
          {
            workspaceMode: openGitTentacleColumn.tentacleWorkspaceMode,
            intent: "cleanup-worktree",
          },
        );
        closeTentacleGitActions();
      }}
      tentacleId={openGitTentacleColumn.tentacleId}
      tentacleName={openGitTentacleColumn.tentacleName}
    />
  ) : null;

  useEffect(() => {
    if (sidebarActionPanel === null || isAgentsSidebarVisible) {
      return;
    }
    setIsAgentsSidebarVisible(true);
  }, [isAgentsSidebarVisible, setIsAgentsSidebarVisible, sidebarActionPanel]);

  const handleTentacleStateChange = useCallback((tentacleId: string, state: CodexState) => {
    setTentacleStates((current) => {
      if (current[tentacleId] === state) {
        return current;
      }

      return {
        ...current,
        [tentacleId]: state,
      };
    });
  }, []);

  return (
    <div className="page console-shell">
      <ConsoleHeader
        backendLivenessStatus={backendLivenessStatus}
        isAgentsSidebarVisible={isAgentsSidebarVisible}
        isCreatingTentacle={isCreatingTentacle}
        onCreateSharedTentacle={() => {
          setLoadError(null);
          void createTentacle("shared");
        }}
        onCreateWorktreeTentacle={() => {
          setLoadError(null);
          void createTentacle("worktree");
        }}
        onToggleAgentsSidebar={() => {
          setIsAgentsSidebarVisible((current) => !current);
        }}
      />

      <RuntimeStatusStrip
        githubCommitCount30d={githubCommitCount30d}
        githubOpenIssuesLabel={githubOpenIssuesLabel}
        githubOpenPrsLabel={githubOpenPrsLabel}
        githubRepoLabel={githubRepoLabel}
        githubStarCountLabel={githubStarCountLabel}
        githubStatusPill={githubStatusPill}
        sparklinePoints={sparklinePoints}
      />

      <ConsolePrimaryNav
        activePrimaryNav={activePrimaryNav}
        onPrimaryNavChange={setActivePrimaryNav}
      />

      <section className="console-main-canvas" aria-label="Main content canvas">
        <div className={`workspace-shell${isAgentsSidebarVisible ? "" : " workspace-shell--full"}`}>
          {isAgentsSidebarVisible && (
            <ActiveAgentsSidebar
              claudeUsageSnapshot={claudeUsageSnapshot}
              claudeUsageStatus={claudeUsageSnapshot?.status ?? "loading"}
              columns={columns}
              codexUsageSnapshot={codexUsageSnapshot}
              codexUsageStatus={codexUsageSnapshot?.status ?? "loading"}
              isLoading={isLoading}
              loadError={loadError}
              sidebarWidth={sidebarWidth}
              onSidebarWidthChange={(width) => {
                setSidebarWidth(clampSidebarWidth(width));
              }}
              isActiveAgentsSectionExpanded={isActiveAgentsSectionExpanded}
              onActiveAgentsSectionExpandedChange={setIsActiveAgentsSectionExpanded}
              isClaudeUsageVisible={isClaudeUsageVisible}
              isClaudeUsageSectionExpanded={isClaudeUsageSectionExpanded}
              isCodexUsageVisible={isCodexUsageVisible}
              onClaudeUsageSectionExpandedChange={setIsClaudeUsageSectionExpanded}
              isCodexUsageSectionExpanded={isCodexUsageSectionExpanded}
              onCodexUsageSectionExpandedChange={setIsCodexUsageSectionExpanded}
              tentacleStates={tentacleStates}
              minimizedTentacleIds={minimizedTentacleIds}
              onMaximizeTentacle={handleMaximizeTentacle}
              actionPanel={sidebarActionPanel}
            />
          )}

          {isGitHubPrimaryView ? (
            <GitHubPrimaryView
              activeGitHubSubtab={activeGitHubSubtab}
              githubCommitCount30d={githubCommitCount30d}
              githubOpenIssuesLabel={githubOpenIssuesLabel}
              githubOpenPrsLabel={githubOpenPrsLabel}
              githubOverviewGraphPolylinePoints={githubOverviewGraphPolylinePoints}
              githubOverviewGraphSeries={githubOverviewGraphSeries}
              githubOverviewHoverLabel={githubOverviewHoverLabel}
              githubRepoLabel={githubRepoLabel}
              githubStarCountLabel={githubStarCountLabel}
              githubStatusPill={githubStatusPill}
              hoveredGitHubOverviewPointIndex={hoveredGitHubOverviewPointIndex}
              isRefreshingGitHubSummary={isRefreshingGitHubSummary}
              onGitHubSubtabChange={setActiveGitHubSubtab}
              onHoveredGitHubOverviewPointIndexChange={setHoveredGitHubOverviewPointIndex}
              onRefresh={() => {
                void refreshGitHubRepoSummary();
              }}
            />
          ) : isMonitorPrimaryView ? (
            <MonitorPrimaryView
              isRefreshingMonitorFeed={isRefreshingMonitorFeed}
              isSavingMonitorConfig={isSavingMonitorConfig}
              monitorConfig={monitorConfig}
              monitorError={monitorError}
              monitorFeed={monitorFeed}
              onPatchConfig={patchMonitorConfig}
              onRefresh={() => {
                void refreshMonitorFeed(true);
              }}
              onSyncFeed={() => {
                void refreshMonitorFeed(false);
              }}
            />
          ) : isSettingsPrimaryView ? (
            <SettingsPrimaryView
              isClaudeUsageVisible={isClaudeUsageVisible}
              isCodexUsageVisible={isCodexUsageVisible}
              onClaudeUsageVisibilityChange={setIsClaudeUsageVisible}
              onCodexUsageVisibilityChange={setIsCodexUsageVisible}
              onPreviewTentacleCompletionSound={playCompletionSoundPreview}
              onTentacleCompletionSoundChange={setTentacleCompletionSound}
              tentacleCompletionSound={tentacleCompletionSound}
            />
          ) : (
            <TentacleBoard
              columns={columns}
              editingTentacleId={editingTentacleId}
              gitStatusByTentacleId={gitStatusByTentacleId}
              gitStatusLoadingByTentacleId={gitStatusLoadingByTentacleId}
              pullRequestByTentacleId={pullRequestByTentacleId}
              pullRequestLoadingByTentacleId={pullRequestLoadingByTentacleId}
              isDeletingTentacleId={isDeletingTentacleId}
              isLoading={isLoading}
              loadError={loadError}
              onBeginTentacleNameEdit={beginTentacleNameEdit}
              onCancelTentacleRename={cancelTentacleRename}
              onMinimizeTentacle={handleMinimizeTentacle}
              onOpenTentacleGitActions={(tentacleId) => {
                setIsAgentsSidebarVisible(true);
                openTentacleGitActions(tentacleId);
              }}
              onRequestDeleteTentacle={(tentacleId, tentacleName, workspaceMode) => {
                setIsAgentsSidebarVisible(true);
                closeTentacleGitActions();
                requestDeleteTentacle(tentacleId, tentacleName, {
                  workspaceMode,
                  intent: "delete-tentacle",
                });
              }}
              onSubmitTentacleRename={(tentacleId, currentTentacleName) => {
                void submitTentacleRename(tentacleId, currentTentacleName);
              }}
              onTentacleDividerKeyDown={handleTentacleDividerKeyDown}
              onTentacleDividerPointerDown={handleTentacleDividerPointerDown}
              onTentacleHeaderWheel={handleTentacleHeaderWheel}
              onTentacleNameDraftChange={setTentacleNameDraft}
              onSelectTentacle={setSelectedTentacleId}
              onTentacleStateChange={handleTentacleStateChange}
              selectedTentacleId={selectedTentacleId}
              tentacleNameDraft={tentacleNameDraft}
              tentacleNameInputRef={tentacleNameInputRef}
              tentacleWidths={tentacleWidths}
              tentaclesRef={tentaclesRef}
              visibleColumns={visibleColumns}
            />
          )}
        </div>
      </section>

      <TelemetryTape monitorFeed={monitorFeed} />
    </div>
  );
};
