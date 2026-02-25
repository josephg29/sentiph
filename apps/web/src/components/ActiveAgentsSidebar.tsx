import type { AgentState, TentacleColumn } from "@octogent/core";
import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { type CodexState, CodexStateBadge } from "./CodexStateBadge";

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
};

const clampSidebarWidth = (width: number): number =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

export const ActiveAgentsSidebar = ({
  columns,
  isLoading,
  loadError,
  tentacleStates = {},
  minimizedTentacleIds = [],
  onMaximizeTentacle,
}: ActiveAgentsSidebarProps) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const activeAgentCount = useMemo(
    () => columns.reduce((count, column) => count + column.agents.length, 0),
    [columns],
  );

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
                    <button
                      aria-label={`Maximize tentacle ${column.tentacleId}`}
                      className="active-agents-maximize"
                      onClick={() => {
                        onMaximizeTentacle?.(column.tentacleId);
                      }}
                      type="button"
                    >
                      Maximize
                    </button>
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
        <div
          className="active-agents-border-resizer"
          data-testid="active-agents-border-resizer"
          onMouseDown={handleResizeMouseDown}
        />
      </aside>
    </div>
  );
};
