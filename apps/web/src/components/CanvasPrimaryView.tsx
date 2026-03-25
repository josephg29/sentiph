import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphNode } from "../app/canvas/types";
import type { TentacleView } from "../app/types";
import { useCanvasGraphData } from "../app/hooks/useCanvasGraphData";
import { useCanvasTransform } from "../app/hooks/useCanvasTransform";
import {
  useForceSimulation,
  DEFAULT_FORCE_PARAMS,
} from "../app/hooks/useForceSimulation";
import { OctopusNode } from "./canvas/OctopusNode";
import { SessionNode } from "./canvas/SessionNode";
import { CanvasTerminalOverlay } from "./canvas/CanvasTerminalOverlay";

type ContextMenuState = {
  x: number;
  y: number;
  tentacleId: string;
};

type CanvasPrimaryViewProps = {
  columns: TentacleView;
  onCreateAgent?: (tentacleId: string) => void;
};

const CLICK_THRESHOLD = 5;

export const CanvasPrimaryView = ({ columns, onCreateAgent }: CanvasPrimaryViewProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [overlayNode, setOverlayNode] = useState<{
    node: GraphNode;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const { nodes, edges } = useCanvasGraphData({ columns, enabled: true });

  const {
    transform,
    svgRef,
    handleWheel,
    handlePointerDown: handleCanvasPointerDown,
    handlePointerMove: handleCanvasPointerMove,
    handlePointerUp: handleCanvasPointerUp,
    screenToGraph,
    graphToScreen,
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
        const screen = graphToScreen(node.x, node.y);
        setOverlayNode({ node: { ...node }, screenX: screen.x + 20, screenY: screen.y - 200 });
      }
    },
    [nodesById, graphToScreen],
  );

  const handleSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragNodeId) {
        const start = dragStartRef.current;
        const dx = start ? e.clientX - start.x : Infinity;
        const dy = start ? e.clientY - start.y : Infinity;
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

  const handleCloseOverlay = useCallback(() => {
    setOverlayNode(null);
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === e.currentTarget) {
      setSelectedNodeId(null);
    }
  }, []);

  // Stable ref for nodesById so native listener always sees latest data
  const nodesByIdRef = useRef(nodesById);
  nodesByIdRef.current = nodesById;

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
      if (!node || node.type !== "tentacle") return;

      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, tentacleId: node.tentacleId });
    };

    svg.addEventListener("contextmenu", handler);
    return () => svg.removeEventListener("contextmenu", handler);
  }, [svgRef]);

  const handleCreateAgent = useCallback(
    (tentacleId: string) => {
      if (!onCreateAgent) return;
      setContextMenu(null);
      onCreateAgent(tentacleId);
    },
    [onCreateAgent],
  );

  // Separate tentacle and session nodes for render order
  const tentacleNodes = simulatedNodes.filter((n) => n.type === "tentacle");
  const sessionNodes = simulatedNodes.filter((n) => n.type !== "tentacle");

  return (
    <section className="canvas-view" aria-label="Canvas graph view">
      <svg
        ref={svgRef}
        className="canvas-svg"
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

      {/* Terminal overlay (HTML, positioned over SVG) */}
      {overlayNode && (
        <CanvasTerminalOverlay
          node={overlayNode.node}
          columns={columns}
          screenX={overlayNode.screenX}
          screenY={overlayNode.screenY}
          onClose={handleCloseOverlay}
        />
      )}

      {/* Context menu for tentacle nodes */}
      {contextMenu && (
        <>
          <div
            className="canvas-context-menu-backdrop"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="canvas-context-menu"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          >
            <button
              type="button"
              className="canvas-context-menu-item"
              onClick={() => handleCreateAgent(contextMenu.tentacleId)}
            >
              Create new agent
            </button>
          </div>
        </>
      )}
    </section>
  );
};
