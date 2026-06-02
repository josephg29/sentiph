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
import { CanvasOnboardingHint } from "./CanvasPrimaryView/CanvasOnboardingHint";
import { CanvasTerminalsPanel } from "./CanvasPrimaryView/CanvasTerminalsPanel";
import { CanvasToolbar } from "./CanvasPrimaryView/CanvasToolbar";
import { buildActiveSessionNodeId } from "./CanvasPrimaryView/helpers";
import type { ContextMenuState } from "./CanvasPrimaryView/types";
import { useCanvasContextMenu } from "./CanvasPrimaryView/useCanvasContextMenu";
import { useCanvasNodeHandlers } from "./CanvasPrimaryView/useCanvasNodeHandlers";
import { useOpenTerminals } from "./CanvasPrimaryView/useOpenTerminals";
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
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingOpenAgentId, setPendingOpenAgentId] = useState<string | null>(null);
  const [hideIdleTerminals, setHideIdleTerminals] = useState(false);

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

  const {
    openTerminals,
    setOpenTerminals,
    openTentacles,
    setOpenTentacles,
    terminalsPanelWidth,
    setTerminalsPanelWidth,
    isHydratingTerminals,
    openTerminalCount,
    openTentacleCount,
    resolveActiveSessionNode,
  } = useOpenTerminals({
    columns,
    isUiStateHydrated,
    canvasOpenTerminalIds,
    canvasOpenTentacleIds,
    canvasTerminalsPanelWidth: persistedTerminalsPanelWidth,
    nodesById,
    simulatedNodes,
    recentlyCreatedTerminal,
    onCanvasOpenTerminalIdsChange,
    onCanvasOpenTentacleIdsChange,
    onCanvasTerminalsPanelWidthChange,
  });

  const {
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
  } = useCanvasNodeHandlers({
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
  });

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

  // Native contextmenu listener — must be native to reliably preventDefault
  useCanvasContextMenu({
    svgRef,
    nodesById,
    onNavigateToConversation,
    setContextMenu,
  });

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
  }, [pendingOpenAgentId, resolveActiveSessionNode, setOpenTerminals]);

  // On first load, surface a live Sentiph parent terminal instead of a bare canvas.
  // Reuse an already-running parent session if there is one; otherwise spawn it.
  // Skips entirely when the user has persisted open terminals (they get restored).
  const hasAutoOpenedParentRef = useRef(false);
  useEffect(() => {
    if (hasAutoOpenedParentRef.current) return;
    if (!isUiStateHydrated) return;
    // Let the persisted-open-terminal hydration win when the user left panels open.
    if (canvasOpenTerminalIds && canvasOpenTerminalIds.length > 0) {
      hasAutoOpenedParentRef.current = true;
      return;
    }
    if (isHydratingTerminals) return;
    if (openTerminals.size > 0) {
      hasAutoOpenedParentRef.current = true;
      return;
    }

    hasAutoOpenedParentRef.current = true;

    const existingParent = columns.find(
      (terminal) => terminal.tentacleId === SENTIPH_ID && !terminal.parentTerminalId,
    );
    if (existingParent) {
      setPendingOpenAgentId(existingParent.terminalId);
      return;
    }

    const result = onCreateTerminal?.();
    if (result && typeof result.then === "function") {
      void result.then((terminalId) => {
        if (terminalId) setPendingOpenAgentId(terminalId);
      });
    }
  }, [
    isUiStateHydrated,
    isHydratingTerminals,
    openTerminals,
    canvasOpenTerminalIds,
    columns,
    onCreateTerminal,
  ]);

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

        {columns.length === 0 ? (
          <CanvasOnboardingHint
            onSpawn={() => {
              void onCreateTerminal?.();
            }}
          />
        ) : null}
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
