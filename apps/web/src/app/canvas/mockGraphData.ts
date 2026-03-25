import type { GraphEdge, GraphNode } from "./types";

const TENTACLE_RADIUS = 40;
const ACTIVE_SESSION_RADIUS = 12;
const INACTIVE_SESSION_RADIUS = 10;

const NODE_COLORS = [
  "#00b8d4",
  "#4dd0e1",
  "#66bb6a",
  "#cddc39",
  "#26c6da",
  "#81c784",
  "#aed581",
  "#ffee58",
  "#4db6ac",
  "#7986cb",
];

const AGENT_STATES = ["live", "idle", "queued", "blocked"] as const;
const WORKSPACE_MODES = ["shared", "worktree"] as const;

const TENTACLE_NAMES = [
  "auth-refactor",
  "payment-flow",
  "ci-pipeline",
  "dashboard-v2",
  "api-gateway",
  "db-migration",
  "search-index",
  "notif-service",
  "cache-layer",
  "log-pipeline",
  "user-onboard",
  "deploy-infra",
  "test-harness",
  "perf-tuning",
  "docs-gen",
];

const SESSION_LABELS = [
  "fix auth token refresh",
  "add retry logic to payment",
  "update CI config for Node 22",
  "redesign sidebar layout",
  "implement rate limiting",
  "migrate users table schema",
  "add full-text search",
  "push notification worker",
  "redis cache invalidation",
  "structured log format",
  "welcome email flow",
  "terraform ECS config",
  "integration test suite",
  "profile query optimizer",
  "auto-generate API docs",
  "refactor error handling",
  "add WebSocket reconnect",
  "implement RBAC policies",
  "optimize bundle size",
  "add health check endpoint",
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateMockGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rng = seededRandom(42);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const tentacleCount = TENTACLE_NAMES.length; // 15 tentacles

  // Distribute ~85 sessions across 15 tentacles (100 total nodes)
  // Some tentacles get more sessions to create visual variety
  const sessionsPerTentacle = [8, 7, 7, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 9];

  for (let i = 0; i < tentacleCount; i++) {
    const tentacleId = `mock-tentacle-${i}`;
    const tentacleNodeId = `t:${tentacleId}`;
    const color = NODE_COLORS[i % NODE_COLORS.length]!;
    const angle = (2 * Math.PI * i) / tentacleCount;
    const spread = 350;

    const mode = WORKSPACE_MODES[Math.floor(rng() * WORKSPACE_MODES.length)]!;
    const tentacleNode: GraphNode = {
      id: tentacleNodeId,
      type: "tentacle",
      x: Math.cos(angle) * spread,
      y: Math.sin(angle) * spread,
      vx: 0,
      vy: 0,
      pinned: false,
      radius: TENTACLE_RADIUS,
      tentacleId,
      label: TENTACLE_NAMES[i]!,
      color,
      workspaceMode: mode,
    };
    nodes.push(tentacleNode);

    const sessionCount = sessionsPerTentacle[i]!;
    for (let j = 0; j < sessionCount; j++) {
      const isActive = rng() > 0.45; // ~55% active, ~45% inactive
      const sessionId = `mock-session-${i}-${j}`;
      const nodeId = isActive ? `a:${sessionId}` : `i:${sessionId}`;
      const jitterX = (rng() - 0.5) * 120;
      const jitterY = (rng() - 0.5) * 120;
      const labelIndex = Math.floor(rng() * SESSION_LABELS.length);

      const base = {
        id: nodeId,
        x: tentacleNode.x + jitterX,
        y: tentacleNode.y + jitterY,
        vx: 0,
        vy: 0,
        pinned: false as const,
        tentacleId,
        label: SESSION_LABELS[labelIndex]!,
        color,
        sessionId,
      };

      const sessionNode: GraphNode = isActive
        ? {
            ...base,
            type: "active-session" as const,
            radius: ACTIVE_SESSION_RADIUS,
            agentState: AGENT_STATES[Math.floor(rng() * AGENT_STATES.length)]!,
          }
        : {
            ...base,
            type: "inactive-session" as const,
            radius: INACTIVE_SESSION_RADIUS,
            firstPromptPreview: SESSION_LABELS[labelIndex]!,
          };
      nodes.push(sessionNode);
      edges.push({ source: tentacleNodeId, target: nodeId });
    }
  }

  return { nodes, edges };
}
