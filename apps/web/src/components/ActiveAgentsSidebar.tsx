import type { AgentState, TentacleColumn } from "@octogent/core";
import { useMemo } from "react";

const DEFAULT_SIDEBAR_WIDTH = 320;

const stateClass: Record<AgentState, string> = {
  live: "live",
  idle: "idle",
  queued: "queued",
  blocked: "blocked",
};

type ActiveAgentsSidebarProps = {
  columns: TentacleColumn[];
  isLoading: boolean;
  loadError: string | null;
};

export const ActiveAgentsSidebar = ({
  columns,
  isLoading,
  loadError,
}: ActiveAgentsSidebarProps) => {
  const activeAgentCount = useMemo(
    () => columns.reduce((count, column) => count + column.agents.length, 0),
    [columns],
  );

  return (
    <div className="dashboard-deck-shell">
      <aside
        aria-label="Active Agents sidebar"
        className="active-agents-sidebar"
        style={{ width: `${DEFAULT_SIDEBAR_WIDTH}px` }}
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
                <h3>{column.tentacleId}</h3>
                <ul>
                  {column.agents.map((agent) => (
                    <li key={agent.agentId}>
                      <span>{agent.label}</span>
                      <span className={`pill ${stateClass[agent.state]}`}>
                        {agent.state.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {loadError && <p className="active-agents-status active-agents-error">{loadError}</p>}
        </div>
      </aside>
    </div>
  );
};
