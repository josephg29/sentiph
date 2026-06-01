import { useEffect, useRef } from "react";

import type { GraphNode } from "../../app/canvas/types";

type UsePanelFocusScrollParams = {
  selectedNodeId: string | null;
  openTerminals: Map<string, GraphNode>;
  openTentacles: Map<string, GraphNode>;
  panelRefs: React.MutableRefObject<Map<string, HTMLElement>>;
};

/**
 * Scrolls the selected panel into view and focuses it once, whenever the
 * selection changes to a node that has an open panel.
 */
export const usePanelFocusScroll = ({
  selectedNodeId,
  openTerminals,
  openTentacles,
  panelRefs,
}: UsePanelFocusScrollParams): void => {
  const lastFocusedPanelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedNodeId) {
      lastFocusedPanelIdRef.current = null;
      return;
    }
    if (!openTerminals.has(selectedNodeId) && !openTentacles.has(selectedNodeId)) {
      if (lastFocusedPanelIdRef.current === selectedNodeId) {
        lastFocusedPanelIdRef.current = null;
      }
      return;
    }
    if (lastFocusedPanelIdRef.current === selectedNodeId) {
      return;
    }

    const panel = panelRefs.current.get(selectedNodeId);
    if (!panel) {
      return;
    }

    lastFocusedPanelIdRef.current = selectedNodeId;
    const rafId = window.requestAnimationFrame(() => {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      panel.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [selectedNodeId, openTerminals, openTentacles, panelRefs]);
};
