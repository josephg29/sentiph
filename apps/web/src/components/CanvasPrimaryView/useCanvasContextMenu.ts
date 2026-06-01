import { useEffect, useRef } from "react";

import type { GraphNode } from "../../app/canvas/types";
import type { ContextMenuState } from "./types";

type UseCanvasContextMenuParams = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  nodesById: Map<string, GraphNode>;
  onNavigateToConversation?: ((sessionId: string) => void) | undefined;
  setContextMenu: (value: ContextMenuState | null) => void;
};

/**
 * Registers the native `contextmenu` listener on the canvas SVG. It must be a
 * native listener to reliably `preventDefault` the browser's context menu.
 */
export const useCanvasContextMenu = ({
  svgRef,
  nodesById,
  onNavigateToConversation,
  setContextMenu,
}: UseCanvasContextMenuParams): void => {
  // Stable ref for nodesById so native listener always sees latest data
  const nodesByIdRef = useRef(nodesById);
  nodesByIdRef.current = nodesById;

  // Stable refs so the native listener always sees the latest callbacks
  const onNavigateRef = useRef(onNavigateToConversation);
  onNavigateRef.current = onNavigateToConversation;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handler = (e: MouseEvent) => {
      let el = e.target as Element | null;
      let nodeId: string | null = null;
      while (el && el !== svg) {
        const id = el.getAttribute("data-node-id");
        if (id) {
          nodeId = id;
          break;
        }
        el = el.parentElement;
      }
      if (!nodeId) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ kind: "canvas", x: e.clientX, y: e.clientY });
        return;
      }
      const node = nodesByIdRef.current.get(nodeId);
      if (!node) return;

      if (node.type === "sentiph") {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ kind: "sentiph", x: e.clientX, y: e.clientY });
        return;
      }

      if (node.type === "tentacle") {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
          kind: "tentacle",
          x: e.clientX,
          y: e.clientY,
          tentacleId: node.tentacleId,
        });
        return;
      }

      if (node.type === "inactive-session" && node.sessionId) {
        e.preventDefault();
        e.stopPropagation();
        onNavigateRef.current?.(node.sessionId);
        return;
      }

      if (node.type === "active-session" && node.sessionId) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
          kind: "active-session",
          x: e.clientX,
          y: e.clientY,
          nodeId: node.id,
          tentacleId: node.tentacleId,
          sessionId: node.sessionId,
          label: node.label,
          ...(node.workspaceMode ? { workspaceMode: node.workspaceMode } : {}),
        });
      }
    };

    svg.addEventListener("contextmenu", handler);
    return () => svg.removeEventListener("contextmenu", handler);
  }, [svgRef, setContextMenu]);
};
