import type { GraphEdge, GraphNode } from "../../app/canvas/types";
import { OctopusNode } from "../canvas/OctopusNode"; // TODO: rename to AgentNode
import { SessionNode } from "../canvas/SessionNode";
import { buildCanvasEdgePath, isEdgeActivityVisible, renderEdgeActivityDots } from "./helpers";
import type { ContextMenuState } from "./types";

type CanvasTransform = {
  translateX: number;
  translateY: number;
  scale: number;
};

type SessionEdge = { source: GraphNode; target: GraphNode };

type CanvasGraphLayerProps = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  isPanning: boolean;
  dragNodeId: string | null;
  transform: CanvasTransform;
  selectedNodeId: string | null;
  hideIdleTerminals: boolean;
  nodesById: Map<string, GraphNode>;
  edges: GraphEdge[];
  tentacleNodes: GraphNode[];
  sessionNodes: GraphNode[];
  sessionEdgesBySource: Map<string, SessionEdge[]>;
  handleCanvasPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  handleSvgPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  handleSvgPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  handleSvgClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  handleNodeClick: (nodeId: string) => void;
  setContextMenu: (value: ContextMenuState | null) => void;
  setSelectedNodeId: (value: string | null) => void;
};

export const CanvasGraphLayer = ({
  svgRef,
  isPanning,
  dragNodeId,
  transform,
  selectedNodeId,
  hideIdleTerminals,
  nodesById,
  edges,
  tentacleNodes,
  sessionNodes,
  sessionEdgesBySource,
  handleCanvasPointerDown,
  handleSvgPointerMove,
  handleSvgPointerUp,
  handleSvgClick,
  handleNodePointerDown,
  handleNodeClick,
  setContextMenu,
  setSelectedNodeId,
}: CanvasGraphLayerProps) => {
  return (
    <svg
      aria-label="Canvas graph"
      ref={svgRef}
      className={`canvas-svg${isPanning || dragNodeId ? " canvas-svg--panning" : ""}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
      onClick={handleSvgClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setContextMenu(null);
          setSelectedNodeId(null);
          return;
        }
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          setSelectedNodeId(null);
        }
      }}
    >
      <title>Canvas graph</title>
      <g
        transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}
      >
        {Array.from(sessionEdgesBySource.entries()).flatMap(([sourceId, group]) =>
          group.map(({ source, target }, index) => {
            const active = selectedNodeId === source.id || selectedNodeId === target.id;
            const selectedColor = selectedNodeId
              ? (nodesById.get(selectedNodeId)?.color ?? null)
              : null;
            const path = buildCanvasEdgePath(source, target, index, group.length);

            return (
              <g key={`${sourceId}->${target.id}`}>
                <path
                  className="canvas-edge"
                  d={path}
                  fill="none"
                  stroke={active ? (selectedColor ?? source.color) : "#C0C0C0"}
                  strokeWidth={active ? 2 : 1.5}
                  strokeOpacity={1}
                />
                {isEdgeActivityVisible(target)
                  ? renderEdgeActivityDots(
                      path,
                      active ? (selectedColor ?? source.color) : source.color,
                      `${sourceId}->${target.id}`,
                    )
                  : null}
              </g>
            );
          }),
        )}

        {/* Render tentacle nodes (with arms) first */}
        {tentacleNodes.map((node) => {
          const connected = edges
            .filter((e) => e.source === node.id)
            .map((e) => nodesById.get(e.target))
            .filter((n): n is GraphNode => {
              if (!n) return false;
              if (hideIdleTerminals && n.type === "inactive-session") return false;
              if (
                hideIdleTerminals &&
                n.type === "active-session" &&
                (n.agentState === "idle" || n.hasUserPrompt === false)
              )
                return false;
              return true;
            });

          const selectedColor = selectedNodeId
            ? (nodesById.get(selectedNodeId)?.color ?? null)
            : null;

          return (
            <OctopusNode
              key={node.id}
              node={node}
              connectedNodes={connected}
              isSelected={selectedNodeId === node.id}
              selectedNodeId={selectedNodeId}
              selectedNodeColor={selectedColor}
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
  );
};
