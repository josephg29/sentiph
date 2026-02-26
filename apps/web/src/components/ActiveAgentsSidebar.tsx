import type { AgentState, TentacleColumn } from "@octogent/core";
import { useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { type CodexState, CodexStateBadge } from "./CodexStateBadge";
import { ActionButton } from "./ui/ActionButton";

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;

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
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  isActiveAgentsSectionExpanded: boolean;
  onActiveAgentsSectionExpandedChange: (expanded: boolean) => void;
  isCodexUsageSectionExpanded: boolean;
  onCodexUsageSectionExpandedChange: (expanded: boolean) => void;
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

const clampSidebarWidth = (width: number): number =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

export const ActiveAgentsSidebar = ({
  columns,
  isLoading,
  loadError,
  sidebarWidth,
  onSidebarWidthChange,
  isActiveAgentsSectionExpanded,
  onActiveAgentsSectionExpandedChange,
  isCodexUsageSectionExpanded,
  onCodexUsageSectionExpandedChange,
  tentacleStates = {},
  minimizedTentacleIds = [],
  onMaximizeTentacle,
  codexUsageSnapshot = null,
  codexUsageStatus = "loading",
}: ActiveAgentsSidebarProps) => {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const resolveAgentCodexState = (
    tentacleId: string,
    agent: { parentAgentId?: string; state: AgentState },
  ): CodexState => {
    if (agent.parentAgentId === undefined) {
      return tentacleStates[tentacleId] ?? fallbackCodexStateByAgentState[agent.state];
    }
    return fallbackCodexStateByAgentState[agent.state];
  };

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
    if (
      creditsBalance === null ||
      creditsBalance === undefined ||
      !Number.isFinite(creditsBalance)
    ) {
      return "--";
    }
    return `$${creditsBalance.toFixed(2)}`;
  }, [codexUsageSnapshot]);

  const handleResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;

    const handleMouseMove = (event: MouseEvent) => {
      onSidebarWidthChange(clampSidebarWidth(event.clientX - sidebarLeft));
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
        <div className="active-agents-body">
          <section className="active-agents-section" aria-label="Sidebar section Active Agents">
            <button
              aria-controls="active-agents-section-panel"
              aria-expanded={isActiveAgentsSectionExpanded}
              aria-label={
                isActiveAgentsSectionExpanded
                  ? "Collapse Active Agents section"
                  : "Expand Active Agents section"
              }
              className="active-agents-section-toggle"
              data-expanded={isActiveAgentsSectionExpanded ? "true" : "false"}
              onClick={() => {
                onActiveAgentsSectionExpandedChange(!isActiveAgentsSectionExpanded);
              }}
              type="button"
            >
              <span className="active-agents-section-title">Active Agents</span>
              <span className="active-agents-section-meta">{columns.length} tentacles</span>
              <span className="active-agents-section-chevron" aria-hidden="true">
                {isActiveAgentsSectionExpanded ? "▾" : "▸"}
              </span>
            </button>

            {isActiveAgentsSectionExpanded && (
              <div className="active-agents-section-panel" id="active-agents-section-panel">
                {isLoading && <p className="active-agents-status">Loading active agents...</p>}

                {!isLoading && columns.length === 0 && (
                  <p className="active-agents-status">No active tentacles right now.</p>
                )}

                {!isLoading &&
                  columns.map((column) => {
                    const agentCountLabel = column.agents.length === 1 ? "agent" : "agents";
                    return (
                      <section
                        key={column.tentacleId}
                        aria-label={`Active agents in ${column.tentacleId}`}
                        className="active-agents-group"
                      >
                        <div className="active-agents-group-header">
                          <div className="active-agents-group-header-text">
                            <h3>{column.tentacleName}</h3>
                          </div>
                          <span className="active-agents-group-count">
                            {column.agents.length} {agentCountLabel}
                          </span>
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
                            <li
                              className={`active-agents-agent-row ${
                                agent.parentAgentId === undefined
                                  ? "active-agents-agent-row--root"
                                  : "active-agents-agent-row--child"
                              }`}
                              key={agent.agentId}
                            >
                              <span className="active-agents-agent-label" title={agent.label}>
                                {agent.label}
                              </span>
                              <CodexStateBadge
                                state={resolveAgentCodexState(column.tentacleId, agent)}
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}

                {loadError && (
                  <p className="active-agents-status active-agents-error">{loadError}</p>
                )}
              </div>
            )}
          </section>
        </div>
        <footer className="active-agents-footer">
          <section className="active-agents-section active-agents-section--footer">
            <button
              aria-controls="codex-usage-section-panel"
              aria-expanded={isCodexUsageSectionExpanded}
              aria-label={
                isCodexUsageSectionExpanded
                  ? "Collapse Codex token usage section"
                  : "Expand Codex token usage section"
              }
              className="active-agents-section-toggle"
              data-expanded={isCodexUsageSectionExpanded ? "true" : "false"}
              onClick={() => {
                onCodexUsageSectionExpandedChange(!isCodexUsageSectionExpanded);
              }}
              type="button"
            >
              <span className="active-agents-section-title">Codex token usage</span>
              <span className="active-agents-section-meta">Usage overview</span>
              <span className="active-agents-section-chevron" aria-hidden="true">
                {isCodexUsageSectionExpanded ? "▾" : "▸"}
              </span>
            </button>

            {isCodexUsageSectionExpanded && (
              <div className="active-agents-section-panel" id="codex-usage-section-panel">
                <div
                  className={`active-agents-codex-usage active-agents-codex-usage--${codexUsageStatus}`}
                >
                  {codexUsageStatus === "ok" ? (
                    <div
                      aria-label="Codex token usage bars"
                      className="active-agents-codex-usage-bars"
                    >
                      <div className="active-agents-codex-usage-row">
                        <span
                          aria-label="5H token usage"
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={
                            primaryUsagePercent === null
                              ? undefined
                              : Math.round(primaryUsagePercent)
                          }
                          aria-valuetext={
                            primaryUsagePercent === null
                              ? "No usage data"
                              : `${Math.round(primaryUsagePercent)}%`
                          }
                          className="active-agents-codex-usage-rail"
                          role="progressbar"
                          tabIndex={0}
                        >
                          <span
                            className="active-agents-codex-usage-rail-fill"
                            style={{ width: `${primaryUsagePercent ?? 0}%` }}
                          />
                        </span>
                        <p className="active-agents-codex-usage-meta-row">
                          <span className="active-agents-codex-usage-label">5H tokens</span>
                          <span className="active-agents-codex-usage-percent">
                            {primaryUsagePercent === null
                              ? "--"
                              : `${Math.round(primaryUsagePercent)}%`}
                          </span>
                        </p>
                      </div>
                      <div className="active-agents-codex-usage-row">
                        <span
                          aria-label="Weekly token usage"
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={
                            secondaryUsagePercent === null
                              ? undefined
                              : Math.round(secondaryUsagePercent)
                          }
                          aria-valuetext={
                            secondaryUsagePercent === null
                              ? "No usage data"
                              : `${Math.round(secondaryUsagePercent)}%`
                          }
                          className="active-agents-codex-usage-rail"
                          role="progressbar"
                          tabIndex={0}
                        >
                          <span
                            className="active-agents-codex-usage-rail-fill"
                            style={{ width: `${secondaryUsagePercent ?? 0}%` }}
                          />
                        </span>
                        <p className="active-agents-codex-usage-meta-row">
                          <span className="active-agents-codex-usage-label">Week tokens</span>
                          <span className="active-agents-codex-usage-percent">
                            {secondaryUsagePercent === null
                              ? "--"
                              : `${Math.round(secondaryUsagePercent)}%`}
                          </span>
                        </p>
                      </div>
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
              </div>
            )}
          </section>
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
