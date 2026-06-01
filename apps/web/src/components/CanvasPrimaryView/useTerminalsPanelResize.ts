import { useCallback, useEffect, useRef } from "react";

import { GRAPH_MIN_WIDTH, TERMINAL_MIN_WIDTH } from "./helpers";

type UseTerminalsPanelResizeParams = {
  containerRef: React.RefObject<HTMLElement | null>;
  terminalsPanelRef: React.RefObject<HTMLDivElement | null>;
  terminalsPanelWidth: number | null;
  isHydratingTerminals: boolean;
  openTerminalCount: number;
  openTentacleCount: number;
  setTerminalsPanelWidth: (width: number) => void;
};

type UseTerminalsPanelResizeResult = {
  handleDividerPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDividerPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleDividerPointerUp: () => void;
};

export const useTerminalsPanelResize = ({
  containerRef,
  terminalsPanelRef,
  terminalsPanelWidth,
  isHydratingTerminals,
  openTerminalCount,
  openTentacleCount,
  setTerminalsPanelWidth,
}: UseTerminalsPanelResizeParams): UseTerminalsPanelResizeResult => {
  const dividerDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Divider drag handlers
  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Measure the actual rendered width of the terminals panel (works whether CSS- or inline-sized)
      const panelEl = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
      const currentWidth = panelEl?.clientWidth ?? terminalsPanelWidth ?? 600;
      dividerDragRef.current = { startX: e.clientX, startWidth: currentWidth };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [terminalsPanelWidth],
  );

  const handleDividerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dividerDragRef.current;
      if (!drag) return;
      const containerWidth = containerRef.current?.clientWidth ?? 1200;
      // Dragging left → terminals grow, dragging right → terminals shrink
      const delta = drag.startX - e.clientX;
      const newWidth = Math.max(
        TERMINAL_MIN_WIDTH,
        Math.min(containerWidth - GRAPH_MIN_WIDTH - 6, drag.startWidth + delta),
      );
      setTerminalsPanelWidth(newWidth);
    },
    [containerRef, setTerminalsPanelWidth],
  );

  const handleDividerPointerUp = useCallback(() => {
    dividerDragRef.current = null;
  }, []);

  // Convert vertical wheel to horizontal scroll only when hovering terminal headers
  useEffect(() => {
    if (!isHydratingTerminals && openTerminalCount === 0 && openTentacleCount === 0) return;
    const panel = terminalsPanelRef.current;
    if (!panel) return;
    const handler = (e: WheelEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest(".canvas-terminal-column-header")) return;
      if (e.deltaY !== 0 && e.deltaX === 0) {
        e.preventDefault();
        panel.scrollLeft += e.deltaY;
      }
    };
    panel.addEventListener("wheel", handler, { passive: false });
    return () => panel.removeEventListener("wheel", handler);
  }, [terminalsPanelRef, isHydratingTerminals, openTerminalCount, openTentacleCount]);

  return { handleDividerPointerDown, handleDividerPointerMove, handleDividerPointerUp };
};
