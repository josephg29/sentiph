import { useCallback, useRef } from "react";

import type { GraphNode } from "../../app/canvas/types";
import { SENTIPH_ID } from "../../app/hooks/useCanvasGraphData";
import type { TerminalView } from "../../app/types";
import { CLICK_THRESHOLD, buildActiveSessionNodeId } from "./helpers";
import type { ContextMenuState } from "./types";

type UseCanvasNodeHandlersParams = {
  nodesById: Map<string, GraphNode>;
  columns: TerminalView;
  svgRef: React.RefObject<SVGSVGElement | null>;
  openTerminals: Map<string, GraphNode>;
  resolveActiveSessionNode: (terminalId: string) => GraphNode | null;
  pinNode: (id: string) => void;
  unpinNode: (id: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  reheat: () => void;
  screenToGraph: (x: number, y: number) => { x: number; y: number };
  onNavigateToConversation: ((sessionId: string) => void) | undefined;
  onCreateAgent: ((tentacleId: string) => Promise<string | undefined> | undefined) | undefined;
  onTentacleAction:
    | ((tentacleId: string, action: string) => Promise<string | undefined> | undefined)
    | undefined;
  onSentiphAction: ((action: string) => Promise<string | undefined> | undefined) | undefined;
  onCloseActiveSession:
    | ((terminalId: string, terminalName: string, workspaceMode?: string) => void)
    | undefined;
  setDragNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setOpenTerminals: React.Dispatch<React.SetStateAction<Map<string, GraphNode>>>;
  setOpenTentacles: React.Dispatch<React.SetStateAction<Map<string, GraphNode>>>;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
  setPendingOpenAgentId: React.Dispatch<React.SetStateAction<string | null>>;
  dragNodeId: string | null;
  handleCanvasPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  handleCanvasPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
};

type UseCanvasNodeHandlersResult = {
  dragStartRef: React.RefObject<{ x: number; y: number } | null>;
  sentiphTerminalInFlight: React.RefObject<boolean>;
  handleNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  handleSvgPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  handleSvgPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  handleSvgClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleNodeClick: (nodeId: string) => void;
  handleCreateAgent: (tentacleId: string) => void;
  handleSentiphAction: (action: string) => void;
  handleTentacleAction: (tentacleId: string, action: string) => void;
  handleCloseTentacle: (nodeId: string) => void;
  handleMinimizeTerminal: (nodeId: string) => void;
  handleCloseTerminal: (node: GraphNode) => void;
};

export const useCanvasNodeHandlers = ({
  nodesById,
  columns,
  svgRef,
  openTerminals,
  resolveActiveSessionNode,
  pinNode,
  unpinNode,
  moveNode,
  reheat,
  screenToGraph,
  onNavigateToConversation,
  onCreateAgent,
  onTentacleAction,
  onSentiphAction,
  onCloseActiveSession,
  setDragNodeId,
  setSelectedNodeId,
  setOpenTerminals,
  setOpenTentacles,
  setContextMenu,
  setPendingOpenAgentId,
  dragNodeId,
  handleCanvasPointerMove,
  handleCanvasPointerUp,
}: UseCanvasNodeHandlersParams): UseCanvasNodeHandlersResult => {
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const nodeClickedRef = useRef(false);
  const sentiphTerminalInFlight = useRef(false);

  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (e.button !== 0) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setDragNodeId(nodeId);
      pinNode(nodeId);
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [pinNode, svgRef, setDragNodeId],
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

  const handleCreateAgent = useCallback(
    (tentacleId: string) => {
      if (!onCreateAgent) return;
      setContextMenu(null);
      const result = onCreateAgent(tentacleId);
      if (result && typeof result.then === "function") {
        void result.then((agentId) => {
          sentiphTerminalInFlight.current = false;
          if (agentId) setPendingOpenAgentId(agentId);
        });
      } else {
        sentiphTerminalInFlight.current = false;
      }
    },
    [onCreateAgent, setContextMenu, setPendingOpenAgentId],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      const node = nodesById.get(nodeId);
      if (!node) return;

      if (node.type === "active-session") {
        const resolvedNode = node.sessionId
          ? (resolveActiveSessionNode(node.sessionId) ?? node)
          : node;
        setOpenTerminals((prev) => {
          const next = new Map(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.set(nodeId, { ...resolvedNode });
          }
          return next;
        });
      } else if (node.type === "tentacle") {
        setOpenTentacles((prev) => {
          const next = new Map(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.set(nodeId, { ...node });
          }
          return next;
        });
      } else if (node.type === "sentiph") {
        const existingSentiphTerminal = columns.find((t) => t.tentacleId === SENTIPH_ID);
        if (existingSentiphTerminal) {
          const sessionNodeId = `a:${existingSentiphTerminal.terminalId}`;
          setOpenTerminals((prev) => {
            const next = new Map(prev);
            if (next.has(sessionNodeId)) {
              next.delete(sessionNodeId);
            } else {
              const sessionNode = nodesById.get(sessionNodeId);
              if (sessionNode) {
                next.set(sessionNodeId, { ...sessionNode });
              }
            }
            return next;
          });
        } else if (!sentiphTerminalInFlight.current) {
          sentiphTerminalInFlight.current = true;
          handleCreateAgent(node.tentacleId);
        }
      } else if (node.type === "inactive-session" && node.sessionId) {
        onNavigateToConversation?.(node.sessionId);
      }
    },
    [
      nodesById,
      columns,
      onNavigateToConversation,
      resolveActiveSessionNode,
      handleCreateAgent,
      setSelectedNodeId,
      setOpenTerminals,
      setOpenTentacles,
    ],
  );

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
          nodeClickedRef.current = true;
          handleNodeClick(dragNodeId);
        }

        setDragNodeId(null);
        dragStartRef.current = null;
        return;
      }
      handleCanvasPointerUp(e);
    },
    [dragNodeId, unpinNode, reheat, handleCanvasPointerUp, handleNodeClick, setDragNodeId],
  );

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (nodeClickedRef.current) {
        nodeClickedRef.current = false;
        return;
      }
      if (e.target === e.currentTarget) {
        setSelectedNodeId(null);
      }
    },
    [setSelectedNodeId],
  );

  const handleSentiphAction = useCallback(
    (action: string) => {
      setContextMenu(null);
      const result = onSentiphAction?.(action);
      if (result && typeof result.then === "function") {
        void result.then((agentId) => {
          if (agentId) setPendingOpenAgentId(agentId);
        });
      }
    },
    [onSentiphAction, setContextMenu, setPendingOpenAgentId],
  );

  const handleTentacleAction = useCallback(
    (tentacleId: string, action: string) => {
      setContextMenu(null);
      const result = onTentacleAction?.(tentacleId, action);
      if (result && typeof result.then === "function") {
        void result.then((agentId) => {
          if (agentId) setPendingOpenAgentId(agentId);
        });
      }
    },
    [onTentacleAction, setContextMenu, setPendingOpenAgentId],
  );

  const handleCloseTentacle = useCallback(
    (nodeId: string) => {
      setOpenTentacles((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
    },
    [setOpenTentacles, setSelectedNodeId],
  );

  const handleMinimizeTerminal = useCallback(
    (nodeId: string) => {
      setOpenTerminals((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
    },
    [setOpenTerminals, setSelectedNodeId],
  );

  const handleCloseTerminal = useCallback(
    (node: GraphNode) => {
      if (!node.sessionId) {
        return;
      }

      const terminal = columns.find((entry) => entry.terminalId === node.sessionId);
      onCloseActiveSession?.(
        node.sessionId,
        terminal?.tentacleName ?? node.label,
        terminal?.workspaceMode ?? node.workspaceMode,
      );
    },
    [columns, onCloseActiveSession],
  );

  return {
    dragStartRef,
    sentiphTerminalInFlight,
    handleNodePointerDown,
    handleSvgPointerMove,
    handleSvgPointerUp,
    handleSvgClick,
    handleNodeClick,
    handleCreateAgent,
    handleSentiphAction,
    handleTentacleAction,
    handleCloseTentacle,
    handleMinimizeTerminal,
    handleCloseTerminal,
  };
};
