import { buildTentacleColumns } from "@octogent/core";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import type { CodexState } from "./components/CodexStateBadge";
import { EmptyOctopus } from "./components/EmptyOctopus";
import { TentacleTerminal } from "./components/TentacleTerminal";
import { ActionButton } from "./components/ui/ActionButton";
import {
  TENTACLE_DIVIDER_WIDTH,
  TENTACLE_MIN_WIDTH,
  TENTACLE_RESIZE_STEP,
  reconcileTentacleWidths,
  resizeTentaclePair,
} from "./layout/tentaclePaneSizing";
import { HttpAgentSnapshotReader } from "./runtime/HttpAgentSnapshotReader";
import {
  buildAgentSnapshotsUrl,
  buildCodexUsageUrl,
  buildGithubSummaryUrl,
  buildTentacleRenameUrl,
  buildTentaclesUrl,
  buildUiStateUrl,
} from "./runtime/runtimeEndpoints";

type TentacleView = Awaited<ReturnType<typeof buildTentacleColumns>>;
type CodexUsageSnapshot = {
  status: "ok" | "unavailable" | "error";
  fetchedAt: string;
  source: "oauth-api" | "none";
  message?: string | null;
  planType?: string | null;
  primaryUsedPercent?: number | null;
  secondaryUsedPercent?: number | null;
  creditsBalance?: number | null;
  creditsUnlimited?: boolean | null;
};

type GitHubCommitPoint = {
  date: string;
  count: number;
};

type GitHubCommitSparkPoint = GitHubCommitPoint & {
  x: number;
  y: number;
};

type GitHubRepoSummarySnapshot = {
  status: "ok" | "unavailable" | "error";
  fetchedAt: string;
  source: "gh-cli" | "none";
  message?: string | null;
  repo?: string | null;
  stargazerCount?: number | null;
  openIssueCount?: number | null;
  openPullRequestCount?: number | null;
  commitsPerDay?: GitHubCommitPoint[];
};

const CODEX_USAGE_SCAN_INTERVAL_MS = 60_000;
const GITHUB_SUMMARY_SCAN_INTERVAL_MS = 60_000;
const UI_STATE_SAVE_DEBOUNCE_MS = 250;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = MIN_SIDEBAR_WIDTH;
const PRIMARY_NAV_ITEMS = [
  { index: 0, label: "Board" },
  { index: 1, label: "Agents" },
  { index: 2, label: "Sessions" },
  { index: 3, label: "GitHub" },
  { index: 4, label: "Pipelines" },
  { index: 5, label: "Logs" },
  { index: 6, label: "Settings" },
] as const;
const GITHUB_SUBTABS = [{ id: "overview", label: "Overview" }] as const;
const TELEMETRY_TAPE_ITEMS = [
  { symbol: "QUEUE", change: 1.92 },
  { symbol: "CPU", change: -0.37 },
  { symbol: "TOKENS", change: 0.66 },
  { symbol: "LATENCY", change: -2.12 },
  { symbol: "WORKTREE", change: 0.73 },
  { symbol: "RETRIES", change: 1.31 },
  { symbol: "ERRORS", change: -0.44 },
  { symbol: "THROUGHPUT", change: 0.29 },
] as const;
const GITHUB_COMMIT_SERIES_LENGTH = 30;
const GITHUB_SPARKLINE_WIDTH = 148;
const GITHUB_SPARKLINE_HEIGHT = 36;
const GITHUB_OVERVIEW_GRAPH_WIDTH = 640;
const GITHUB_OVERVIEW_GRAPH_HEIGHT = 180;

type PrimaryNavIndex = (typeof PRIMARY_NAV_ITEMS)[number]["index"];
type GitHubSubtabId = (typeof GITHUB_SUBTABS)[number]["id"];

type FrontendUiStateSnapshot = {
  isAgentsSidebarVisible?: boolean;
  sidebarWidth?: number;
  isActiveAgentsSectionExpanded?: boolean;
  isCodexUsageSectionExpanded?: boolean;
  minimizedTentacleIds?: string[];
  tentacleWidths?: Record<string, number>;
};

type TentacleWorkspaceMode = "shared" | "worktree";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const formatGitHubCommitHoverLabel = (point: GitHubCommitPoint) => {
  if (point.date.startsWith("n/a-")) {
    return point.count === 1 ? "No date · 1 commit" : `No date · ${point.count} commits`;
  }

  return point.count === 1
    ? `${point.date} · 1 commit`
    : `${point.date} · ${point.count} commits`;
};

const clampSidebarWidth = (width: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

const normalizeCodexUsageSnapshot = (value: unknown): CodexUsageSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = record.status;
  if (status !== "ok" && status !== "unavailable" && status !== "error") {
    return null;
  }

  const source = record.source === "oauth-api" ? "oauth-api" : "none";
  return {
    status,
    source,
    fetchedAt: asString(record.fetchedAt) ?? new Date().toISOString(),
    message: asString(record.message),
    planType: asString(record.planType),
    primaryUsedPercent: asNumber(record.primaryUsedPercent),
    secondaryUsedPercent: asNumber(record.secondaryUsedPercent),
    creditsBalance: asNumber(record.creditsBalance),
    creditsUnlimited: typeof record.creditsUnlimited === "boolean" ? record.creditsUnlimited : null,
  };
};

const normalizeGitHubCommitPoint = (value: unknown): GitHubCommitPoint | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const date = asString(record.date);
  const count = asNumber(record.count);
  if (!date || count === null) {
    return null;
  }

  return {
    date,
    count: Math.max(0, Math.round(count)),
  };
};

const normalizeGitHubRepoSummarySnapshot = (value: unknown): GitHubRepoSummarySnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = record.status;
  if (status !== "ok" && status !== "unavailable" && status !== "error") {
    return null;
  }

  const rawCommitsPerDay = Array.isArray(record.commitsPerDay) ? record.commitsPerDay : [];
  const commitsPerDay = rawCommitsPerDay
    .map((point) => normalizeGitHubCommitPoint(point))
    .filter((point): point is GitHubCommitPoint => point !== null);

  return {
    status,
    source: record.source === "gh-cli" ? "gh-cli" : "none",
    fetchedAt: asString(record.fetchedAt) ?? new Date().toISOString(),
    message: asString(record.message),
    repo: asString(record.repo),
    stargazerCount: asNumber(record.stargazerCount),
    openIssueCount: asNumber(record.openIssueCount),
    openPullRequestCount: asNumber(record.openPullRequestCount),
    commitsPerDay,
  };
};

const normalizeFrontendUiStateSnapshot = (value: unknown): FrontendUiStateSnapshot | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const nextState: FrontendUiStateSnapshot = {};
  if (typeof record.isAgentsSidebarVisible === "boolean") {
    nextState.isAgentsSidebarVisible = record.isAgentsSidebarVisible;
  }

  if (typeof record.sidebarWidth === "number" && Number.isFinite(record.sidebarWidth)) {
    nextState.sidebarWidth = clampSidebarWidth(record.sidebarWidth);
  }

  if (typeof record.isActiveAgentsSectionExpanded === "boolean") {
    nextState.isActiveAgentsSectionExpanded = record.isActiveAgentsSectionExpanded;
  }

  if (typeof record.isCodexUsageSectionExpanded === "boolean") {
    nextState.isCodexUsageSectionExpanded = record.isCodexUsageSectionExpanded;
  }

  if (Array.isArray(record.minimizedTentacleIds)) {
    nextState.minimizedTentacleIds = [...new Set(record.minimizedTentacleIds)].filter(
      (tentacleId): tentacleId is string => typeof tentacleId === "string",
    );
  }

  const rawTentacleWidths = asRecord(record.tentacleWidths);
  if (rawTentacleWidths) {
    nextState.tentacleWidths = Object.entries(rawTentacleWidths).reduce<Record<string, number>>(
      (acc, [tentacleId, width]) => {
        if (typeof width === "number" && Number.isFinite(width)) {
          acc[tentacleId] = width;
        }
        return acc;
      },
      {},
    );
  }

  return nextState;
};

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAgentsSidebarVisible, setIsAgentsSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isActiveAgentsSectionExpanded, setIsActiveAgentsSectionExpanded] = useState(true);
  const [isCodexUsageSectionExpanded, setIsCodexUsageSectionExpanded] = useState(true);
  const [isUiStateHydrated, setIsUiStateHydrated] = useState(false);
  const [isCreatingTentacle, setIsCreatingTentacle] = useState(false);
  const [isDeletingTentacleId, setIsDeletingTentacleId] = useState<string | null>(null);
  const [pendingDeleteTentacle, setPendingDeleteTentacle] = useState<{
    tentacleId: string;
    tentacleName: string;
  } | null>(null);
  const [minimizedTentacleIds, setMinimizedTentacleIds] = useState<string[]>([]);
  const [editingTentacleId, setEditingTentacleId] = useState<string | null>(null);
  const [tentacleNameDraft, setTentacleNameDraft] = useState("");
  const [tentacleStates, setTentacleStates] = useState<Record<string, CodexState>>({});
  const [tentacleWidths, setTentacleWidths] = useState<Record<string, number>>({});
  const [tentacleViewportWidth, setTentacleViewportWidth] = useState<number | null>(null);
  const [codexUsageSnapshot, setCodexUsageSnapshot] = useState<CodexUsageSnapshot | null>(null);
  const [githubRepoSummary, setGithubRepoSummary] = useState<GitHubRepoSummarySnapshot | null>(null);
  const [isRefreshingGitHubSummary, setIsRefreshingGitHubSummary] = useState(false);
  const [activePrimaryNav, setActivePrimaryNav] = useState<PrimaryNavIndex>(1);
  const [activeGitHubSubtab, setActiveGitHubSubtab] = useState<GitHubSubtabId>("overview");
  const [hoveredGitHubOverviewPointIndex, setHoveredGitHubOverviewPointIndex] = useState<
    number | null
  >(null);
  const [tickerQuery, setTickerQuery] = useState("MAIN");
  const tentaclesRef = useRef<HTMLElement | null>(null);
  const tentacleNameInputRef = useRef<HTMLInputElement | null>(null);
  const tickerInputRef = useRef<HTMLInputElement | null>(null);
  const cancelTentacleNameSubmitRef = useRef(false);
  const githubSummaryInFlightRef = useRef(false);
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

  const readUiState = useCallback(async (signal?: AbortSignal) => {
    try {
      const requestOptions: {
        method: "GET";
        headers: { Accept: string };
        signal?: AbortSignal;
      } = {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      };
      if (signal) {
        requestOptions.signal = signal;
      }

      const response = await fetch(buildUiStateUrl(), requestOptions);

      if (!response.ok) {
        return null;
      }

      return normalizeFrontendUiStateSnapshot(await response.json());
    } catch {
      return null;
    }
  }, []);

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

        if (nextUiState) {
          if (nextUiState.isAgentsSidebarVisible !== undefined) {
            setIsAgentsSidebarVisible(nextUiState.isAgentsSidebarVisible);
          }

          if (nextUiState.sidebarWidth !== undefined) {
            setSidebarWidth(clampSidebarWidth(nextUiState.sidebarWidth));
          }

          if (nextUiState.isActiveAgentsSectionExpanded !== undefined) {
            setIsActiveAgentsSectionExpanded(nextUiState.isActiveAgentsSectionExpanded);
          }

          if (nextUiState.isCodexUsageSectionExpanded !== undefined) {
            setIsCodexUsageSectionExpanded(nextUiState.isCodexUsageSectionExpanded);
          }

          if (nextUiState.minimizedTentacleIds) {
            const activeTentacleIds = new Set(nextColumns.map((column) => column.tentacleId));
            setMinimizedTentacleIds(
              nextUiState.minimizedTentacleIds.filter((tentacleId) =>
                activeTentacleIds.has(tentacleId),
              ),
            );
          }

          if (nextUiState.tentacleWidths) {
            const activeTentacleIds = new Set(nextColumns.map((column) => column.tentacleId));
            setTentacleWidths(
              Object.entries(nextUiState.tentacleWidths).reduce<Record<string, number>>(
                (acc, [tentacleId, width]) => {
                  if (activeTentacleIds.has(tentacleId)) {
                    acc[tentacleId] = width;
                  }
                  return acc;
                },
                {},
              ),
            );
          }
        }
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
  }, [readColumns, readUiState]);

  useEffect(() => {
    if (!isUiStateHydrated) {
      return;
    }

    const activeTentacleIds = new Set(columns.map((column) => column.tentacleId));
    const payload: FrontendUiStateSnapshot = {
      isAgentsSidebarVisible,
      sidebarWidth: clampSidebarWidth(sidebarWidth),
      isActiveAgentsSectionExpanded,
      isCodexUsageSectionExpanded,
      minimizedTentacleIds: minimizedTentacleIds.filter((tentacleId) =>
        activeTentacleIds.has(tentacleId),
      ),
      tentacleWidths: Object.entries(tentacleWidths).reduce<Record<string, number>>(
        (acc, [tentacleId, width]) => {
          if (activeTentacleIds.has(tentacleId)) {
            acc[tentacleId] = width;
          }
          return acc;
        },
        {},
      ),
    };

    const timerId = window.setTimeout(() => {
      void fetch(buildUiStateUrl(), {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }, UI_STATE_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    columns,
    isActiveAgentsSectionExpanded,
    isAgentsSidebarVisible,
    isCodexUsageSectionExpanded,
    isUiStateHydrated,
    minimizedTentacleIds,
    sidebarWidth,
    tentacleWidths,
  ]);

  useEffect(() => {
    let isDisposed = false;
    let isInFlight = false;

    const syncCodexUsage = async () => {
      if (isDisposed || isInFlight) {
        return;
      }
      isInFlight = true;
      try {
        const response = await fetch(buildCodexUsageUrl(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Unable to read codex usage (${response.status})`);
        }

        const parsed = normalizeCodexUsageSnapshot(await response.json());
        if (!isDisposed) {
          setCodexUsageSnapshot(
            parsed ?? {
              status: "error",
              source: "none",
              fetchedAt: new Date().toISOString(),
            },
          );
        }
      } catch {
        if (!isDisposed) {
          setCodexUsageSnapshot({
            status: "error",
            source: "none",
            fetchedAt: new Date().toISOString(),
          });
        }
      } finally {
        isInFlight = false;
      }
    };

    void syncCodexUsage();
    const timerId = window.setInterval(() => {
      void syncCodexUsage();
    }, CODEX_USAGE_SCAN_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(timerId);
    };
  }, []);

  const refreshGitHubRepoSummary = useCallback(async () => {
    if (githubSummaryInFlightRef.current) {
      return;
    }

    githubSummaryInFlightRef.current = true;
    setIsRefreshingGitHubSummary(true);
    try {
      const response = await fetch(buildGithubSummaryUrl(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to read github summary (${response.status})`);
      }

      const parsed = normalizeGitHubRepoSummarySnapshot(await response.json());
      setGithubRepoSummary(
        parsed ?? {
          status: "error",
          source: "none",
          fetchedAt: new Date().toISOString(),
          message: "GitHub summary payload is invalid.",
          commitsPerDay: [],
        },
      );
    } catch {
      setGithubRepoSummary({
        status: "error",
        source: "none",
        fetchedAt: new Date().toISOString(),
        message: "Unable to read GitHub summary.",
        commitsPerDay: [],
      });
    } finally {
      githubSummaryInFlightRef.current = false;
      setIsRefreshingGitHubSummary(false);
    }
  }, []);

  useEffect(() => {
    void refreshGitHubRepoSummary();
    const timerId = window.setInterval(() => {
      void refreshGitHubRepoSummary();
    }, GITHUB_SUMMARY_SCAN_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [refreshGitHubRepoSummary]);

  useEffect(() => {
    if (!tentaclesRef.current) {
      return;
    }

    const measure = () => {
      const width = Math.floor(tentaclesRef.current?.getBoundingClientRect().width ?? 0);
      setTentacleViewportWidth(width > 0 ? width : null);
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(tentaclesRef.current);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const tentacleIds = visibleColumns.map((column) => column.tentacleId);
    const dividerTotalWidth = Math.max(0, tentacleIds.length - 1) * TENTACLE_DIVIDER_WIDTH;
    const paneViewportWidth =
      tentacleViewportWidth === null
        ? null
        : Math.max(0, tentacleViewportWidth - dividerTotalWidth);
    setTentacleWidths((currentWidths) =>
      reconcileTentacleWidths(currentWidths, tentacleIds, paneViewportWidth),
    );
  }, [tentacleViewportWidth, visibleColumns]);

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
  }, [columns, editingTentacleId]);

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
  }, [columns]);

  const activeNavItem = useMemo(
    () => PRIMARY_NAV_ITEMS.find((item) => item.index === activePrimaryNav) ?? PRIMARY_NAV_ITEMS[1],
    [activePrimaryNav],
  );
  const normalizedTicker = useMemo(() => {
    const trimmed = tickerQuery.trim().toUpperCase();
    return trimmed.length > 0 ? trimmed : "----";
  }, [tickerQuery]);
  const githubCommitSeries = useMemo(() => {
    const fallbackSeries = Array.from({ length: GITHUB_COMMIT_SERIES_LENGTH }, (_, index) => ({
      date: `n/a-${index}`,
      count: 0,
    }));

    if (!githubRepoSummary?.commitsPerDay || githubRepoSummary.commitsPerDay.length === 0) {
      return fallbackSeries;
    }

    const sorted = [...githubRepoSummary.commitsPerDay]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-GITHUB_COMMIT_SERIES_LENGTH);

    if (sorted.length === GITHUB_COMMIT_SERIES_LENGTH) {
      return sorted;
    }

    const missing = GITHUB_COMMIT_SERIES_LENGTH - sorted.length;
    return [...fallbackSeries.slice(0, missing), ...sorted];
  }, [githubRepoSummary]);
  const githubCommitCount30d = useMemo(
    () => githubCommitSeries.reduce((total, point) => total + point.count, 0),
    [githubCommitSeries],
  );
  const sparklineSeries = useMemo<GitHubCommitSparkPoint[]>(() => {
    const values = githubCommitSeries.map((point) => point.count);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = Math.max(1, maxValue - minValue);

    return githubCommitSeries.map((point, index) => {
      const x = (index / Math.max(1, githubCommitSeries.length - 1)) * GITHUB_SPARKLINE_WIDTH;
      const y =
        GITHUB_SPARKLINE_HEIGHT - ((point.count - minValue) / valueRange) * GITHUB_SPARKLINE_HEIGHT;
      return {
        date: point.date,
        count: point.count,
        x,
        y,
      };
    });
  }, [githubCommitSeries]);
  const sparklinePoints = useMemo(
    () => sparklineSeries.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
    [sparklineSeries],
  );
  const githubOverviewGraphSeries = useMemo<GitHubCommitSparkPoint[]>(() => {
    const values = githubCommitSeries.map((point) => point.count);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = Math.max(1, maxValue - minValue);

    return githubCommitSeries.map((point, index) => {
      const x =
        (index / Math.max(1, githubCommitSeries.length - 1)) * GITHUB_OVERVIEW_GRAPH_WIDTH;
      const y =
        GITHUB_OVERVIEW_GRAPH_HEIGHT -
        ((point.count - minValue) / valueRange) * GITHUB_OVERVIEW_GRAPH_HEIGHT;
      return {
        date: point.date,
        count: point.count,
        x,
        y,
      };
    });
  }, [githubCommitSeries]);
  const githubOverviewGraphPolylinePoints = useMemo(
    () =>
      githubOverviewGraphSeries
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(" "),
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
  const githubStatusPill = useMemo(() => {
    if (!githubRepoSummary) {
      return "GitHub loading";
    }

    if (githubRepoSummary.status === "ok") {
      return "GitHub live";
    }

    if (githubRepoSummary.status === "unavailable") {
      return "GitHub unavailable";
    }

    return "GitHub error";
  }, [githubRepoSummary]);

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

  const beginTentacleNameEdit = (tentacleId: string, currentTentacleName: string) => {
    setLoadError(null);
    setEditingTentacleId(tentacleId);
    setTentacleNameDraft(currentTentacleName);
  };

  const submitTentacleRename = async (tentacleId: string, currentTentacleName: string) => {
    if (cancelTentacleNameSubmitRef.current) {
      cancelTentacleNameSubmitRef.current = false;
      return;
    }

    const trimmedName = tentacleNameDraft.trim();
    if (trimmedName.length === 0) {
      setLoadError("Tentacle name cannot be empty.");
      return;
    }

    if (trimmedName === currentTentacleName) {
      setEditingTentacleId(null);
      return;
    }

    try {
      setLoadError(null);
      const response = await fetch(buildTentacleRenameUrl(tentacleId), {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        throw new Error(`Unable to rename tentacle (${response.status})`);
      }

      const nextColumns = await readColumns();
      setColumns(nextColumns);
      setEditingTentacleId(null);
    } catch {
      setLoadError("Unable to rename tentacle.");
    }
  };

  const handleCreateTentacle = async (workspaceMode: TentacleWorkspaceMode) => {
    try {
      setIsCreatingTentacle(true);
      setLoadError(null);
      const response = await fetch(buildTentaclesUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceMode }),
      });

      if (!response.ok) {
        throw new Error(`Unable to create tentacle (${response.status})`);
      }

      const createdSnapshot = (await response.json()) as {
        tentacleId?: unknown;
        tentacleName?: unknown;
      };
      const nextColumns = await readColumns();
      setColumns(nextColumns);

      const createdTentacleId =
        typeof createdSnapshot.tentacleId === "string" ? createdSnapshot.tentacleId : null;
      if (!createdTentacleId) {
        return;
      }

      const createdColumn = nextColumns.find((column) => column.tentacleId === createdTentacleId);
      const createdTentacleName =
        createdColumn?.tentacleName ??
        (typeof createdSnapshot.tentacleName === "string"
          ? createdSnapshot.tentacleName
          : createdTentacleId);
      setMinimizedTentacleIds((current) =>
        current.filter((tentacleId) => tentacleId !== createdTentacleId),
      );
      beginTentacleNameEdit(createdTentacleId, createdTentacleName);
    } catch {
      setLoadError("Unable to create a new tentacle.");
    } finally {
      setIsCreatingTentacle(false);
    }
  };

  const requestDeleteTentacle = (tentacleId: string, tentacleName: string) => {
    setLoadError(null);
    setPendingDeleteTentacle({ tentacleId, tentacleName });
  };

  const handleDeleteTentacle = async () => {
    if (!pendingDeleteTentacle) {
      return;
    }

    const { tentacleId } = pendingDeleteTentacle;
    try {
      setLoadError(null);
      setIsDeletingTentacleId(tentacleId);
      const response = await fetch(buildTentacleRenameUrl(tentacleId), {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to delete tentacle (${response.status})`);
      }

      if (editingTentacleId === tentacleId) {
        setEditingTentacleId(null);
        setTentacleNameDraft("");
      }
      setMinimizedTentacleIds((current) =>
        current.filter((currentTentacleId) => currentTentacleId !== tentacleId),
      );

      const nextColumns = await readColumns();
      setColumns(nextColumns);
      setPendingDeleteTentacle(null);
    } catch {
      setLoadError("Unable to delete tentacle.");
    } finally {
      setIsDeletingTentacleId(null);
    }
  };

  const handleMinimizeTentacle = (tentacleId: string) => {
    if (editingTentacleId === tentacleId) {
      setEditingTentacleId(null);
      setTentacleNameDraft("");
    }

    setMinimizedTentacleIds((current) => {
      if (current.includes(tentacleId)) {
        return current;
      }
      return [...current, tentacleId];
    });
  };

  const handleMaximizeTentacle = (tentacleId: string) => {
    setMinimizedTentacleIds((current) =>
      current.filter((currentTentacleId) => currentTentacleId !== tentacleId),
    );
  };

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

  const handleTentacleDividerPointerDown = (leftTentacleId: string, rightTentacleId: string) => {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startLeftWidth = tentacleWidths[leftTentacleId] ?? TENTACLE_MIN_WIDTH;
      const startRightWidth = tentacleWidths[rightTentacleId] ?? TENTACLE_MIN_WIDTH;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const resizedPair = resizeTentaclePair(
          {
            [leftTentacleId]: startLeftWidth,
            [rightTentacleId]: startRightWidth,
          },
          leftTentacleId,
          rightTentacleId,
          delta,
        );

        setTentacleWidths((current) => {
          const nextLeft = resizedPair[leftTentacleId] ?? startLeftWidth;
          const nextRight = resizedPair[rightTentacleId] ?? startRightWidth;
          if (current[leftTentacleId] === nextLeft && current[rightTentacleId] === nextRight) {
            return current;
          }

          return {
            ...current,
            [leftTentacleId]: nextLeft,
            [rightTentacleId]: nextRight,
          };
        });
      };

      const stopResize = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    };
  };

  const handleTentacleDividerKeyDown = (leftTentacleId: string, rightTentacleId: string) => {
    return (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      const delta = event.key === "ArrowRight" ? TENTACLE_RESIZE_STEP : -TENTACLE_RESIZE_STEP;
      setTentacleWidths((currentWidths) =>
        resizeTentaclePair(currentWidths, leftTentacleId, rightTentacleId, delta),
      );
    };
  };

  const handleTentacleHeaderWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (!event.target.closest(".tentacle-column-header")) {
      return;
    }

    const board = tentaclesRef.current;
    if (!board) {
      return;
    }

    const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
    if (!Number.isFinite(horizontalDelta) || horizontalDelta === 0) {
      return;
    }

    board.scrollLeft += horizontalDelta;
    event.preventDefault();
  };

  const renderTentacleWorkspaceLabel = (workspaceMode: TentacleWorkspaceMode) =>
    workspaceMode === "worktree" ? "WORKTREE" : "MAIN";
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
              void handleCreateTentacle("shared");
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
              void handleCreateTentacle("worktree");
            }}
            size="dense"
            variant="info"
          >
            {isCreatingTentacle ? "Creating..." : "+ Worktree Tentacle"}
          </ActionButton>
        </div>
      </header>

      <section className="console-status-strip" aria-label="Runtime status strip">
        <div className="console-status-main">
          <span className="console-status-symbol">{githubRepoLabel}</span>
          <span className="console-status-stars" aria-label={`GitHub stars ${githubStarCountLabel}`}>
            <svg aria-hidden="true" className="console-status-star-icon" viewBox="0 0 16 16">
              <path d="M8 .25l2.2 4.69 5.18.8-3.73 3.82.88 5.44L8 12.62 3.47 15l.88-5.44L.62 5.74l5.18-.8L8 .25z" />
            </svg>
            <strong className="console-status-metric">{githubStarCountLabel}</strong>
          </span>
          <span className="console-status-pill">{githubStatusPill}</span>
        </div>
        <div className="console-status-sparkline" aria-label="Commits per day over last 30 days">
          <div className="console-status-sparkline-chart">
            <svg viewBox={`0 0 ${GITHUB_SPARKLINE_WIDTH} ${GITHUB_SPARKLINE_HEIGHT}`} role="presentation">
              <polyline points={sparklinePoints} />
            </svg>
          </div>
          <span className="console-status-sparkline-label">COMMITS/DAY · LAST 30 DAYS</span>
        </div>
        <dl className="console-status-stats">
          <div>
            <dd>{githubOpenIssuesLabel}</dd>
            <dt>ISSUES</dt>
          </div>
          <div>
            <dd>{githubOpenPrsLabel}</dd>
            <dt>PRS</dt>
          </div>
          <div>
            <dd>{githubCommitCount30d}</dd>
            <dt>COMMITS 30D</dt>
          </div>
        </dl>
      </section>

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
                event.target.value.toUpperCase().replace(/[^A-Z0-9._/-]/g, "").slice(0, 16),
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
            <section className="github-view" aria-label="GitHub primary view">
            <nav className="github-subtabs" aria-label="GitHub subtabs">
              {GITHUB_SUBTABS.map((subtab) => (
                <button
                  aria-current={activeGitHubSubtab === subtab.id ? "page" : undefined}
                  className="github-subtab"
                  data-active={activeGitHubSubtab === subtab.id ? "true" : "false"}
                  key={subtab.id}
                  onClick={() => {
                    setActiveGitHubSubtab(subtab.id);
                  }}
                  type="button"
                >
                  {subtab.label}
                </button>
              ))}
            </nav>

            {activeGitHubSubtab === "overview" && (
              <section className="github-overview" aria-label="GitHub overview">
                <header className="github-overview-header">
                  <h2>{githubRepoLabel}</h2>
                  <div className="github-overview-header-actions">
                    <span className="console-status-pill">{githubStatusPill}</span>
                    <ActionButton
                      aria-label="Refresh GitHub overview data"
                      className="github-overview-refresh"
                      disabled={isRefreshingGitHubSummary}
                      onClick={() => {
                        void refreshGitHubRepoSummary();
                      }}
                      size="dense"
                      variant="accent"
                    >
                      {isRefreshingGitHubSummary ? "Refreshing..." : "Refresh"}
                    </ActionButton>
                  </div>
                </header>
                <dl className="github-overview-stats">
                  <div>
                    <dt>Stars</dt>
                    <dd>{githubStarCountLabel}</dd>
                  </div>
                  <div>
                    <dt>Open issues</dt>
                    <dd>{githubOpenIssuesLabel}</dd>
                  </div>
                  <div>
                    <dt>Open PRs</dt>
                    <dd>{githubOpenPrsLabel}</dd>
                  </div>
                  <div>
                    <dt>Commits (30d)</dt>
                    <dd>{githubCommitCount30d}</dd>
                  </div>
                </dl>
                <section className="github-overview-graph" aria-label="GitHub commits graph">
                  <div className="github-overview-graph-meta">
                    <strong>Commits Per Day</strong>
                    <span>{githubOverviewHoverLabel}</span>
                  </div>
                  <div className="github-overview-graph-surface">
                    <svg
                      onMouseLeave={() => {
                        setHoveredGitHubOverviewPointIndex(null);
                      }}
                      viewBox={`0 0 ${GITHUB_OVERVIEW_GRAPH_WIDTH} ${GITHUB_OVERVIEW_GRAPH_HEIGHT}`}
                      role="presentation"
                    >
                      <polyline points={githubOverviewGraphPolylinePoints} />
                      {githubOverviewGraphSeries.map((point, index) => (
                        <circle
                          aria-label={formatGitHubCommitHoverLabel(point)}
                          className={`github-overview-graph-point${
                            hoveredGitHubOverviewPointIndex === index ? " is-active" : ""
                          }`}
                          cx={point.x}
                          cy={point.y}
                          key={`${point.date}-${index}`}
                          onFocus={() => {
                            setHoveredGitHubOverviewPointIndex(index);
                          }}
                          onMouseEnter={() => {
                            setHoveredGitHubOverviewPointIndex(index);
                          }}
                          r={6}
                          tabIndex={0}
                        >
                          <title>{formatGitHubCommitHoverLabel(point)}</title>
                        </circle>
                      ))}
                    </svg>
                  </div>
                </section>
              </section>
            )}
            </section>
          ) : (

          <main
            ref={tentaclesRef}
            className="tentacles"
            aria-label="Tentacle board"
            onWheel={handleTentacleHeaderWheel}
          >
            {isLoading && (
              <section className="empty-state" aria-label="Loading">
                <h2>Loading tentacles...</h2>
              </section>
            )}

            {!isLoading && columns.length === 0 && (
              <section className="empty-state" aria-label="Empty state">
                <EmptyOctopus />
                <h2>No active tentacles</h2>
                <p>When agents start, tentacles will appear here.</p>
                {loadError && <p className="empty-state-subtle">{loadError}</p>}
              </section>
            )}

            {!isLoading && columns.length > 0 && visibleColumns.length === 0 && (
              <section className="empty-state" aria-label="All minimized">
                <h2>All tentacles minimized</h2>
                <p>Use the Active Agents sidebar to maximize a tentacle.</p>
                {loadError && <p className="empty-state-subtle">{loadError}</p>}
              </section>
            )}

            {visibleColumns.map((column, index) => {
              const rightNeighbor = visibleColumns[index + 1];
              return (
                <Fragment key={column.tentacleId}>
                  <section
                    className="tentacle-column"
                    aria-label={column.tentacleId}
                    style={{
                      width: `${tentacleWidths[column.tentacleId] ?? TENTACLE_MIN_WIDTH}px`,
                    }}
                  >
                    <div className="tentacle-column-header">
                      <div className="tentacle-column-heading">
                        {editingTentacleId === column.tentacleId ? (
                          <>
                            <input
                              ref={tentacleNameInputRef}
                              aria-label={`Tentacle name for ${column.tentacleId}`}
                              className="tentacle-name-editor"
                              onBlur={() => {
                                void submitTentacleRename(column.tentacleId, column.tentacleName);
                              }}
                              onChange={(event) => {
                                setTentacleNameDraft(event.target.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void submitTentacleRename(column.tentacleId, column.tentacleName);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelTentacleNameSubmitRef.current = true;
                                  setEditingTentacleId(null);
                                  setTentacleNameDraft("");
                                }
                              }}
                              type="text"
                              value={tentacleNameDraft}
                            />
                            <span
                              className={`tentacle-workspace-badge tentacle-workspace-badge--${column.tentacleWorkspaceMode}`}
                            >
                              {renderTentacleWorkspaceLabel(column.tentacleWorkspaceMode)}
                            </span>
                          </>
                        ) : (
                          <h2>
                            <button
                              className="tentacle-name-display"
                              onClick={() => {
                                beginTentacleNameEdit(column.tentacleId, column.tentacleName);
                              }}
                              type="button"
                            >
                              {column.tentacleName}
                            </button>
                            <span
                              className={`tentacle-workspace-badge tentacle-workspace-badge--${column.tentacleWorkspaceMode}`}
                            >
                              {renderTentacleWorkspaceLabel(column.tentacleWorkspaceMode)}
                            </span>
                          </h2>
                        )}
                      </div>
                      {editingTentacleId !== column.tentacleId && (
                        <div className="tentacle-header-actions">
                          <ActionButton
                            aria-label={`Minimize tentacle ${column.tentacleId}`}
                            className="tentacle-minimize"
                            onClick={() => {
                              handleMinimizeTentacle(column.tentacleId);
                            }}
                            size="dense"
                            variant="info"
                          >
                            Minimize
                          </ActionButton>
                          <ActionButton
                            aria-label={`Rename tentacle ${column.tentacleId}`}
                            className="tentacle-rename"
                            onClick={() => {
                              beginTentacleNameEdit(column.tentacleId, column.tentacleName);
                            }}
                            size="dense"
                            variant="accent"
                          >
                            Rename
                          </ActionButton>
                          <ActionButton
                            aria-label={`Delete tentacle ${column.tentacleId}`}
                            className="tentacle-delete"
                            disabled={isDeletingTentacleId === column.tentacleId}
                            onClick={() => {
                              requestDeleteTentacle(column.tentacleId, column.tentacleName);
                            }}
                            size="dense"
                            variant="danger"
                          >
                            {isDeletingTentacleId === column.tentacleId ? "Deleting..." : "Delete"}
                          </ActionButton>
                        </div>
                      )}
                    </div>
                    <TentacleTerminal
                      tentacleId={column.tentacleId}
                      onCodexStateChange={(state) => {
                        handleTentacleStateChange(column.tentacleId, state);
                      }}
                    />
                  </section>

                  {rightNeighbor && (
                    <div
                      aria-label={`Resize between ${column.tentacleId} and ${rightNeighbor.tentacleId}`}
                      aria-orientation="vertical"
                      className="tentacle-divider"
                      onKeyDown={handleTentacleDividerKeyDown(
                        column.tentacleId,
                        rightNeighbor.tentacleId,
                      )}
                      onPointerDown={handleTentacleDividerPointerDown(
                        column.tentacleId,
                        rightNeighbor.tentacleId,
                      )}
                      role="separator"
                      tabIndex={0}
                    />
                  )}
                </Fragment>
              );
            })}
          </main>
          )}
        </div>
      </section>

      <section className="console-telemetry-tape" aria-label="Telemetry ticker tape">
        <div className="console-telemetry-track">
          {[...TELEMETRY_TAPE_ITEMS, ...TELEMETRY_TAPE_ITEMS].map((item, index) => (
            <span
              className={`console-telemetry-item ${item.change >= 0 ? "is-up" : "is-down"}`}
              key={`${item.symbol}-${index}`}
            >
              <strong>{item.symbol}</strong>
              <span>{item.change >= 0 ? `+${item.change.toFixed(2)}%` : `${item.change.toFixed(2)}%`}</span>
            </span>
          ))}
        </div>
      </section>

      {pendingDeleteTentacle && (
        <div className="delete-confirm-backdrop" role="presentation">
          <dialog
            aria-label={`Delete confirmation for ${pendingDeleteTentacle.tentacleName}`}
            className="delete-confirm-dialog"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || isDeletingTentacleId !== null) {
                return;
              }
              event.preventDefault();
              setPendingDeleteTentacle(null);
            }}
            open
          >
            <header className="delete-confirm-header">
              <h2>Delete Tentacle</h2>
              <span className="pill blocked">DESTRUCTIVE</span>
            </header>
            <div className="delete-confirm-body">
              <p className="delete-confirm-message">
                Delete <strong>{pendingDeleteTentacle.tentacleName}</strong> and terminate all of
                its active sessions.
              </p>
              <p className="delete-confirm-warning">This action cannot be undone.</p>
              <dl className="delete-confirm-details">
                <div>
                  <dt>Name</dt>
                  <dd>{pendingDeleteTentacle.tentacleName}</dd>
                </div>
                <div>
                  <dt>ID</dt>
                  <dd>{pendingDeleteTentacle.tentacleId}</dd>
                </div>
              </dl>
            </div>
            <div className="delete-confirm-actions">
              <ActionButton
                aria-label="Cancel delete"
                className="delete-confirm-cancel"
                onClick={() => {
                  setPendingDeleteTentacle(null);
                }}
                size="dense"
                variant="accent"
              >
                Cancel
              </ActionButton>
              <ActionButton
                aria-label={`Confirm delete ${pendingDeleteTentacle.tentacleId}`}
                className="delete-confirm-submit"
                disabled={isDeletingTentacleId === pendingDeleteTentacle.tentacleId}
                onClick={() => {
                  void handleDeleteTentacle();
                }}
                size="dense"
                variant="danger"
              >
                {isDeletingTentacleId === pendingDeleteTentacle.tentacleId
                  ? "Deleting..."
                  : "Delete"}
              </ActionButton>
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
};
