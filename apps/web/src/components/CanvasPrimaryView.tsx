import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphNode } from "../app/canvas/types";
import { useAgentRuntimeStates } from "../app/hooks/useAgentRuntimeStates";
import { SENTIPH_ID, useCanvasGraphData } from "../app/hooks/useCanvasGraphData";
import { useCanvasTransform } from "../app/hooks/useCanvasTransform";
import { DEFAULT_FORCE_PARAMS, useForceSimulation } from "../app/hooks/useForceSimulation";
import type { PendingDeleteTerminal } from "../app/hooks/useTerminalMutations";
import {
  type TerminalRuntimeStateStore,
  createTerminalRuntimeStateStore,
} from "../app/terminalRuntimeStateStore";
import type { TerminalView, TerminalWorkspaceMode } from "../app/types";
import { CanvasContextMenu } from "./CanvasPrimaryView/CanvasContextMenu";
import { CanvasDialogs } from "./CanvasPrimaryView/CanvasDialogs";
import { CanvasGraphLayer } from "./CanvasPrimaryView/CanvasGraphLayer";
import { CanvasTerminalsPanel } from "./CanvasPrimaryView/CanvasTerminalsPanel";
import { CanvasToolbar } from "./CanvasPrimaryView/CanvasToolbar";
import {
  ACTIVE_SESSION_RADIUS,
  CLICK_THRESHOLD,
  buildActiveSessionNodeId,
  buildTentacleNodeId,
} from "./CanvasPrimaryView/helpers";
import type { ContextMenuState } from "./CanvasPrimaryView/types";
import { useCanvasContextMenu } from "./CanvasPrimaryView/useCanvasContextMenu";
import { usePanelFocusScroll } from "./CanvasPrimaryView/usePanelFocusScroll";
import { useTerminalsPanelResize } from "./CanvasPrimaryView/useTerminalsPanelResize";

type CanvasPrimaryViewProps = {
  columns: TerminalView;
  runtimeStateStore?: TerminalRuntimeStateStore;
  isUiStateHydrated?: boolean;
  canvasOpenTerminalIds?: string[];
  canvasOpenTentacleIds?: string[];
  canvasTerminalsPanelWidth?: number | null;
  recentlyCreatedTerminal?: TerminalView[number] | null;
  onCanvasOpenTerminalIdsChange?: (ids: string[]) => void;
  onCanvasOpenTentacleIdsChange?: (ids: string[]) => void;
  onCanvasTerminalsPanelWidthChange?: (width: number | null) => void;
  onCreateAgent?: (tentacleId: string) => Promise<string | undefined> | undefined;
  onCreateTerminal?: () => Promise<string | undefined> | undefined;
  onCreateWorktreeTerminal?: () => Promise<string | undefined> | undefined;
  onSentiphAction?: (action: string) => Promise<string | undefined> | undefined;
  onTentacleAction?: (
    tentacleId: string,
    action: string,
  ) => Promise<string | undefined> | undefined;
  onNavigateToConversation?: (sessionId: string) => void;
  onCloseActiveSession?: (terminalId: string, terminalName: string, workspaceMode?: string) => void;
  onDeleteActiveSession?: (
    terminalId: string,
    terminalName: string,
    workspaceMode?: string,
  ) => void;
  pendingDeleteTerminal?: PendingDeleteTerminal | null;
  isDeletingTerminalId?: string | null;
  onCancelDelete?: () => void;
  onConfirmDelete?: () => void;
  onTerminalRenamed?: ((terminalId: string, tentacleName: string) => void) | undefined;
  onTerminalActivity?: ((terminalId: string) => void) | undefined;
  onRefreshColumns?: () => Promise<void> | void;
};

export const CanvasPrimaryView = ({
  columns,
  runtimeStateStore: providedRuntimeStateStore,
  isUiStateHydrated,
  canvasOpenTerminalIds,
  canvasOpenTentacleIds,
  canvasTerminalsPanelWidth: persistedTerminalsPanelWidth,
  recentlyCreatedTerminal,
  onCanvasOpenTerminalIdsChange,
  onCanvasOpenTentacleIdsChange,
  onCanvasTerminalsPanelWidthChange,
  onCreateAgent,
  onCreateTerminal,
  onCreateWorktreeTerminal,
  onSentiphAction,
  onTentacleAction,
  onNavigateToConversation,
  onCloseActiveSession,
  onDeleteActiveSession,
  pendingDeleteTerminal,
  isDeletingTerminalId,
  onCancelDelete,
  onConfirmDelete,
  onTerminalRenamed,
  onTerminalActivity,
  onRefreshColumns,
}: CanvasPrimaryViewProps) => {
  const runtimeStateStoreRef = useRef<TerminalRuntimeStateStore | null>(null);
  if (runtimeStateStoreRef.current === null) {
    runtimeStateStoreRef.current = providedRuntimeStateStore ?? createTerminalRuntimeStateStore();
  }
  const runtimeStateStore = providedRuntimeStateStore ?? runtimeStateStoreRef.current;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [openTerminals, setOpenTerminals] = useState<Map<string, GraphNode>>(new Map());
  const [openTentacles, setOpenTentacles] = useState<Map<string, GraphNode>>(new Map());
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [terminalsPanelWidth, setTerminalsPanelWidth] = useState<number | null>(null);
  const [pendingOpenAgentId, setPendingOpenAgentId] = useState<string | null>(null);
  const [hideIdleTerminals, setHideIdleTerminals] = useState(false);
  const hasHydratedTerminals = useRef(false);
  const hasHydratedTentacles = useRef(false);
  const lastHandledCreatedTerminalIdRef = useRef<string | null>(null);
  const sentiphTerminalInFlight = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const nodeClickedRef = useRef(false);
  const containerRef = useRef<HTMLElement>(null);
  const terminalsPanelRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef(new Map<string, HTMLElement>());

  const agentRuntimeStates = useAgentRuntimeStates(runtimeStateStore, columns);

  const {
    nodes,
    edges,
    tentacleById,
    sessionsByTentacleId,
    refresh: refreshGraphData,
  } = useCanvasGraphData({ columns, enabled: true, agentRuntimeStates });

  const {
    transform,
    isPanning,
    svgRef,
    handlePointerDown: handleCanvasPointerDown,
    handlePointerMove: handleCanvasPointerMove,
    handlePointerUp: handleCanvasPointerUp,
    screenToGraph,
    fitAll,
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

  const resolveActiveSessionNode = useCallback(
    (terminalId: string): GraphNode | null => {
      const nodeId = buildActiveSessionNodeId(terminalId);
      const existingNode = nodesById.get(nodeId);
      const terminal = columns.find((entry) => entry.terminalId === terminalId);
      if (!terminal) {
        return existingNode?.type === "active-session" ? existingNode : null;
      }

      const parentNodeId = terminal.parentTerminalId
        ? buildActiveSessionNodeId(terminal.parentTerminalId)
        : buildTentacleNodeId(terminal.tentacleId);
      const anchorNode =
        existingNode?.type === "active-session"
          ? existingNode
          : (nodesById.get(parentNodeId) ??
            nodesById.get(buildTentacleNodeId(terminal.tentacleId)));

      return {
        id: nodeId,
        type: "active-session",
        x: anchorNode?.x ?? 0,
        y: anchorNode?.y ?? 0,
        vx: 0,
        vy: 0,
        pinned: false,
        radius: ACTIVE_SESSION_RADIUS,
        tentacleId: terminal.tentacleId,
        label: terminal.tentacleName || terminal.label || terminal.terminalId,
        color: anchorNode?.color ?? "#c0c0c0",
        sessionId: terminal.terminalId,
        agentState: terminal.state,
        hasUserPrompt: terminal.hasUserPrompt ?? false,
        ...(terminal.workspaceMode ? { workspaceMode: terminal.workspaceMode } : {}),
        ...(terminal.parentTerminalId ? { parentTerminalId: terminal.parentTerminalId } : {}),
      };
    },
    [columns, nodesById],
  );

  // Hydrate open terminals after a settling delay so all async data (columns,
  // graph nodes, simulation) has time to land before we attempt the lookup.
  const [isHydratingTerminals, setIsHydratingTerminals] = useState(false);

  useEffect(() => {
    if (hasHydratedTerminals.current) return;
    if (!isUiStateHydrated) return;
    if (!canvasOpenTerminalIds || canvasOpenTerminalIds.length === 0) {
      hasHydratedTerminals.current = true;
      return;
    }

    setIsHydratingTerminals(true);
    const timer = window.setTimeout(() => {
      setIsHydratingTerminals(false);
      hasHydratedTerminals.current = true;
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isUiStateHydrated, canvasOpenTerminalIds]);

  // Once the settling timer fires, perform the actual hydration from the
  // simulation graph which should now be fully populated.
  const openTerminalCount = openTerminals.size;
  useEffect(() => {
    if (isHydratingTerminals) return;
    if (!hasHydratedTerminals.current) return;
    if (openTerminalCount > 0) return;
    if (!canvasOpenTerminalIds || canvasOpenTerminalIds.length === 0) return;

    const restoredMap = new Map<string, GraphNode>();
    for (const nodeId of canvasOpenTerminalIds) {
      const node = nodesById.get(nodeId);
      if (node && node.type === "active-session") {
        restoredMap.set(nodeId, { ...node });
      }
    }
    if (restoredMap.size > 0) {
      setOpenTerminals(restoredMap);
    }

    if (persistedTerminalsPanelWidth != null && persistedTerminalsPanelWidth > 0) {
      setTerminalsPanelWidth(persistedTerminalsPanelWidth);
    }
  }, [
    isHydratingTerminals,
    openTerminalCount,
    canvasOpenTerminalIds,
    persistedTerminalsPanelWidth,
    nodesById,
  ]);

  // Persist open terminal IDs when they change
  useEffect(() => {
    if (!hasHydratedTerminals.current) return;
    onCanvasOpenTerminalIdsChange?.(Array.from(openTerminals.keys()));
  }, [openTerminals, onCanvasOpenTerminalIdsChange]);

  useEffect(() => {
    setOpenTerminals((current) => {
      let didChange = false;
      const next = new Map<string, GraphNode>();

      for (const [nodeId, node] of current) {
        if (!node.sessionId) {
          next.set(nodeId, node);
          continue;
        }

        const terminal = columns.find((entry) => entry.terminalId === node.sessionId);
        if (!terminal) {
          didChange = true;
          continue;
        }

        const nextLabel = terminal.tentacleName || terminal.label || terminal.terminalId;
        const nextNode: GraphNode = {
          ...node,
          tentacleId: terminal.tentacleId,
          label: nextLabel,
          agentState: terminal.state,
          hasUserPrompt: terminal.hasUserPrompt ?? false,
          ...(terminal.workspaceMode ? { workspaceMode: terminal.workspaceMode } : {}),
          ...(terminal.parentTerminalId ? { parentTerminalId: terminal.parentTerminalId } : {}),
        };

        if (
          node.label !== nextNode.label ||
          node.tentacleId !== nextNode.tentacleId ||
          node.agentState !== nextNode.agentState ||
          node.hasUserPrompt !== nextNode.hasUserPrompt ||
          node.workspaceMode !== nextNode.workspaceMode ||
          node.parentTerminalId !== nextNode.parentTerminalId
        ) {
          didChange = true;
          next.set(nodeId, nextNode);
          continue;
        }

        next.set(nodeId, node);
      }

      return didChange ? next : current;
    });
  }, [columns]);

  // Hydrate open tentacles from persisted IDs.
  // Gate on tentacle-type nodes being present.
  const hasTentacleNodes = simulatedNodes.some((n) => n.type === "tentacle");
  const openTentacleCount = openTentacles.size;
  useEffect(() => {
    if (hasHydratedTentacles.current) return;
    if (!isUiStateHydrated) return;
    if (!hasTentacleNodes) return;

    if (canvasOpenTentacleIds && canvasOpenTentacleIds.length > 0) {
      const restoredMap = new Map<string, GraphNode>();
      for (const nodeId of canvasOpenTentacleIds) {
        const node = nodesById.get(nodeId);
        if (node && (node.type === "tentacle" || node.type === "sentiph")) {
          restoredMap.set(nodeId, { ...node });
        }
      }
      if (restoredMap.size > 0) {
        setOpenTentacles(restoredMap);
      }
    }

    hasHydratedTentacles.current = true;
  }, [isUiStateHydrated, canvasOpenTentacleIds, hasTentacleNodes, nodesById]);

  // Persist open tentacle IDs when they change
  useEffect(() => {
    if (!hasHydratedTentacles.current) return;
    onCanvasOpenTentacleIdsChange?.(Array.from(openTentacles.keys()));
  }, [openTentacles, onCanvasOpenTentacleIdsChange]);

  // Persist terminals panel width only when user has explicitly dragged the divider
  useEffect(() => {
    if (!hasHydratedTerminals.current) return;
    if (terminalsPanelWidth == null) return;
    onCanvasTerminalsPanelWidthChange?.(terminalsPanelWidth);
  }, [terminalsPanelWidth, onCanvasTerminalsPanelWidthChange]);

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
    [onCreateAgent],
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
    [nodesById, columns, onNavigateToConversation, resolveActiveSessionNode, handleCreateAgent],
  );

  const setPanelRef = useCallback(
    (nodeId: string) => (element: HTMLElement | null) => {
      if (element) {
        panelRefs.current.set(nodeId, element);
        return;
      }
      panelRefs.current.delete(nodeId);
    },
    [],
  );

  const handleCloseTentacle = useCallback((nodeId: string) => {
    setOpenTentacles((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const handleMinimizeTerminal = useCallback((nodeId: string) => {
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

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

  // Divider drag + wheel-scroll handlers for the terminals panel
  const { handleDividerPointerDown, handleDividerPointerMove, handleDividerPointerUp } =
    useTerminalsPanelResize({
      containerRef,
      terminalsPanelRef,
      terminalsPanelWidth,
      isHydratingTerminals,
      openTerminalCount,
      openTentacleCount,
      setTerminalsPanelWidth,
    });

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
    [dragNodeId, unpinNode, reheat, handleCanvasPointerUp, handleNodeClick],
  );

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (nodeClickedRef.current) {
      nodeClickedRef.current = false;
      return;
    }
    if (e.target === e.currentTarget) {
      setSelectedNodeId(null);
    }
  }, []);

  // Native contextmenu listener — must be native to reliably preventDefault
  useCanvasContextMenu({
    svgRef,
    nodesById,
    onNavigateToConversation,
    setContextMenu,
  });

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
    [onSentiphAction],
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
    [onTentacleAction],
  );

  // Auto-open terminal for newly created agent once it appears in the graph
  useEffect(() => {
    if (!pendingOpenAgentId) return;
    const nodeId = buildActiveSessionNodeId(pendingOpenAgentId);
    const node = resolveActiveSessionNode(pendingOpenAgentId);
    if (!node) return;
    setPendingOpenAgentId(null);
    setSelectedNodeId(nodeId);
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { ...node });
      return next;
    });
  }, [pendingOpenAgentId, resolveActiveSessionNode]);

  useEffect(() => {
    if (!isUiStateHydrated || !recentlyCreatedTerminal) {
      return;
    }
    if (lastHandledCreatedTerminalIdRef.current === recentlyCreatedTerminal.terminalId) {
      return;
    }
    if (!recentlyCreatedTerminal.parentTerminalId) {
      lastHandledCreatedTerminalIdRef.current = recentlyCreatedTerminal.terminalId;
      return;
    }
    if (!openTerminals.has(buildActiveSessionNodeId(recentlyCreatedTerminal.parentTerminalId))) {
      lastHandledCreatedTerminalIdRef.current = recentlyCreatedTerminal.terminalId;
      return;
    }

    const nodeId = buildActiveSessionNodeId(recentlyCreatedTerminal.terminalId);
    const node = resolveActiveSessionNode(recentlyCreatedTerminal.terminalId);
    if (!node) {
      return;
    }

    lastHandledCreatedTerminalIdRef.current = recentlyCreatedTerminal.terminalId;
    setSelectedNodeId(nodeId);
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { ...node });
      return next;
    });
  }, [isUiStateHydrated, openTerminals, recentlyCreatedTerminal, resolveActiveSessionNode]);

  usePanelFocusScroll({ selectedNodeId, openTerminals, openTentacles, panelRefs });

  // Separate tentacle and session nodes for render order
  const tentacleNodes = simulatedNodes.filter((n) => n.type === "tentacle" || n.type === "sentiph");
  const sessionNodes = simulatedNodes.filter((n) => {
    if (n.type === "tentacle" || n.type === "sentiph") return false;
    if (hideIdleTerminals && n.type === "inactive-session") return false;
    if (
      hideIdleTerminals &&
      n.type === "active-session" &&
      (n.agentState === "idle" || n.hasUserPrompt === false)
    )
      return false;
    return true;
  });

  const handleFitView = useCallback(() => {
    fitAll(simulatedNodes);
  }, [fitAll, simulatedNodes]);

  const handleRefresh = useCallback(() => {
    if (onRefreshColumns) {
      const result = onRefreshColumns();
      if (result && typeof result.then === "function") {
        void result.finally(() => {
          refreshGraphData();
        });
        return;
      }
    }
    refreshGraphData();
  }, [onRefreshColumns, refreshGraphData]);

  const waitingNodes = simulatedNodes.filter(
    (n) =>
      n.type === "active-session" &&
      (n.agentRuntimeState === "waiting_for_permission" ||
        n.agentRuntimeState === "waiting_for_user"),
  );

  const sessionEdges = edges
    .map((edge) => {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      if (!source || !target) {
        return null;
      }
      if (source.type !== "active-session" || target.type !== "active-session") {
        return null;
      }
      if (
        hideIdleTerminals &&
        (source.agentState === "idle" ||
          source.hasUserPrompt === false ||
          target.agentState === "idle" ||
          target.hasUserPrompt === false)
      ) {
        return null;
      }
      return { source, target };
    })
    .filter((edge): edge is { source: GraphNode; target: GraphNode } => edge !== null);

  const sessionEdgesBySource = new Map<string, { source: GraphNode; target: GraphNode }[]>();
  for (const edge of sessionEdges) {
    const group = sessionEdgesBySource.get(edge.source.id);
    if (group) {
      group.push(edge);
    } else {
      sessionEdgesBySource.set(edge.source.id, [edge]);
    }
  }

  for (const group of sessionEdgesBySource.values()) {
    group.sort((left, right) => {
      const leftAngle = Math.atan2(left.target.y - left.source.y, left.target.x - left.source.x);
      const rightAngle = Math.atan2(
        right.target.y - right.source.y,
        right.target.x - right.source.x,
      );
      return leftAngle - rightAngle;
    });
  }

  const hasPanels = isHydratingTerminals || openTerminals.size > 0 || openTentacles.size > 0;
  const terminalLayoutVersion = useMemo(() => {
    const openIds = Array.from(openTerminals.keys()).join("|");
    return `${openIds}::${terminalsPanelWidth ?? "auto"}`;
  }, [openTerminals, terminalsPanelWidth]);

  return (
    <section ref={containerRef} className="canvas-view" aria-label="Canvas graph view">
      <div className={`canvas-graph-panel${hasPanels ? " canvas-graph-panel--split" : ""}`}>
        <CanvasGraphLayer
          svgRef={svgRef}
          isPanning={isPanning}
          dragNodeId={dragNodeId}
          transform={transform}
          selectedNodeId={selectedNodeId}
          hideIdleTerminals={hideIdleTerminals}
          nodesById={nodesById}
          edges={edges}
          tentacleNodes={tentacleNodes}
          sessionNodes={sessionNodes}
          sessionEdgesBySource={sessionEdgesBySource}
          handleCanvasPointerDown={handleCanvasPointerDown}
          handleSvgPointerMove={handleSvgPointerMove}
          handleSvgPointerUp={handleSvgPointerUp}
          handleSvgClick={handleSvgClick}
          handleNodePointerDown={handleNodePointerDown}
          handleNodeClick={handleNodeClick}
          setContextMenu={setContextMenu}
          setSelectedNodeId={setSelectedNodeId}
        />

        <CanvasToolbar
          hideIdleTerminals={hideIdleTerminals}
          waitingNodes={waitingNodes}
          setPendingOpenAgentId={setPendingOpenAgentId}
          setHideIdleTerminals={setHideIdleTerminals}
          setIsDeleteAllDialogOpen={setIsDeleteAllDialogOpen}
          handleFitView={handleFitView}
          handleRefresh={handleRefresh}
          handleNodeClick={handleNodeClick}
          onCreateTerminal={onCreateTerminal}
        />
      </div>

      {hasPanels && (
        <CanvasTerminalsPanel
          terminalsPanelRef={terminalsPanelRef}
          terminalsPanelWidth={terminalsPanelWidth}
          isHydratingTerminals={isHydratingTerminals}
          openTentacles={openTentacles}
          openTerminals={openTerminals}
          selectedNodeId={selectedNodeId}
          columns={columns}
          terminalLayoutVersion={terminalLayoutVersion}
          sessionsByTentacleId={sessionsByTentacleId}
          setPanelRef={setPanelRef}
          setSelectedNodeId={setSelectedNodeId}
          handleCloseTentacle={handleCloseTentacle}
          handleCreateAgent={handleCreateAgent}
          handleMinimizeTerminal={handleMinimizeTerminal}
          handleCloseTerminal={handleCloseTerminal}
          handleDividerPointerDown={handleDividerPointerDown}
          handleDividerPointerMove={handleDividerPointerMove}
          handleDividerPointerUp={handleDividerPointerUp}
          onNavigateToConversation={onNavigateToConversation}
          onTerminalRenamed={onTerminalRenamed}
          onTerminalActivity={onTerminalActivity}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <CanvasContextMenu
          contextMenu={contextMenu}
          columns={columns}
          panelRefs={panelRefs}
          setContextMenu={setContextMenu}
          setPendingOpenAgentId={setPendingOpenAgentId}
          onCreateTerminal={onCreateTerminal}
          onDeleteActiveSession={onDeleteActiveSession}
          handleCreateAgent={handleCreateAgent}
          handleTentacleAction={handleTentacleAction}
          handleNodeClick={handleNodeClick}
        />
      )}

      <CanvasDialogs
        columns={columns}
        nodes={nodes}
        isDeleteAllDialogOpen={isDeleteAllDialogOpen}
        pendingDeleteTerminal={pendingDeleteTerminal}
        isDeletingTerminalId={isDeletingTerminalId}
        onCancelDelete={onCancelDelete}
        onConfirmDelete={onConfirmDelete}
        setIsDeleteAllDialogOpen={setIsDeleteAllDialogOpen}
        setOpenTerminals={setOpenTerminals}
        onRefreshColumns={onRefreshColumns}
        refreshGraphData={refreshGraphData}
      />
    </section>
  );
};
