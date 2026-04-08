import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasPrimaryView } from "../src/components/CanvasPrimaryView";

const nodes = [
  {
    id: "a:terminal-1",
    type: "active-session" as const,
    sessionId: "terminal-1",
    tentacleId: "tentacle-a",
    label: "terminal-1",
    color: "#ff6b2b",
    x: 120,
    y: 120,
    radius: 20,
    agentState: "live" as const,
    agentRuntimeState: "idle" as const,
    hasUserPrompt: true,
    workspaceMode: "shared" as const,
  },
];

vi.mock("../src/app/hooks/useAgentRuntimeStates", () => ({
  useAgentRuntimeStates: () => new Map(),
}));

vi.mock("../src/app/hooks/useCanvasGraphData", () => ({
  useCanvasGraphData: () => ({
    nodes,
    edges: [],
    refresh: vi.fn(),
  }),
}));

vi.mock("../src/app/hooks/useCanvasTransform", () => ({
  useCanvasTransform: () => ({
    transform: { translateX: 0, translateY: 0, scale: 1 },
    isPanning: false,
    svgRef: { current: null },
    handleWheel: vi.fn(),
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    screenToGraph: () => ({ x: 0, y: 0 }),
    fitAll: vi.fn(),
  }),
}));

vi.mock("../src/app/hooks/useForceSimulation", () => ({
  DEFAULT_FORCE_PARAMS: {},
  useForceSimulation: ({ nodes: nextNodes }: { nodes: typeof nodes }) => ({
    simulatedNodes: nextNodes,
    pinNode: vi.fn(),
    unpinNode: vi.fn(),
    moveNode: vi.fn(),
    reheat: vi.fn(),
  }),
}));

vi.mock("../src/components/canvas/SessionNode", () => ({
  SessionNode: ({
    node,
    onClick,
  }: {
    node: (typeof nodes)[number];
    onClick: (nodeId: string) => void;
  }) => (
    <button type="button" data-node-id={node.id} onClick={() => onClick(node.id)}>
      {node.label}
    </button>
  ),
}));

vi.mock("../src/components/canvas/OctopusNode", () => ({
  OctopusNode: () => null,
}));

vi.mock("../src/components/canvas/CanvasTerminalColumn", () => ({
  CanvasTerminalColumn: ({
    node,
    panelRef,
  }: {
    node: (typeof nodes)[number];
    panelRef?: ((element: HTMLElement | null) => void) | undefined;
  }) => (
    <section ref={panelRef} data-testid={`panel-${node.id}`} tabIndex={-1}>
      panel {node.id}
    </section>
  ),
}));

vi.mock("../src/components/canvas/CanvasTentaclePanel", () => ({
  CanvasTentaclePanel: () => null,
}));

describe("CanvasPrimaryView", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "focus", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reveals and focuses a newly opened terminal panel when a session node is clicked", async () => {
    render(<CanvasPrimaryView columns={[]} isUiStateHydrated />);

    fireEvent.click(screen.getByRole("button", { name: "terminal-1" }));

    await waitFor(() => {
      expect(screen.getByTestId("panel-a:terminal-1")).toBeInTheDocument();
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(HTMLElement.prototype.focus).toHaveBeenCalledTimes(1);
    });
  });
});
