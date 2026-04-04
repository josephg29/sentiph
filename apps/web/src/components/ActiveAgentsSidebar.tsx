import { useRef } from "react";
import type { ReactNode } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;

type ActiveAgentsSidebarProps = {
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  actionPanel?: ReactNode;
  bodyContent?: ReactNode;
};

const clampSidebarWidth = (width: number): number =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

export const ActiveAgentsSidebar = ({
  sidebarWidth,
  onSidebarWidthChange,
  actionPanel = null,
  bodyContent,
}: ActiveAgentsSidebarProps) => {
  const sidebarRef = useRef<HTMLElement | null>(null);

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
        {actionPanel ? (
          <div className="active-agents-action-panel">{actionPanel}</div>
        ) : (
          <div className="active-agents-body">{bodyContent}</div>
        )}
        <div
          className="active-agents-border-resizer"
          data-testid="active-agents-border-resizer"
          onMouseDown={handleResizeMouseDown}
        />
      </aside>
    </div>
  );
};
