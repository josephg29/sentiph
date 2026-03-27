import { useMemo } from "react";

import type { GraphNode } from "../../app/canvas/types";
import {
  type OctopusAccessory,
  type OctopusAnimation,
  type OctopusExpression,
  OctopusGlyph,
} from "../EmptyOctopus";

const ANIMATIONS: OctopusAnimation[] = ["sway", "walk", "jog", "bounce", "float", "swim-up"];
const EXPRESSIONS: OctopusExpression[] = ["normal", "happy", "angry", "surprised"];
const ACCESSORIES: OctopusAccessory[] = ["none", "none", "long", "mohawk", "side-sweep", "curly"];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type OctopusVisuals = {
  animation: OctopusAnimation;
  expression: OctopusExpression;
  accessory: OctopusAccessory;
};

function deriveOctopusVisuals(tentacleId: string): OctopusVisuals {
  const rng = seededRandom(hashString(tentacleId));
  return {
    animation: ANIMATIONS[Math.floor(rng() * ANIMATIONS.length)] as OctopusAnimation,
    expression: EXPRESSIONS[Math.floor(rng() * EXPRESSIONS.length)] as OctopusExpression,
    accessory: ACCESSORIES[Math.floor(rng() * ACCESSORIES.length)] as OctopusAccessory,
  };
}

type OctopusNodeProps = {
  node: GraphNode;
  connectedNodes: GraphNode[];
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onClick: (nodeId: string) => void;
};

const buildArmPath = (
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  targetRadius: number,
): string => {
  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return "";

  // Shorten the endpoint so the edge stops at the target node's border
  const shortenBy = targetRadius + 2;
  const ratio = Math.max(0, (dist - shortenBy) / dist);
  const etx = cx + dx * ratio;
  const ety = cy + dy * ratio;

  const nx = -dy / dist;
  const ny = dx / dist;
  const curvature = dist * 0.2;

  const cp1x = cx + dx * 0.33 + nx * curvature;
  const cp1y = cy + dy * 0.33 + ny * curvature;
  const cp2x = cx + dx * 0.66 - nx * curvature * 0.5;
  const cp2y = cy + dy * 0.66 - ny * curvature * 0.5;

  return `M ${cx} ${cy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${etx} ${ety}`;
};

const GLYPH_SCALE = 4;
const GLYPH_W = 112;
const GLYPH_H = 120;

export const OctopusNode = ({
  node,
  connectedNodes,
  isSelected,
  onPointerDown,
  onClick,
}: OctopusNodeProps) => {
  const visuals = useMemo(() => deriveOctopusVisuals(node.tentacleId), [node.tentacleId]);
  const color = node.color;
  const edgeColor = "#00d4ff";

  return (
    <g
      className={`canvas-node canvas-node--tentacle${isSelected ? " canvas-node--selected" : ""}`}
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
      style={{ cursor: "grab" }}
    >
      {/* Invisible hit area for pointer events */}
      <rect x={-GLYPH_W / 2} y={-GLYPH_H / 2} width={GLYPH_W} height={GLYPH_H} fill="transparent" />

      {/* Edges — light tint of parent color */}
      {connectedNodes.map((target) => (
        <path
          key={target.id}
          className="canvas-edge"
          d={buildArmPath(0, 0, target.x - node.x, target.y - node.y, target.radius)}
          fill="none"
          stroke={edgeColor}
          strokeWidth={1}
          strokeOpacity={0.35}
        />
      ))}

      {/* Selection ring */}
      {isSelected && (
        <circle r={GLYPH_H / 2 + 4} fill="none" stroke="#ffffff" strokeWidth={1.5} opacity={0.5} />
      )}

      {/* Octopus glyph via foreignObject */}
      <foreignObject
        x={-GLYPH_W / 2}
        y={-GLYPH_H / 2}
        width={GLYPH_W}
        height={GLYPH_H}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <OctopusGlyph
            color={color}
            animation={visuals.animation}
            expression={visuals.expression}
            accessory={visuals.accessory}
            scale={GLYPH_SCALE}
          />
        </div>
      </foreignObject>

      {/* Label — always visible */}
      <text
        y={GLYPH_H / 2 - 12}
        textAnchor="middle"
        className="canvas-node-label canvas-node-label--tentacle canvas-node-label--always"
        fill="#faa32c"
      >
        {node.label.length > 18 ? `${node.label.slice(0, 16)}..` : node.label}
      </text>
    </g>
  );
};
