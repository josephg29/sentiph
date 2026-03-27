import type { GraphNode } from "../../app/canvas/types";

type SessionNodeProps = {
  node: GraphNode;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onClick: (nodeId: string) => void;
};

export const SessionNode = ({ node, isSelected, onPointerDown, onClick }: SessionNodeProps) => {
  const isActive = node.type === "active-session";
  const isLive = isActive && node.agentState === "live";
  const color = isActive ? node.color : "#9ca3af";

  return (
    <g
      className={`canvas-node canvas-node--session${isSelected ? " canvas-node--selected" : ""}${isActive ? " canvas-node--active" : " canvas-node--inactive"}`}
      data-node-id={node.id}
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPointerDown(e, node.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(node.id);
      }}
      style={{ cursor: "pointer" }}
    >
      {/* Focused shine — white glow behind everything */}
      {isSelected && (
        <circle className="canvas-node-focus-glow" r={node.radius + 12} fill="#ffffff" />
      )}

      {/* Subtle glow halo */}
      <circle
        className={`canvas-node-bloom${isLive ? " canvas-node-bloom--pulse" : ""}`}
        r={node.radius + 3}
        fill={color}
        opacity={isActive ? 0.25 : 0.1}
      />

      {/* Bright core dot */}
      <circle
        className="canvas-node-core"
        r={node.radius}
        fill={color}
        opacity={isActive ? 1 : 0.4}
      />

      {/* Label — always visible */}
      <text
        y={node.radius + 16}
        textAnchor="middle"
        className="canvas-node-label canvas-node-label--session canvas-node-label--always"
        fill="var(--accent-primary)"
      >
        {node.label.length > 24 ? `${node.label.slice(0, 22)}..` : node.label}
      </text>
    </g>
  );
};
