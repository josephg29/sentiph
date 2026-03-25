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

type ContextMenuState =
  | { kind: "tentacle"; x: number; y: number; tentacleId: string }
  | { kind: "active-session"; x: number; y: number; nodeId: string; tentacleId: string; sessionId: string };

type CanvasPrimaryViewProps = {
  columns: TentacleView;
  onCreateAgent?: (tentacleId: string) => void;
  onNavigateToConversation?: (sessionId: string) => void;
  onDeleteActiveSession?: (tentacleId: string, sessionId: string) => void;
};

const CLICK_THRESHOLD = 5;
const OVERLAY_WIDTH = 400;
const OVERLAY_HEIGHT = 560;

/** Find the rectangle corner nearest to an external point. */
const nearestCorner = (px: number, py: number, rx: number, ry: number, rw: number, rh: number) => {
  const corners = [
    { x: rx, y: ry },
    { x: rx + rw, y: ry },
    { x: rx, y: ry + rh },
    { x: rx + rw, y: ry + rh },
  ];
  let best = corners[0]!;
  let bestDist = Infinity;
  for (const c of corners) {
    const d = (c.x - px) ** 2 + (c.y - py) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
};

type OverlayEntry = {
  node: GraphNode;
  screenX: number;
  screenY: number;
};

export const CanvasPrimaryView = ({ columns, onCreateAgent, onNavigateToConversation, onDeleteActiveSession }: CanvasPrimaryViewProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Map<string, OverlayEntry>>(new Map);
  const [overlayPositions, setOverlayPositions] = useState<Map<string, { x: number; y: number }>>(new Map);
  const [overlaySizes, setOverlaySizes] = useState<Map<string, { w: number; h: number }>>(new Map);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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
        // Toggle: if already open, close it
        if (overlays.has(nodeId)) {
          setOverlays((prev) => { const next = new Map(prev); next.delete(nodeId); return next; });
          setOverlayPositions((prev) => { const next = new Map(prev); next.delete(nodeId); return next; });
          setOverlaySizes((prev) => { const next = new Map(prev); next.delete(nodeId); return next; });
          return;
        }

        // Node center in canvas-view-local coords
        const nx = node.x * transform.scale + transform.translateX;
        const ny = node.y * transform.scale + transform.translateY;

        // Viewport bounds
        const svgEl = svgRef.current;
        const vw = svgEl?.clientWidth ?? 1200;
        const vh = svgEl?.clientHeight ?? 800;
        const pad = 8;

        // Same side as the node: left half → flush left, right half → flush right
        const sx = nx < vw / 2 ? pad : vw - OVERLAY_WIDTH - pad;

        // Vertical: center on the node, clamped to viewport
        let sy = Math.max(pad, Math.min(ny - OVERLAY_HEIGHT / 2, vh - OVERLAY_HEIGHT - pad));

        // Nudge to avoid stacking on existing overlays
        const NUDGE = 30;
        for (const [existingId, existingPos] of overlayPositions) {
          if (existingId === nodeId) continue;
          const dx = Math.abs(existingPos.x - sx);
          const dy = Math.abs(existingPos.y - sy);
          if (dx < NUDGE && dy < NUDGE) {
            sy = Math.min(existingPos.y + NUDGE, vh - OVERLAY_HEIGHT - pad);
          }
        }

        setOverlays((prev) => new Map(prev).set(nodeId, { node: { ...node }, screenX: sx, screenY: sy }));
        setOverlayPositions((prev) => new Map(prev).set(nodeId, { x: sx, y: sy }));
      }
    },
    [nodesById, transform, overlays],
  );

  const handleOverlayMove = useCallback((nodeId: string, left: number, top: number) => {
    setOverlayPositions((prev) => new Map(prev).set(nodeId, { x: left, y: top }));
  }, []);

  const handleOverlayResize = useCallback((nodeId: string, w: number, h: number) => {
    setOverlaySizes((prev) => new Map(prev).set(nodeId, { w, h }));
  }, []);

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

  const handleCloseOverlay = useCallback((nodeId: string) => {
    setOverlays((prev) => { const next = new Map(prev); next.delete(nodeId); return next; });
    setOverlayPositions((prev) => { const next = new Map(prev); next.delete(nodeId); return next; });
    setOverlaySizes((prev) => { const next = new Map(prev); next.delete(nodeId); return next; });
  }, []);

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
        setContextMenu({ kind: "tentacle", x: e.clientX, y: e.clientY, tentacleId: node.tentacleId });
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
      onCreateAgent(tentacleId);
    },
    [onCreateAgent],
  );

  // Separate tentacle and session nodes for render order
  const tentacleNodes = simulatedNodes.filter((n) => n.type === "tentacle");
  const sessionNodes = simulatedNodes.filter((n) => n.type !== "tentacle");

  // Compute tether paths from nodes to their overlays (same curve as inter-node edges)
  const tethers = useMemo(() => {
    const result: Array<{ key: string; d: string }> = [];
    for (const [nodeId, entry] of overlays) {
      const pos = overlayPositions.get(nodeId);
      if (!pos) continue;
      const live = nodesById.get(entry.node.id);
      if (!live) continue;

      const sx = live.x * transform.scale + transform.translateX;
      const sy = live.y * transform.scale + transform.translateY;
      const size = overlaySizes.get(nodeId);
      const ow = size?.w ?? OVERLAY_WIDTH;
      const oh = size?.h ?? OVERLAY_HEIGHT;
      const dst = nearestCorner(sx, sy, pos.x, pos.y, ow, oh);

      const dx = dst.x - sx;
      const dy = dst.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;

      // Matches buildArmPath in OctopusNode — cubic bezier with S-curve
      const nx = -dy / dist;
      const ny = dx / dist;
      const curvature = dist * 0.2;
      const cp1x = sx + dx * 0.33 + nx * curvature;
      const cp1y = sy + dy * 0.33 + ny * curvature;
      const cp2x = sx + dx * 0.66 - nx * curvature * 0.5;
      const cp2y = sy + dy * 0.66 - ny * curvature * 0.5;

      result.push({
        key: nodeId,
        d: `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${dst.x} ${dst.y}`,
      });
    }
    return result;
  }, [overlays, overlayPositions, overlaySizes, nodesById, transform]);

  return (
    <section className="canvas-view" aria-label="Canvas graph view">
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

      {/* Tether lines from nodes to overlays — same style as inter-node edges */}
      {tethers.length > 0 && (
        <svg className="canvas-tether-layer" aria-hidden="true">
          {tethers.map((t) => (
            <path
              key={t.key}
              className="canvas-edge"
              d={t.d}
              fill="none"
              stroke="#00d4ff"
              strokeWidth={1}
              strokeOpacity={0.35}
            />
          ))}
        </svg>
      )}

      {/* Terminal overlays (HTML, positioned over SVG) */}
      {Array.from(overlays.entries()).map(([nodeId, entry]) => (
        <CanvasTerminalOverlay
          key={nodeId}
          node={entry.node}
          columns={columns}
          screenX={entry.screenX}
          screenY={entry.screenY}
          onClose={() => handleCloseOverlay(nodeId)}
          onMove={(left, top) => handleOverlayMove(nodeId, left, top)}
          onResize={(w, h) => handleOverlayResize(nodeId, w, h)}
        />
      ))}

      {/* Context menu */}
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
                  onDeleteActiveSession?.(contextMenu.tentacleId, contextMenu.sessionId);
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
