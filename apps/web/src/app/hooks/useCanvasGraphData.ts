import { useCallback, useEffect, useRef, useState } from "react";

import { buildConversationsUrl } from "../../runtime/runtimeEndpoints";
import type { GraphEdge, GraphNode } from "../canvas/types";
import { normalizeConversationSessionSummary } from "../conversationNormalizers";
import type { ConversationSessionSummary, TerminalView } from "../types";
import type { AgentRuntimeStateInfo } from "./useAgentRuntimeStates";

const ACTIVE_SESSION_RADIUS = 12;
const INACTIVE_SESSION_RADIUS = 10;

const SENTIPH_RADIUS = 52;
export const SENTIPH_ID = "__sentiph__";
const SENTIPH_NODE_ID = `t:${SENTIPH_ID}`;

const getAccentPrimary = (): string =>
  typeof document !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue("--accent-primary").trim()
    : "#6366f1";

type UseCanvasGraphDataOptions = {
  columns: TerminalView;
  enabled: boolean;
  agentRuntimeStates: ReadonlyMap<string, AgentRuntimeStateInfo>;
};

type UseCanvasGraphDataResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  tentacleById: ReadonlyMap<string, { displayName: string; color: string | null }>;
  sessionsByTentacleId: ReadonlyMap<string, ConversationSessionSummary[]>;
  refresh: () => Promise<void>;
};

const buildActiveSessionNodeId = (agentId: string) => `a:${agentId}`;
const buildInactiveSessionNodeId = (sessionId: string) => `i:${sessionId}`;

const tentacleColor = (tentacleId: string, _color: string | null | undefined): string => {
  if (_color) return _color;
  const hue = tentacleId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) * 37;
  return `hsl(${hue % 360}, 55%, 55%)`;
};

export const useCanvasGraphData = ({
  columns,
  enabled,
  agentRuntimeStates,
}: UseCanvasGraphDataOptions): UseCanvasGraphDataResult => {
  const [inactiveSessions, setInactiveSessions] = useState<ConversationSessionSummary[]>([]);
  const prevNodesRef = useRef<Map<string, GraphNode>>(new Map());

  const fetchInactiveSessions = useCallback(async () => {
    try {
      const response = await fetch(buildConversationsUrl(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) return;
      const sessions = payload
        .map((entry) => normalizeConversationSessionSummary(entry))
        .filter((entry): entry is ConversationSessionSummary => entry !== null);
      setInactiveSessions(sessions);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setInactiveSessions([]);
      return;
    }

    void fetchInactiveSessions();
  }, [enabled, fetchInactiveSessions]);

  const refresh = useCallback(async () => {
    await fetchInactiveSessions();
  }, [fetchInactiveSessions]);

  const activeTerminalIds = new Set(columns.map((terminal) => terminal.terminalId));

  const sessionsByTentacleId = new Map<string, ConversationSessionSummary[]>();
  for (const session of inactiveSessions) {
    if (!session.tentacleId) continue;
    const tentacleSessions = sessionsByTentacleId.get(session.tentacleId);
    if (tentacleSessions) {
      tentacleSessions.push(session);
    } else {
      sessionsByTentacleId.set(session.tentacleId, [session]);
    }
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const prevNodes = prevNodesRef.current;
  const currentNodesById = new Map<string, GraphNode>();

  const sentiphColor = getAccentPrimary();
  const sentiphNode: GraphNode = {
    id: SENTIPH_NODE_ID,
    type: "sentiph",
    x: prevNodes.get(SENTIPH_NODE_ID)?.x ?? 0,
    y: prevNodes.get(SENTIPH_NODE_ID)?.y ?? 0,
    vx: prevNodes.get(SENTIPH_NODE_ID)?.vx ?? 0,
    vy: prevNodes.get(SENTIPH_NODE_ID)?.vy ?? 0,
    pinned: prevNodes.get(SENTIPH_NODE_ID)?.pinned ?? false,
    radius: SENTIPH_RADIUS,
    tentacleId: SENTIPH_ID,
    label: "Sentiph",
    color: sentiphColor,
  };
  nodes.push(sentiphNode);
  currentNodesById.set(SENTIPH_NODE_ID, sentiphNode);

  // Active terminal sessions — one per terminal
  for (const terminal of columns) {
    const sessionNodeId = buildActiveSessionNodeId(terminal.terminalId);
    const prevSession = prevNodes.get(sessionNodeId);
    const parentNodeId = terminal.parentTerminalId
      ? buildActiveSessionNodeId(terminal.parentTerminalId)
      : SENTIPH_NODE_ID;
    const parentNode = currentNodesById.get(parentNodeId) ?? sentiphNode;
    const jitter = () => (Math.random() - 0.5) * 60;

    const runtimeInfo = agentRuntimeStates?.get(terminal.terminalId);
    const color = terminal.color ?? sentiphColor;

    const sessionNode: GraphNode = {
      id: sessionNodeId,
      type: "active-session",
      x: prevSession?.x ?? parentNode.x + jitter(),
      y: prevSession?.y ?? parentNode.y + jitter(),
      vx: prevSession?.vx ?? 0,
      vy: prevSession?.vy ?? 0,
      pinned: prevSession?.pinned ?? false,
      radius: ACTIVE_SESSION_RADIUS,
      tentacleId: terminal.tentacleId,
      label: terminal.tentacleName || terminal.terminalId,
      color,
      sessionId: terminal.terminalId,
      agentState: terminal.state,
      hasUserPrompt: terminal.hasUserPrompt ?? false,
      ...(terminal.workspaceMode ? { workspaceMode: terminal.workspaceMode } : {}),
      ...(terminal.parentTerminalId ? { parentTerminalId: terminal.parentTerminalId } : {}),
      ...(runtimeInfo ? { agentRuntimeState: runtimeInfo.state } : {}),
      ...(runtimeInfo?.toolName ? { waitingToolName: runtimeInfo.toolName } : {}),
    };
    nodes.push(sessionNode);
    currentNodesById.set(sessionNodeId, sessionNode);
    edges.push({ source: parentNodeId, target: sessionNodeId });
  }

  // Inactive sessions from conversations
  for (const session of inactiveSessions) {
    if (activeTerminalIds.has(session.sessionId)) continue;

    const sessionNodeId = buildInactiveSessionNodeId(session.sessionId);
    const prevSession = prevNodes.get(sessionNodeId);
    const jitterFn = () => (Math.random() - 0.5) * 60;
    const color = tentacleColor(session.tentacleId ?? "", null);

    const sessionNode: GraphNode = {
      id: sessionNodeId,
      type: "inactive-session",
      x: prevSession?.x ?? sentiphNode.x + jitterFn(),
      y: prevSession?.y ?? sentiphNode.y + jitterFn(),
      vx: prevSession?.vx ?? 0,
      vy: prevSession?.vy ?? 0,
      pinned: prevSession?.pinned ?? false,
      radius: INACTIVE_SESSION_RADIUS,
      tentacleId: session.tentacleId ?? SENTIPH_ID,
      label: session.firstUserTurnPreview
        ? session.firstUserTurnPreview.slice(0, 40)
        : session.sessionId.slice(0, 12),
      color,
      sessionId: session.sessionId,
      ...(session.firstUserTurnPreview !== null
        ? { firstPromptPreview: session.firstUserTurnPreview }
        : {}),
    };
    nodes.push(sessionNode);
    currentNodesById.set(sessionNodeId, sessionNode);
    edges.push({ source: SENTIPH_NODE_ID, target: sessionNodeId });
  }

  // Update position cache
  const nextMap = new Map<string, GraphNode>();
  for (const n of nodes) {
    nextMap.set(n.id, n);
  }
  prevNodesRef.current = nextMap;

  return {
    nodes,
    edges,
    tentacleById: new Map(),
    sessionsByTentacleId,
    refresh,
  };
};
