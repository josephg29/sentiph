import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { GraphEdge, GraphNode } from "../canvas/types";

// Obsidian-style force parameters
const REPEL_STRENGTH = -30;
const LINK_DISTANCE = 40;
const LINK_STRENGTH = 0.6;
const CENTER_STRENGTH = 0.4;
const COLLISION_PADDING = 4;
const VELOCITY_DECAY = 0.4; // fraction of velocity removed per tick (d3 default)
const ALPHA_DECAY = 0.0228;
const ALPHA_MIN = 0.001;
const ALPHA_TARGET = 0;
const REHEAT_ALPHA = 0.8;

type SimNode = SimulationNodeDatum & { _gn: GraphNode };
type SimLink = SimulationLinkDatum<SimNode>;

type UseForceSimulationOptions = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerX: number;
  centerY: number;
};

type UseForceSimulationResult = {
  simulatedNodes: GraphNode[];
  pinNode: (id: string) => void;
  unpinNode: (id: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  reheat: () => void;
};

export const useForceSimulation = ({
  nodes,
  edges,
  centerX,
  centerY,
}: UseForceSimulationOptions): UseForceSimulationResult => {
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const [snapshot, setSnapshot] = useState<GraphNode[]>(nodes);

  // Keep latest inputs in refs so the effect can read them without depending on them
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Stable topology keys — effect only fires when graph structure actually changes
  const nodeIdKey = useMemo(() => nodes.map((n) => n.id).join("\0"), [nodes]);
  const edgeKey = useMemo(
    () => edges.map((e) => `${e.source}\0${e.target}`).join("\0"),
    [edges],
  );

  useEffect(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    if (currentNodes.length === 0) {
      simRef.current?.stop();
      simRef.current = null;
      simNodeMapRef.current.clear();
      setSnapshot([]);
      return;
    }

    const prevMap = simNodeMapRef.current;

    // Reconcile: preserve positions for existing nodes, initialize new ones
    const simNodes: SimNode[] = currentNodes.map((gn) => {
      const prev = prevMap.get(gn.id);
      if (prev) {
        prev._gn = gn;
        return prev;
      }
      return {
        _gn: gn,
        x: gn.x,
        y: gn.y,
        vx: gn.vx,
        vy: gn.vy,
        fx: gn.pinned ? gn.x : undefined,
        fy: gn.pinned ? gn.y : undefined,
      };
    });

    const nextMap = new Map<string, SimNode>();
    for (const sn of simNodes) {
      nextMap.set(sn._gn.id, sn);
    }
    simNodeMapRef.current = nextMap;

    // Build link data with node references
    const simLinks: SimLink[] = currentEdges
      .map((e) => {
        const source = nextMap.get(e.source);
        const target = nextMap.get(e.target);
        if (!source || !target) return null;
        return { source, target } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    const applyForces = (sim: Simulation<SimNode, SimLink>) => {
      sim
        .force(
          "link",
          forceLink<SimNode, SimLink>(simLinks)
            .distance(LINK_DISTANCE)
            .strength(LINK_STRENGTH),
        )
        .force("charge", forceManyBody<SimNode>().strength(REPEL_STRENGTH))
        .force(
          "center",
          forceCenter<SimNode>(centerX, centerY).strength(CENTER_STRENGTH),
        )
        .force(
          "collide",
          forceCollide<SimNode>((d) => d._gn.radius + COLLISION_PADDING),
        );
    };

    if (simRef.current) {
      // Update existing simulation with new topology
      simRef.current.nodes(simNodes);
      applyForces(simRef.current);
      simRef.current.alpha(REHEAT_ALPHA).restart();
    } else {
      // Create new simulation
      const sim = forceSimulation<SimNode>(simNodes)
        .velocityDecay(VELOCITY_DECAY)
        .alphaDecay(ALPHA_DECAY)
        .alphaMin(ALPHA_MIN)
        .alphaTarget(ALPHA_TARGET);

      applyForces(sim);

      sim.on("tick", () => {
        const updated: GraphNode[] = sim.nodes().map((sn) => ({
          ...sn._gn,
          x: sn.x ?? sn._gn.x,
          y: sn.y ?? sn._gn.y,
          vx: sn.vx ?? 0,
          vy: sn.vy ?? 0,
        }));
        setSnapshot(updated);
      });

      simRef.current = sim;
    }
  }, [nodeIdKey, edgeKey, centerX, centerY]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      simRef.current?.stop();
      simRef.current = null;
    };
  }, []);

  const pinNode = useCallback((id: string) => {
    const sn = simNodeMapRef.current.get(id);
    if (sn) {
      sn.fx = sn.x;
      sn.fy = sn.y;
      sn._gn = { ...sn._gn, pinned: true };
    }
  }, []);

  const unpinNode = useCallback((id: string) => {
    const sn = simNodeMapRef.current.get(id);
    if (sn) {
      sn.fx = undefined;
      sn.fy = undefined;
      sn._gn = { ...sn._gn, pinned: false };
    }
  }, []);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    const sn = simNodeMapRef.current.get(id);
    if (sn) {
      sn.fx = x;
      sn.fy = y;
      sn.x = x;
      sn.y = y;
      sn.vx = 0;
      sn.vy = 0;
    }
  }, []);

  const reheat = useCallback(() => {
    simRef.current?.alpha(REHEAT_ALPHA).restart();
  }, []);

  return { simulatedNodes: snapshot, pinNode, unpinNode, moveNode, reheat };
};
