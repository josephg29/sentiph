import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphNode } from "../app/canvas/types";
import { useCanvasGraphData } from "../app/hooks/useCanvasGraphData";
import { useCanvasTransform } from "../app/hooks/useCanvasTransform";
import { DEFAULT_FORCE_PARAMS, useForceSimulation } from "../app/hooks/useForceSimulation";
import type { TerminalView } from "../app/types";
import { CanvasTerminalColumn } from "./canvas/CanvasTerminalColumn";
import { OctopusNode } from "./canvas/OctopusNode";
import { SessionNode } from "./canvas/SessionNode";

type ContextMenuState =
  | { kind: "tentacle"; x: number; y: number; tentacleId: string }
  | {
      kind: "active-session";
      x: number;
      y: number;
      nodeId: string;
      tentacleId: string;
      sessionId: string;
      label: string;
      workspaceMode?: string;
    };

type CanvasPrimaryViewProps = {
  columns: TerminalView;
  isUiStateHydrated?: boolean;
  canvasOpenTerminalIds?: string[];
  canvasTerminalsPanelWidth?: number | null;
  onCanvasOpenTerminalIdsChange?: (ids: string[]) => void;
  onCanvasTerminalsPanelWidthChange?: (width: number | null) => void;
  onCreateAgent?: (tentacleId: string) => Promise<string | undefined> | void;
  onNavigateToConversation?: (sessionId: string) => void;
  onDeleteActiveSession?: (
    terminalId: string,
    terminalName: string,
    workspaceMode?: string,
  ) => void;
};

const CLICK_THRESHOLD = 5;
const GRAPH_MIN_WIDTH = 300;
const TERMINAL_MIN_WIDTH = 370;

export const CanvasPrimaryView = ({
  columns,
  isUiStateHydrated,
  canvasOpenTerminalIds,
  canvasTerminalsPanelWidth: persistedTerminalsPanelWidth,
  onCanvasOpenTerminalIdsChange,
  onCanvasTerminalsPanelWidthChange,
  onCreateAgent,
  onNavigateToConversation,
  onDeleteActiveSession,
}: CanvasPrimaryViewProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openTerminals, setOpenTerminals] = useState<Map<string, GraphNode>>(new Map());
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [terminalsPanelWidth, setTerminalsPanelWidth] = useState<number | null>(null);
  const [pendingOpenAgentId, setPendingOpenAgentId] = useState<string | null>(null);
  const hasHydratedTerminals = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dividerDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const terminalsPanelRef = useRef<HTMLDivElement>(null);

  const { nodes, edges } = useCanvasGraphData({ columns, enabled: true });

  const {
    transform,
    isPanning,
    svgRef,
    handleWheel,
    handlePointerDown: handleCanvasPointerDown,
    handlePointerMove: handleCanvasPointerMove,
    handlePointerUp: handleCanvasPointerUp,
    screenToGraph,
  } = useCanvasTransform();

  const { simulatedNodes, pinNode, unpinNode, moveNode, reheat } = useForceSimulation({
    nodes,
    edges,
    centerX: 0,
    centerY: 0,
  });

  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of simulatedNodes) {
      map.set(n.id, n);
    }
    return map;
  }, [simulatedNodes]);

  // Hydrate open terminals from persisted IDs once UI state and graph nodes are available
  useEffect(() => {
    if (hasHydratedTerminals.current) return;
    if (!isUiStateHydrated) return;
    if (simulatedNodes.length === 0) return;

    if (canvasOpenTerminalIds && canvasOpenTerminalIds.length > 0) {
      const restoredMap = new Map<string, GraphNode>();
      for (const nodeId of canvasOpenTerminalIds) {
        const node = nodesById.get(nodeId);
        if (node && node.type === "active-session") {
          restoredMap.set(nodeId, { ...node });
        }
      }
      if (restoredMap.size > 0) {
        setOpenTerminals(restoredMap);
      }
    }

    if (persistedTerminalsPanelWidth != null && persistedTerminalsPanelWidth > 0) {
      setTerminalsPanelWidth(persistedTerminalsPanelWidth);
    }

    hasHydratedTerminals.current = true;
  }, [
    isUiStateHydrated,
    canvasOpenTerminalIds,
    persistedTerminalsPanelWidth,
    simulatedNodes.length,
    nodesById,
  ]);

  // Persist open terminal IDs when they change
  useEffect(() => {
    if (!hasHydratedTerminals.current) return;
    onCanvasOpenTerminalIdsChange?.(Array.from(openTerminals.keys()));
  }, [openTerminals, onCanvasOpenTerminalIdsChange]);

  // Persist terminals panel width only when user has explicitly dragged the divider
  useEffect(() => {
    if (!hasHydratedTerminals.current) return;
    if (terminalsPanelWidth == null) return;
    onCanvasTerminalsPanelWidthChange?.(terminalsPanelWidth);
  }, [terminalsPanelWidth, onCanvasTerminalsPanelWidthChange]);

  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (e.button !== 0) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setDragNodeId(nodeId);
      pinNode(nodeId);
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [pinNode, svgRef],
  );

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragNodeId) {
        const graphPos = screenToGraph(e.clientX, e.clientY);
        moveNode(dragNodeId, graphPos.x, graphPos.y);
        return;
      }
      handleCanvasPointerMove(e);
    },
    [dragNodeId, screenToGraph, moveNode, handleCanvasPointerMove],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      const node = nodesById.get(nodeId);
      if (!node) return;

      if (node.type === "active-session") {
        setOpenTerminals((prev) => {
          const next = new Map(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.set(nodeId, { ...node });
          }
          return next;
        });
      } else if (node.type === "inactive-session" && node.sessionId) {
        onNavigateToConversation?.(node.sessionId);
      }
    },
    [nodesById, onNavigateToConversation],
  );

  const handleCloseTerminal = useCallback((nodeId: string) => {
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

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

  const handleDividerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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
  }, []);

  const handleDividerPointerUp = useCallback(() => {
    dividerDragRef.current = null;
  }, []);

  // Convert vertical wheel to horizontal scroll only when hovering terminal headers
  useEffect(() => {
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
  }, [openTerminals.size > 0]);

  const handleSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragNodeId) {
        const start = dragStartRef.current;
        const dx = start ? e.clientX - start.x : Number.POSITIVE_INFINITY;
        const dy = start ? e.clientY - start.y : Number.POSITIVE_INFINITY;
        const wasClick = Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD;

        unpinNode(dragNodeId);
        reheat();

        if (wasClick) {
          handleNodeClick(dragNodeId);
        }

        setDragNodeId(null);
        dragStartRef.current = null;
        return;
      }
      handleCanvasPointerUp(e);
    },
    [dragNodeId, unpinNode, reheat, handleCanvasPointerUp, handleNodeClick],
  );

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === e.currentTarget) {
      setSelectedNodeId(null);
    }
  }, []);

  // Stable ref for nodesById so native listener always sees latest data
  const nodesByIdRef = useRef(nodesById);
  nodesByIdRef.current = nodesById;

  // Stable refs so the native listener always sees the latest callbacks
  const onNavigateRef = useRef(onNavigateToConversation);
  onNavigateRef.current = onNavigateToConversation;

  // Native contextmenu listener — must be native to reliably preventDefault
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
      if (!nodeId) return;
      const node = nodesByIdRef.current.get(nodeId);
      if (!node) return;

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
  }, [svgRef]);

  const handleCreateAgent = useCallback(
    (tentacleId: string) => {
      if (!onCreateAgent) return;
      setContextMenu(null);
      const result = onCreateAgent(tentacleId);
      if (result && typeof result.then === "function") {
        void result.then((agentId) => {
          if (agentId) setPendingOpenAgentId(agentId);
        });
      }
    },
    [onCreateAgent],
  );

  // Auto-open terminal for newly created agent once it appears in the graph
  useEffect(() => {
    if (!pendingOpenAgentId) return;
    const nodeId = `a:${pendingOpenAgentId}`;
    const node = nodesById.get(nodeId);
    if (!node) return;
    setPendingOpenAgentId(null);
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { ...node });
      return next;
    });
  }, [pendingOpenAgentId, nodesById]);

  // Separate tentacle and session nodes for render order
  const tentacleNodes = simulatedNodes.filter((n) => n.type === "tentacle");
  const sessionNodes = simulatedNodes.filter((n) => n.type !== "tentacle");

  const hasTerminals = openTerminals.size > 0;

  return (
    <section ref={containerRef} className="canvas-view" aria-label="Canvas graph view">
      <div className={`canvas-graph-panel${hasTerminals ? " canvas-graph-panel--split" : ""}`}>
        <svg
          ref={svgRef}
          className={`canvas-svg${isPanning || dragNodeId ? " canvas-svg--panning" : ""}`}
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onClick={handleSvgClick}
        >
          <g
            transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}
          >
            {/* Render tentacle nodes (with arms) first */}
            {tentacleNodes.map((node) => {
              const connected = edges
                .filter((e) => e.source === node.id)
                .map((e) => nodesById.get(e.target))
                .filter((n): n is GraphNode => n !== undefined);

              return (
                <OctopusNode
                  key={node.id}
                  node={node}
                  connectedNodes={connected}
                  isSelected={selectedNodeId === node.id}
                  onPointerDown={handleNodePointerDown}
                  onClick={handleNodeClick}
                />
              );
            })}

            {/* Render session nodes on top */}
            {sessionNodes.map((node) => (
              <SessionNode
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                onPointerDown={handleNodePointerDown}
                onClick={handleNodeClick}
              />
            ))}
          </g>
        </svg>
      </div>

      {hasTerminals && (
        <>
          <div
            className="canvas-panel-divider"
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
          />
          <div
            ref={terminalsPanelRef}
            className="canvas-terminals-panel"
            style={
              terminalsPanelWidth != null ? { flex: `0 0 ${terminalsPanelWidth}px` } : undefined
            }
          >
            {Array.from(openTerminals.entries()).map(([nodeId, node]) => (
              <CanvasTerminalColumn
                key={nodeId}
                node={node}
                terminals={columns}
                isFocused={selectedNodeId === nodeId}
                onClose={() => handleCloseTerminal(nodeId)}
                onFocus={() => setSelectedNodeId(nodeId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="canvas-context-menu-backdrop" onClick={() => setContextMenu(null)} />
          <div
            className="canvas-context-menu"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          >
            {contextMenu.kind === "tentacle" && (
              <button
                type="button"
                className="canvas-context-menu-item"
                onClick={() => handleCreateAgent(contextMenu.tentacleId)}
              >
                Create new agent
              </button>
            )}
            {contextMenu.kind === "active-session" && (
              <button
                type="button"
                className="canvas-context-menu-item canvas-context-menu-item--danger"
                onClick={() => {
                  onDeleteActiveSession?.(
                    contextMenu.sessionId,
                    contextMenu.label,
                    contextMenu.workspaceMode,
                  );
                  setContextMenu(null);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
