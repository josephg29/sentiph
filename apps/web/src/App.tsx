import { buildTentacleColumns } from "@octogent/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PRIMARY_NAV_ITEMS, type PrimaryNavIndex } from "./app/constants";
import { useBackendLivenessPolling } from "./app/hooks/useBackendLivenessPolling";
import { useClaudeUsagePolling } from "./app/hooks/useClaudeUsagePolling";
import { useCodexUsagePolling } from "./app/hooks/useCodexUsagePolling";
import { useConsoleKeyboardShortcuts } from "./app/hooks/useConsoleKeyboardShortcuts";
import { useConversationsRuntime } from "./app/hooks/useConversationsRuntime";
import { useGitHubPrimaryViewModel } from "./app/hooks/useGitHubPrimaryViewModel";
import { useGithubSummaryPolling } from "./app/hooks/useGithubSummaryPolling";
import { useInitialColumnsHydration } from "./app/hooks/useInitialColumnsHydration";
import { useMonitorRuntime } from "./app/hooks/useMonitorRuntime";
import { usePersistedUiState } from "./app/hooks/usePersistedUiState";
import { useTentacleBoardInteractions } from "./app/hooks/useTentacleBoardInteractions";
import { useTentacleCompletionNotification } from "./app/hooks/useTentacleCompletionNotification";
import { useTentacleGitLifecycle } from "./app/hooks/useTentacleGitLifecycle";
import { useTentacleMutations } from "./app/hooks/useTentacleMutations";
import { useTentacleNameInputFocus } from "./app/hooks/useTentacleNameInputFocus";
import { useTentacleStateReconciliation } from "./app/hooks/useTentacleStateReconciliation";
import { clampSidebarWidth } from "./app/normalizers";
import type { TentacleView } from "./app/types";
import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import type { CodexState } from "./components/CodexStateBadge";
import { ConsoleHeader } from "./components/ConsoleHeader";
import { ConsolePrimaryNav } from "./components/ConsolePrimaryNav";
import { ConversationsPrimaryView } from "./components/ConversationsPrimaryView";
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

const isInternalRootTerminal = (tentacleId: string, agentId: string) =>
  agentId === `${tentacleId}-root`;

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tentacleStates, setTentacleStates] = useState<Record<string, CodexState>>({});
  const [selectedTentacleId, setSelectedTentacleId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [activePrimaryNav, setActivePrimaryNav] = useState<PrimaryNavIndex>(0);
  const [hoveredGitHubOverviewPointIndex, setHoveredGitHubOverviewPointIndex] = useState<
    number | null
  >(null);
  const tentaclesRef = useRef<HTMLElement | null>(null);
  const tentacleNameInputRef = useRef<HTMLInputElement | null>(null);

  const {
    applyHydratedUiState,
    isActiveAgentsSectionExpanded,
    isAgentsSidebarVisible,
    isBottomTelemetryVisible,
    isClaudeUsageVisible,
    isClaudeUsageSectionExpanded,
    isCodexUsageVisible,
    isCodexUsageSectionExpanded,
    isMonitorVisible,
    isRuntimeStatusStripVisible,
    isUiStateHydrated,
    minimizedTentacleIds,
    readUiState,
    setIsActiveAgentsSectionExpanded,
    setIsAgentsSidebarVisible,
    setIsBottomTelemetryVisible,
    setIsClaudeUsageVisible,
    setIsClaudeUsageSectionExpanded,
    setIsCodexUsageVisible,
    setIsCodexUsageSectionExpanded,
    setIsMonitorVisible,
    setIsRuntimeStatusStripVisible,
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
      if (currentSelectedTentacleId !== null && visibleTentacleIds.has(currentSelectedTentacleId)) {
        return currentSelectedTentacleId;
      }

      return visibleColumns[0]?.tentacleId ?? null;
    });
  }, [visibleColumns]);

  useEffect(() => {
    const firstVisibleTerminalId =
      visibleColumns
        .flatMap((column) =>
          column.agents
            .filter((agent) => !isInternalRootTerminal(column.tentacleId, agent.agentId))
            .map((agent) => agent.agentId),
        )
        .at(0) ?? null;

    const selectedTentacleVisibleTerminalIds =
      selectedTentacleId === null
        ? []
        : (visibleColumns
            .find((column) => column.tentacleId === selectedTentacleId)
            ?.agents.filter((agent) => !isInternalRootTerminal(selectedTentacleId, agent.agentId))
            .map((agent) => agent.agentId) ?? []);

    setSelectedTerminalId((currentSelectedTerminalId) => {
      if (selectedTentacleVisibleTerminalIds.length > 0) {
        if (
          currentSelectedTerminalId !== null &&
          selectedTentacleVisibleTerminalIds.includes(currentSelectedTerminalId)
        ) {
          return currentSelectedTerminalId;
        }
        return selectedTentacleVisibleTerminalIds[0] ?? null;
      }

      const activeVisibleTerminalIds = new Set(
        visibleColumns.flatMap((column) =>
          column.agents
            .filter((agent) => !isInternalRootTerminal(column.tentacleId, agent.agentId))
            .map((agent) => agent.agentId),
        ),
      );
      if (
        currentSelectedTerminalId !== null &&
        activeVisibleTerminalIds.has(currentSelectedTerminalId)
      ) {
        return currentSelectedTerminalId;
      }

      return firstVisibleTerminalId;
    });
  }, [selectedTentacleId, visibleColumns]);

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
    createTentacleAgent,
    deleteTentacleAgent,
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
  } = useMonitorRuntime({
    enabled: isUiStateHydrated && isMonitorVisible,
  });
  const {
    sessions: conversationSessions,
    selectedSessionId,
    selectedSession,
    isLoadingSessions: isLoadingConversationSessions,
    isLoadingSelectedSession,
    isExporting: isExportingConversation,
    errorMessage: conversationsErrorMessage,
    selectSession,
    refreshSessions,
    exportSession,
  } = useConversationsRuntime({
    enabled: isUiStateHydrated && activePrimaryNav === 4,
  });

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
    githubRecentCommits,
  } = useGitHubPrimaryViewModel({
    githubRepoSummary,
    hoveredGitHubOverviewPointIndex,
    setHoveredGitHubOverviewPointIndex,
  });
  const isGitHubPrimaryView = activePrimaryNav === 1;
  const isMonitorPrimaryView = activePrimaryNav === 2;
  const isSettingsPrimaryView = activePrimaryNav === 3;
  const isConversationsPrimaryView = activePrimaryNav === 4;
  const openGitTentacleColumn =
    openGitTentacleId !== null
      ? columns.find((column) => column.tentacleId === openGitTentacleId)
      : null;
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

      {isRuntimeStatusStripVisible && (
        <RuntimeStatusStrip
          githubCommitCount30d={githubCommitCount30d}
          githubOpenIssuesLabel={githubOpenIssuesLabel}
          githubOpenPrsLabel={githubOpenPrsLabel}
          githubRepoLabel={githubRepoLabel}
          githubStarCountLabel={githubStarCountLabel}
          githubStatusPill={githubStatusPill}
          sparklinePoints={sparklinePoints}
        />
      )}

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
              githubCommitCount30d={githubCommitCount30d}
              githubOpenIssuesLabel={githubOpenIssuesLabel}
              githubOpenPrsLabel={githubOpenPrsLabel}
              githubRecentCommits={githubRecentCommits}
              githubOverviewGraphPolylinePoints={githubOverviewGraphPolylinePoints}
              githubOverviewGraphSeries={githubOverviewGraphSeries}
              githubOverviewHoverLabel={githubOverviewHoverLabel}
              githubRepoLabel={githubRepoLabel}
              githubStarCountLabel={githubStarCountLabel}
              githubStatusPill={githubStatusPill}
              hoveredGitHubOverviewPointIndex={hoveredGitHubOverviewPointIndex}
              isRefreshingGitHubSummary={isRefreshingGitHubSummary}
              onHoveredGitHubOverviewPointIndexChange={setHoveredGitHubOverviewPointIndex}
              onRefresh={() => {
                void refreshGitHubRepoSummary();
              }}
            />
          ) : isMonitorPrimaryView ? (
            isMonitorVisible ? (
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
            ) : (
              <section className="monitor-view" aria-label="Monitor primary view disabled">
                <section className="monitor-panel monitor-panel--configure">
                  <h3>Monitor is disabled</h3>
                  <p>Enable Monitor workspace view in Settings to restore this panel.</p>
                </section>
              </section>
            )
          ) : isSettingsPrimaryView ? (
            <SettingsPrimaryView
              isBottomTelemetryVisible={isBottomTelemetryVisible}
              isClaudeUsageVisible={isClaudeUsageVisible}
              isCodexUsageVisible={isCodexUsageVisible}
              isMonitorVisible={isMonitorVisible}
              isRuntimeStatusStripVisible={isRuntimeStatusStripVisible}
              onBottomTelemetryVisibilityChange={setIsBottomTelemetryVisible}
              onClaudeUsageVisibilityChange={setIsClaudeUsageVisible}
              onCodexUsageVisibilityChange={setIsCodexUsageVisible}
              onMonitorVisibilityChange={setIsMonitorVisible}
              onRuntimeStatusStripVisibilityChange={setIsRuntimeStatusStripVisible}
              onPreviewTentacleCompletionSound={playCompletionSoundPreview}
              onTentacleCompletionSoundChange={setTentacleCompletionSound}
              tentacleCompletionSound={tentacleCompletionSound}
            />
          ) : isConversationsPrimaryView ? (
            <ConversationsPrimaryView
              errorMessage={conversationsErrorMessage}
              isExporting={isExportingConversation}
              isLoadingSelectedSession={isLoadingSelectedSession}
              isLoadingSessions={isLoadingConversationSessions}
              onExport={(format) => {
                if (!selectedSessionId) {
                  return;
                }

                void exportSession(selectedSessionId, format).then((result) => {
                  if (!result) {
                    return;
                  }

                  const blob = new Blob([result.content], { type: result.contentType });
                  const objectUrl = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = objectUrl;
                  anchor.download = result.filename;
                  document.body.append(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(objectUrl);
                });
              }}
              onRefresh={() => {
                void refreshSessions();
              }}
              onSelectSession={selectSession}
              selectedSession={selectedSession}
              selectedSessionId={selectedSessionId}
              sessions={conversationSessions}
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
              onSelectTerminal={setSelectedTerminalId}
              onTentacleStateChange={handleTentacleStateChange}
              onCreateTentacleAgent={(tentacleId, anchorAgentId, placement) => {
                void createTentacleAgent({
                  tentacleId,
                  anchorAgentId,
                  placement,
                });
              }}
              onDeleteTentacleAgent={(tentacleId, agentId) => {
                void deleteTentacleAgent({
                  tentacleId,
                  agentId,
                });
              }}
              selectedTentacleId={selectedTentacleId}
              selectedTerminalId={selectedTerminalId}
              tentacleNameDraft={tentacleNameDraft}
              tentacleNameInputRef={tentacleNameInputRef}
              tentacleWidths={tentacleWidths}
              tentaclesRef={tentaclesRef}
              visibleColumns={visibleColumns}
            />
          )}
        </div>
      </section>

      {isMonitorVisible && isBottomTelemetryVisible && <TelemetryTape monitorFeed={monitorFeed} />}
    </div>
  );
};
