import type { GraphNode } from "../../app/canvas/types";

export const CLICK_THRESHOLD = 5;
export const GRAPH_MIN_WIDTH = 300;
export const TERMINAL_MIN_WIDTH = 370;
export const ACTIVE_SESSION_RADIUS = 12;

export const buildActiveSessionNodeId = (terminalId: string) => `a:${terminalId}`;
export const buildTentacleNodeId = (tentacleId: string) => `t:${tentacleId}`;

export const buildCanvasEdgePath = (
  source: GraphNode,
  target: GraphNode,
  edgeIndex: number,
  edgeCount: number,
): string => {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return "";

  const shortenSourceBy = source.radius + 6;
  const shortenTargetBy = target.radius + 6;
  const startRatio = Math.min(1, shortenSourceBy / dist);
  const endRatio = Math.max(0, (dist - shortenTargetBy) / dist);
  const sx = source.x + dx * startRatio;
  const sy = source.y + dy * startRatio;
  const tx = source.x + dx * endRatio;
  const ty = source.y + dy * endRatio;

  const curvature = edgeCount <= 1 ? 0.18 : (edgeIndex / (edgeCount - 1) - 0.5) * 1.2;
  const offsetRatio = edgeCount <= 1 ? 0.16 : 0.18;
  const baseOffset = Math.max(16, Math.min(32, dist * offsetRatio));
  const offsetX = (-dy / dist) * curvature * baseOffset;
  const offsetY = (dx / dist) * curvature * baseOffset;
  const cpx = (sx + tx) / 2 + offsetX;
  const cpy = (sy + ty) / 2 + offsetY;

  return `M ${sx} ${sy} Q ${cpx} ${cpy} ${tx} ${ty}`;
};

export const isEdgeActivityVisible = (target: GraphNode): boolean =>
  target.type === "active-session" &&
  target.hasUserPrompt !== false &&
  target.agentRuntimeState !== undefined &&
  target.agentRuntimeState !== "idle";

export const renderEdgeActivityDots = (path: string, color: string, keyPrefix: string) =>
  [0, 1, 2].flatMap((index) => [
    <circle
      key={`${keyPrefix}-trail-${index}`}
      className="canvas-edge-activity-dot canvas-edge-activity-dot--trail"
      r={4.6}
      fill={color}
      opacity={Math.max(0.14, 0.28 - index * 0.04)}
    >
      <animateMotion
        path={path}
        begin={`${index * 0.62}s`}
        dur="1.9s"
        repeatCount="indefinite"
        rotate="auto"
      />
      <animate
        attributeName="r"
        values="3.8;5.2;3.8"
        dur="1.9s"
        begin={`${index * 0.62}s`}
        repeatCount="indefinite"
      />
    </circle>,
    <circle
      key={`${keyPrefix}-dot-${index}`}
      className="canvas-edge-activity-dot"
      r={3.2}
      fill="#fff4cc"
      stroke={color}
      strokeWidth={1.2}
      opacity={Math.max(0.7, 1 - index * 0.08)}
    >
      <animateMotion
        path={path}
        begin={`${index * 0.62}s`}
        dur="1.9s"
        repeatCount="indefinite"
        rotate="auto"
      />
      <animate
        attributeName="r"
        values="2.8;3.8;2.8"
        dur="1.9s"
        begin={`${index * 0.62}s`}
        repeatCount="indefinite"
      />
    </circle>,
  ]);
