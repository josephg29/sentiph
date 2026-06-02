import { useCallback, useEffect, useRef, useState } from "react";

import type { GraphNode } from "../../app/canvas/types";
import type { TerminalView } from "../../app/types";
import { ACTIVE_SESSION_RADIUS, buildActiveSessionNodeId, buildTentacleNodeId } from "./helpers";

type UseOpenTerminalsParams = {
  columns: TerminalView;
  isUiStateHydrated: boolean | undefined;
  canvasOpenTerminalIds: string[] | undefined;
  canvasOpenTentacleIds: string[] | undefined;
  canvasTerminalsPanelWidth: number | null | undefined;
  nodesById: Map<string, GraphNode>;
  simulatedNodes: GraphNode[];
  recentlyCreatedTerminal: TerminalView[number] | null | undefined;
  onCanvasOpenTerminalIdsChange: ((ids: string[]) => void) | undefined;
  onCanvasOpenTentacleIdsChange: ((ids: string[]) => void) | undefined;
  onCanvasTerminalsPanelWidthChange: ((width: number | null) => void) | undefined;
};

type UseOpenTerminalsResult = {
  openTerminals: Map<string, GraphNode>;
  setOpenTerminals: React.Dispatch<React.SetStateAction<Map<string, GraphNode>>>;
  openTentacles: Map<string, GraphNode>;
  setOpenTentacles: React.Dispatch<React.SetStateAction<Map<string, GraphNode>>>;
  terminalsPanelWidth: number | null;
  setTerminalsPanelWidth: React.Dispatch<React.SetStateAction<number | null>>;
  isHydratingTerminals: boolean;
  openTerminalCount: number;
  openTentacleCount: number;
  resolveActiveSessionNode: (terminalId: string) => GraphNode | null;
};

export const useOpenTerminals = ({
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
}: UseOpenTerminalsParams): UseOpenTerminalsResult => {
  const [openTerminals, setOpenTerminals] = useState<Map<string, GraphNode>>(new Map());
  const [openTentacles, setOpenTentacles] = useState<Map<string, GraphNode>>(new Map());
  const [terminalsPanelWidth, setTerminalsPanelWidth] = useState<number | null>(null);
  const [isHydratingTerminals, setIsHydratingTerminals] = useState(false);

  const hasHydratedTerminals = useRef(false);
  const hasHydratedTentacles = useRef(false);
  const lastHandledCreatedTerminalIdRef = useRef<string | null>(null);

  const openTerminalCount = openTerminals.size;
  const openTentacleCount = openTentacles.size;

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

  // Sync open terminal nodes with column data changes (label, state, etc.)
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

  // Auto-open terminal for newly created child session when its parent is open
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
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { ...node });
      return next;
    });
  }, [isUiStateHydrated, openTerminals, recentlyCreatedTerminal, resolveActiveSessionNode]);

  return {
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
  };
};
