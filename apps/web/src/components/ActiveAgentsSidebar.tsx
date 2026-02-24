import type { AgentState, TentacleColumn } from "@octogent/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const DEFAULT_SIDEBAR_WIDTH = 320;
const KEYBOARD_RESIZE_STEP = 24;

const stateClass: Record<AgentState, string> = {
  live: "live",
  idle: "idle",
  queued: "queued",
  blocked: "blocked",
};

const clampSidebarWidth = (width: number): number =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

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
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const activeAgentCount = useMemo(
    () => columns.reduce((count, column) => count + column.agents.length, 0),
    [columns],
  );
  const resizeBy = useCallback((delta: number) => {
    setSidebarWidth((currentWidth) => clampSidebarWidth(currentWidth + delta));
  }, []);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeBy(KEYBOARD_RESIZE_STEP);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeBy(-KEYBOARD_RESIZE_STEP);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(MIN_SIDEBAR_WIDTH);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(MAX_SIDEBAR_WIDTH);
    }
  };

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(event.clientX));
    };

    const stopResize = () => {
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [isResizing]);

  return (
    <div className="dashboard-deck-shell">
      <aside
        aria-label="Active Agents sidebar"
        className="active-agents-sidebar"
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

      <div
        aria-label="Resize Active Agents sidebar"
        aria-orientation="vertical"
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        className="active-agents-resizer"
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
};
