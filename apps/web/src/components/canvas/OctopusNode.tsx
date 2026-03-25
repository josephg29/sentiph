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

/** Mix a color toward white by a factor (0 = original, 1 = white). */
function lighten(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${[lr, lg, lb].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

type OctopusNodeProps = {
  node: GraphNode;
  connectedNodes: GraphNode[];
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onClick: (nodeId: string) => void;
};

const buildArmPath = (cx: number, cy: number, tx: number, ty: number): string => {
  const dx = tx - cx;
  const dy = ty - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return "";

  const nx = -dy / dist;
  const ny = dx / dist;
  const curvature = dist * 0.2;

  const cp1x = cx + dx * 0.33 + nx * curvature;
  const cp1y = cy + dy * 0.33 + ny * curvature;
  const cp2x = cx + dx * 0.66 - nx * curvature * 0.5;
  const cp2y = cy + dy * 0.66 - ny * curvature * 0.5;

  return `M ${cx} ${cy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`;
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
  const edgeColor = lighten(color, 0.6);

  return (
    <g
      className={`canvas-node canvas-node--tentacle${isSelected ? " canvas-node--selected" : ""}`}
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={(e) => {
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
      <rect
        x={-GLYPH_W / 2}
        y={-GLYPH_H / 2}
        width={GLYPH_W}
        height={GLYPH_H}
        fill="transparent"
      />

      {/* Edges — light tint of parent color */}
      {connectedNodes.map((target) => (
        <path
          key={target.id}
          className="canvas-edge"
          d={buildArmPath(0, 0, target.x - node.x, target.y - node.y)}
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

      {/* Label — hidden by default, CSS shows on hover */}
      <text
        y={GLYPH_H / 2 + 12}
        textAnchor="middle"
        className="canvas-node-label canvas-node-label--tentacle"
        fill="#d4d4d4"
      >
        {node.label.length > 18 ? `${node.label.slice(0, 16)}..` : node.label}
      </text>
    </g>
  );
};
