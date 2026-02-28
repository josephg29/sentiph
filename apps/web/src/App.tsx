import { buildTentacleColumns } from "@octogent/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  GITHUB_OVERVIEW_GRAPH_HEIGHT,
  GITHUB_OVERVIEW_GRAPH_WIDTH,
  GITHUB_SPARKLINE_HEIGHT,
  GITHUB_SPARKLINE_WIDTH,
  type GitHubSubtabId,
  PRIMARY_NAV_ITEMS,
  type PrimaryNavIndex,
} from "./app/constants";
import {
  buildGitHubCommitCount,
  buildGitHubCommitSeries,
  buildGitHubCommitSparkPoints,
  buildGitHubSparkPolylinePoints,
  buildGitHubStatusPill,
  formatGitHubCommitHoverLabel,
} from "./app/githubMetrics";
import { useCodexUsagePolling } from "./app/hooks/useCodexUsagePolling";
import { useGithubSummaryPolling } from "./app/hooks/useGithubSummaryPolling";
import { useMonitorRuntime } from "./app/hooks/useMonitorRuntime";
import { usePersistedUiState } from "./app/hooks/usePersistedUiState";
import { useTentacleBoardInteractions } from "./app/hooks/useTentacleBoardInteractions";
import { useTentacleMutations } from "./app/hooks/useTentacleMutations";
import { clampSidebarWidth } from "./app/normalizers";
import type { GitHubCommitSparkPoint, TentacleView } from "./app/types";
import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import type { CodexState } from "./components/CodexStateBadge";
import { DeleteTentacleDialog } from "./components/DeleteTentacleDialog";
import { GitHubPrimaryView } from "./components/GitHubPrimaryView";
import { MonitorPrimaryView } from "./components/MonitorPrimaryView";
import { RuntimeStatusStrip } from "./components/RuntimeStatusStrip";
import { TelemetryTape } from "./components/TelemetryTape";
import { TentacleBoard } from "./components/TentacleBoard";
import { ActionButton } from "./components/ui/ActionButton";
import { HttpAgentSnapshotReader } from "./runtime/HttpAgentSnapshotReader";
import { buildAgentSnapshotsUrl } from "./runtime/runtimeEndpoints";

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tentacleStates, setTentacleStates] = useState<Record<string, CodexState>>({});
  const [activePrimaryNav, setActivePrimaryNav] = useState<PrimaryNavIndex>(1);
  const [activeGitHubSubtab, setActiveGitHubSubtab] = useState<GitHubSubtabId>("overview");
  const [hoveredGitHubOverviewPointIndex, setHoveredGitHubOverviewPointIndex] = useState<
    number | null
  >(null);
  const [tickerQuery, setTickerQuery] = useState("MAIN");
  const tentaclesRef = useRef<HTMLElement | null>(null);
  const tentacleNameInputRef = useRef<HTMLInputElement | null>(null);
  const tickerInputRef = useRef<HTMLInputElement | null>(null);

  const {
    applyHydratedUiState,
    isActiveAgentsSectionExpanded,
    isAgentsSidebarVisible,
    isCodexUsageSectionExpanded,
    isUiStateHydrated,
    minimizedTentacleIds,
    readUiState,
    setIsActiveAgentsSectionExpanded,
    setIsAgentsSidebarVisible,
    setIsCodexUsageSectionExpanded,
    setIsUiStateHydrated,
    setMinimizedTentacleIds,
    setSidebarWidth,
    setTentacleWidths,
    sidebarWidth,
    tentacleWidths,
  } = usePersistedUiState({ columns });

  const visibleColumns = useMemo(
    () => columns.filter((column) => !minimizedTentacleIds.includes(column.tentacleId)),
    [columns, minimizedTentacleIds],
  );

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

  useEffect(() => {
    const controller = new AbortController();

    const syncColumns = async () => {
      try {
        setLoadError(null);
        const [nextColumns, nextUiState] = await Promise.all([
          readColumns(controller.signal),
          readUiState(controller.signal),
        ]);
        setColumns(nextColumns);
        applyHydratedUiState(nextUiState, nextColumns);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setColumns([]);
          setLoadError("Agent data is currently unavailable.");
        }
      } finally {
        setIsLoading(false);
        setIsUiStateHydrated(true);
      }
    };

    void syncColumns();
    return () => {
      controller.abort();
    };
  }, [applyHydratedUiState, readColumns, readUiState, setIsUiStateHydrated]);

  const codexUsageSnapshot = useCodexUsagePolling();
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

  useEffect(() => {
    if (!editingTentacleId) {
      return;
    }

    if (!columns.some((column) => column.tentacleId === editingTentacleId)) {
      setEditingTentacleId(null);
      return;
    }

    const input = tentacleNameInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, [columns, editingTentacleId, setEditingTentacleId]);

  useEffect(() => {
    const activeTentacleIds = new Set(columns.map((column) => column.tentacleId));
    setMinimizedTentacleIds((current) => {
      const next = current.filter((tentacleId) => activeTentacleIds.has(tentacleId));
      return next.length === current.length ? current : next;
    });
    setTentacleStates((current) => {
      const retainedStates = Object.entries(current).filter(([tentacleId]) =>
        activeTentacleIds.has(tentacleId),
      );
      if (retainedStates.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(retainedStates);
    });
  }, [columns, setMinimizedTentacleIds]);
  const {
    monitorConfig,
    monitorFeed,
    monitorError,
    isRefreshingMonitorFeed,
    isSavingMonitorConfig,
    refreshMonitorFeed,
    patchMonitorConfig,
  } = useMonitorRuntime();

  const activeNavItem = useMemo(
    () => PRIMARY_NAV_ITEMS.find((item) => item.index === activePrimaryNav) ?? PRIMARY_NAV_ITEMS[1],
    [activePrimaryNav],
  );
  const normalizedTicker = useMemo(() => {
    const trimmed = tickerQuery.trim().toUpperCase();
    return trimmed.length > 0 ? trimmed : "----";
  }, [tickerQuery]);
  const githubCommitSeries = useMemo(
    () => buildGitHubCommitSeries(githubRepoSummary),
    [githubRepoSummary],
  );
  const githubCommitCount30d = useMemo(
    () => buildGitHubCommitCount(githubCommitSeries),
    [githubCommitSeries],
  );
  const sparklineSeries = useMemo<GitHubCommitSparkPoint[]>(
    () =>
      buildGitHubCommitSparkPoints(
        githubCommitSeries,
        GITHUB_SPARKLINE_WIDTH,
        GITHUB_SPARKLINE_HEIGHT,
      ),
    [githubCommitSeries],
  );
  const sparklinePoints = useMemo(
    () => buildGitHubSparkPolylinePoints(sparklineSeries),
    [sparklineSeries],
  );
  const githubOverviewGraphSeries = useMemo<GitHubCommitSparkPoint[]>(
    () =>
      buildGitHubCommitSparkPoints(
        githubCommitSeries,
        GITHUB_OVERVIEW_GRAPH_WIDTH,
        GITHUB_OVERVIEW_GRAPH_HEIGHT,
      ),
    [githubCommitSeries],
  );
  const githubOverviewGraphPolylinePoints = useMemo(
    () => buildGitHubSparkPolylinePoints(githubOverviewGraphSeries),
    [githubOverviewGraphSeries],
  );
  const hoveredGitHubOverviewPoint = useMemo(() => {
    if (hoveredGitHubOverviewPointIndex === null) {
      return null;
    }
    return githubOverviewGraphSeries[hoveredGitHubOverviewPointIndex] ?? null;
  }, [githubOverviewGraphSeries, hoveredGitHubOverviewPointIndex]);
  const githubOverviewHoverLabel = useMemo(() => {
    if (hoveredGitHubOverviewPoint) {
      return formatGitHubCommitHoverLabel(hoveredGitHubOverviewPoint);
    }

    return "Hover points for date and commit count";
  }, [hoveredGitHubOverviewPoint]);
  const isGitHubPrimaryView = activePrimaryNav === 3;
  const isMonitorPrimaryView = activePrimaryNav === 4;
  const githubStatusPill = useMemo(
    () => buildGitHubStatusPill(githubRepoSummary),
    [githubRepoSummary],
  );

  useEffect(() => {
    if (hoveredGitHubOverviewPointIndex === null) {
      return;
    }
    if (hoveredGitHubOverviewPointIndex >= githubOverviewGraphSeries.length) {
      setHoveredGitHubOverviewPointIndex(null);
    }
  }, [githubOverviewGraphSeries.length, hoveredGitHubOverviewPointIndex]);

  useEffect(() => {
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (/^[0-6]$/.test(event.key)) {
        setActivePrimaryNav(Number.parseInt(event.key, 10) as PrimaryNavIndex);
        event.preventDefault();
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        tickerInputRef.current?.focus();
        tickerInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, []);

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

  const githubRepoLabel = githubRepoSummary?.repo ?? "GitHub repository";
  const githubStarCountLabel =
    githubRepoSummary?.stargazerCount !== null && githubRepoSummary?.stargazerCount !== undefined
      ? Math.round(githubRepoSummary.stargazerCount).toLocaleString("en-US")
      : "--";
  const githubOpenIssuesLabel =
    githubRepoSummary?.openIssueCount !== null && githubRepoSummary?.openIssueCount !== undefined
      ? Math.round(githubRepoSummary.openIssueCount).toString()
      : "--";
  const githubOpenPrsLabel =
    githubRepoSummary?.openPullRequestCount !== null &&
    githubRepoSummary?.openPullRequestCount !== undefined
      ? Math.round(githubRepoSummary.openPullRequestCount).toString()
      : "--";

  return (
    <div className="page console-shell">
      <header className="chrome">
        <div className="chrome-left">
          <button
            aria-label={
              isAgentsSidebarVisible ? "Hide Active Agents sidebar" : "Show Active Agents sidebar"
            }
            className="chrome-sidebar-toggle"
            data-active={isAgentsSidebarVisible ? "true" : "false"}
            onClick={() => {
              setIsAgentsSidebarVisible((current) => !current);
            }}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="chrome-sidebar-toggle-icon"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                fill="none"
                height="12"
                stroke="currentColor"
                strokeWidth="1.5"
                width="12"
                x="2"
                y="2"
              />
              <rect height="12" width="6" x="2" y="2" />
            </svg>
          </button>
          <h1>Octogent Engineering Console</h1>
        </div>

        <div className="chrome-brand">{`${normalizedTicker} | ${activeNavItem.label.toUpperCase()}`}</div>

        <div className="chrome-right">
          <span className="console-platform-label">Agent Runtime</span>
          <span className="console-live-indicator">
            <span className="console-live-dot" aria-hidden="true" />
            LIVE
          </span>
          <ActionButton
            aria-label="Create tentacle in main codebase"
            className="chrome-create-tentacle chrome-create-tentacle--shared"
            disabled={isCreatingTentacle}
            onClick={() => {
              setLoadError(null);
              void createTentacle("shared");
            }}
            size="dense"
            variant="primary"
          >
            {isCreatingTentacle ? "Creating..." : "+ Main Tentacle"}
          </ActionButton>
          <ActionButton
            aria-label="Create tentacle with isolated worktree"
            className="chrome-create-tentacle chrome-create-tentacle--worktree"
            disabled={isCreatingTentacle}
            onClick={() => {
              setLoadError(null);
              void createTentacle("worktree");
            }}
            size="dense"
            variant="info"
          >
            {isCreatingTentacle ? "Creating..." : "+ Worktree Tentacle"}
          </ActionButton>
        </div>
      </header>

      <RuntimeStatusStrip
        githubCommitCount30d={githubCommitCount30d}
        githubOpenIssuesLabel={githubOpenIssuesLabel}
        githubOpenPrsLabel={githubOpenPrsLabel}
        githubRepoLabel={githubRepoLabel}
        githubStarCountLabel={githubStarCountLabel}
        githubStatusPill={githubStatusPill}
        sparklinePoints={sparklinePoints}
      />

      <nav className="console-primary-nav" aria-label="Primary navigation">
        <div className="console-primary-nav-tabs">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <button
              aria-current={item.index === activePrimaryNav ? "page" : undefined}
              className="console-primary-nav-tab"
              data-active={item.index === activePrimaryNav ? "true" : "false"}
              key={item.index}
              onClick={() => {
                setActivePrimaryNav(item.index);
              }}
              type="button"
            >
              [{item.index}] {item.label}
            </button>
          ))}
        </div>
        <p className="console-primary-nav-hint">Press 0-6 to navigate · Type context to search</p>
      </nav>

      <section className="console-main-canvas" aria-label="Main content canvas">
        <div className="console-canvas-controls">
          <label className="console-context-label" htmlFor="console-context-input">
            Context
          </label>
          <input
            id="console-context-input"
            ref={tickerInputRef}
            aria-label="Context search input"
            autoComplete="off"
            className="console-context-input"
            onChange={(event) => {
              setTickerQuery(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9._/-]/g, "")
                  .slice(0, 16),
              );
            }}
            placeholder="Type agent, repo, or branch..."
            type="text"
            value={tickerQuery}
          />
          <div className="console-page-chips" aria-hidden="true">
            <span className="console-chip console-chip--active">{activeNavItem.label}</span>
            <span className="console-chip">1D</span>
            <span className="console-chip">1H</span>
            <span className="console-chip">6H</span>
            <span className="console-chip">24H</span>
          </div>
        </div>

        <div className={`workspace-shell${isAgentsSidebarVisible ? "" : " workspace-shell--full"}`}>
          {isAgentsSidebarVisible && (
            <ActiveAgentsSidebar
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
              isCodexUsageSectionExpanded={isCodexUsageSectionExpanded}
              onCodexUsageSectionExpandedChange={setIsCodexUsageSectionExpanded}
              tentacleStates={tentacleStates}
              minimizedTentacleIds={minimizedTentacleIds}
              onMaximizeTentacle={handleMaximizeTentacle}
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
            />
          ) : (
            <TentacleBoard
              columns={columns}
              editingTentacleId={editingTentacleId}
              isDeletingTentacleId={isDeletingTentacleId}
              isLoading={isLoading}
              loadError={loadError}
              onBeginTentacleNameEdit={beginTentacleNameEdit}
              onCancelTentacleRename={cancelTentacleRename}
              onMinimizeTentacle={handleMinimizeTentacle}
              onRequestDeleteTentacle={requestDeleteTentacle}
              onSubmitTentacleRename={(tentacleId, currentTentacleName) => {
                void submitTentacleRename(tentacleId, currentTentacleName);
              }}
              onTentacleDividerKeyDown={handleTentacleDividerKeyDown}
              onTentacleDividerPointerDown={handleTentacleDividerPointerDown}
              onTentacleHeaderWheel={handleTentacleHeaderWheel}
              onTentacleNameDraftChange={setTentacleNameDraft}
              onTentacleStateChange={handleTentacleStateChange}
              tentacleNameDraft={tentacleNameDraft}
              tentacleNameInputRef={tentacleNameInputRef}
              tentacleWidths={tentacleWidths}
              tentaclesRef={tentaclesRef}
              visibleColumns={visibleColumns}
            />
          )}
        </div>
      </section>

      <TelemetryTape />

      {pendingDeleteTentacle && (
        <DeleteTentacleDialog
          isDeletingTentacleId={isDeletingTentacleId}
          onCancel={clearPendingDeleteTentacle}
          onConfirmDelete={() => {
            void confirmDeleteTentacle();
          }}
          pendingDeleteTentacle={pendingDeleteTentacle}
        />
      )}
    </div>
  );
};
