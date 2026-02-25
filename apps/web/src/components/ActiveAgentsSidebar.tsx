import type { AgentState, TentacleColumn } from "@octogent/core";
import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { type CodexState, CodexStateBadge } from "./CodexStateBadge";
import { ActionButton } from "./ui/ActionButton";

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = 320;

const fallbackCodexStateByAgentState: Record<AgentState, CodexState> = {
  live: "processing",
  idle: "idle",
  queued: "processing",
  blocked: "processing",
};

type ActiveAgentsSidebarProps = {
  columns: TentacleColumn[];
  isLoading: boolean;
  loadError: string | null;
  tentacleStates?: Record<string, CodexState>;
  minimizedTentacleIds?: string[];
  onMaximizeTentacle?: (tentacleId: string) => void;
  codexUsageSnapshot?: {
    primaryUsedPercent?: number | null;
    secondaryUsedPercent?: number | null;
    creditsBalance?: number | null;
    creditsUnlimited?: boolean | null;
  } | null;
  codexUsageStatus?: "ok" | "unavailable" | "error" | "loading";
};

const CODEX_METER_WIDTH = 12;

const clampSidebarWidth = (width: number): number =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

export const ActiveAgentsSidebar = ({
  columns,
  isLoading,
  loadError,
  tentacleStates = {},
  minimizedTentacleIds = [],
  onMaximizeTentacle,
  codexUsageSnapshot = null,
  codexUsageStatus = "loading",
}: ActiveAgentsSidebarProps) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const activeAgentCount = useMemo(
    () => columns.reduce((count, column) => count + column.agents.length, 0),
    [columns],
  );
  const primaryUsagePercent = useMemo(() => {
    const value = codexUsageSnapshot?.primaryUsedPercent;
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.min(100, value));
  }, [codexUsageSnapshot]);
  const secondaryUsagePercent = useMemo(() => {
    const value = codexUsageSnapshot?.secondaryUsedPercent;
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    return Math.max(0, Math.min(100, value));
  }, [codexUsageSnapshot]);
  const creditsLabel = useMemo(() => {
    if (codexUsageSnapshot?.creditsUnlimited) {
      return "unlimited";
    }
    const creditsBalance = codexUsageSnapshot?.creditsBalance;
    if (creditsBalance === null || creditsBalance === undefined || !Number.isFinite(creditsBalance)) {
      return "--";
    }
    return `$${creditsBalance.toFixed(2)}`;
  }, [codexUsageSnapshot]);

  const formatMeter = (value: number | null): string => {
    if (value === null) {
      return `[${".".repeat(CODEX_METER_WIDTH)}]`;
    }
    const filledBlocks = Math.round((value / 100) * CODEX_METER_WIDTH);
    return `[${"=".repeat(filledBlocks)}${".".repeat(CODEX_METER_WIDTH - filledBlocks)}]`;
  };

  const handleResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;

    const handleMouseMove = (event: MouseEvent) => {
      setSidebarWidth(clampSidebarWidth(event.clientX - sidebarLeft));
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
  };

  return (
    <div className="dashboard-deck-shell">
      <aside
        aria-label="Active Agents sidebar"
        className="active-agents-sidebar"
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
      >
        <header className="active-agents-header">
          <div className="active-agents-header-text">
            <h2>Active Agents</h2>
            <p>
              {columns.length} tentacles · {activeAgentCount} agents
            </p>
          </div>
        </header>

        <div className="active-agents-body">
          {isLoading && <p className="active-agents-status">Loading active agents...</p>}

          {!isLoading && columns.length === 0 && (
            <p className="active-agents-status">No active tentacles right now.</p>
          )}

          {!isLoading &&
            columns.map((column) => (
              <section
                key={column.tentacleId}
                aria-label={`Active agents in ${column.tentacleId}`}
                className="active-agents-group"
              >
                <div className="active-agents-group-header">
                  <h3>{column.tentacleName}</h3>
                  {minimizedTentacleIds.includes(column.tentacleId) && (
                    <ActionButton
                      aria-label={`Maximize tentacle ${column.tentacleId}`}
                      className="active-agents-maximize"
                      onClick={() => {
                        onMaximizeTentacle?.(column.tentacleId);
                      }}
                      size="compact"
                      variant="accent"
                    >
                      Maximize
                    </ActionButton>
                  )}
                </div>
                <ul>
                  {column.agents.map((agent) => (
                    <li key={agent.agentId}>
                      <span>{agent.label}</span>
                      <CodexStateBadge
                        state={
                          agent.parentAgentId === undefined
                            ? (tentacleStates[column.tentacleId] ??
                              fallbackCodexStateByAgentState[agent.state])
                            : fallbackCodexStateByAgentState[agent.state]
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {loadError && <p className="active-agents-status active-agents-error">{loadError}</p>}
        </div>
        <footer className="active-agents-footer">
          <div className={`active-agents-codex-usage active-agents-codex-usage--${codexUsageStatus}`}>
            <div className="active-agents-codex-usage-meta">
              <span>Codex token usage</span>
            </div>
            {codexUsageStatus === "ok" ? (
              <div aria-label="Codex token usage bars" className="active-agents-codex-usage-bars">
                <p className="active-agents-codex-usage-row">
                  <span className="active-agents-codex-usage-label">5H</span>
                  <code className="active-agents-codex-usage-bar">{formatMeter(primaryUsagePercent)}</code>
                  <span className="active-agents-codex-usage-percent">
                    {primaryUsagePercent === null ? "--" : `${Math.round(primaryUsagePercent)}%`}
                  </span>
                </p>
                <p className="active-agents-codex-usage-row">
                  <span className="active-agents-codex-usage-label">WEEK</span>
                  <code className="active-agents-codex-usage-bar">
                    {formatMeter(secondaryUsagePercent)}
                  </code>
                  <span className="active-agents-codex-usage-percent">
                    {secondaryUsagePercent === null ? "--" : `${Math.round(secondaryUsagePercent)}%`}
                  </span>
                </p>
                <p className="active-agents-codex-usage-credits">Credits {creditsLabel}</p>
              </div>
            ) : (
              <p className="active-agents-codex-usage-status">
                {codexUsageStatus === "loading"
                  ? "Waiting for Codex usage..."
                  : codexUsageStatus === "unavailable"
                    ? "Codex usage unavailable."
                    : "Codex usage error."}
              </p>
            )}
          </div>
        </footer>
        <div
          className="active-agents-border-resizer"
          data-testid="active-agents-border-resizer"
          onMouseDown={handleResizeMouseDown}
        />
      </aside>
    </div>
  );
};
