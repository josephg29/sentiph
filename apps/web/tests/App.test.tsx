import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readonly url: string;
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it("renders empty view when API returns no active agents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    render(<App />);

    expect(await screen.findByText("No active tentacles")).toBeInTheDocument();
    expect(screen.getByText("When agents start, tentacles will appear here.")).toBeInTheDocument();
    expect(screen.getByTestId("empty-octopus")).toBeInTheDocument();
  });

  it("renders tentacle columns when API returns agent snapshots", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            agentId: "agent-1",
            label: "core-planner",
            state: "live",
            tentacleId: "tentacle-a",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<App />);

    const tentacleColumn = await screen.findByLabelText("tentacle-a");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    expect(tentacleColumn).toBeInTheDocument();
    expect(within(tentacleColumn).queryByText("core-planner")).toBeNull();
    expect(within(sidebar).getByText("core-planner")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-tentacle-a")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });
    expect(MockWebSocket.instances[0]?.url).toContain("/api/terminals/tentacle-a/ws");
  });

  it("closes terminal websocket when app unmounts", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            agentId: "agent-1",
            label: "core-planner",
            state: "live",
            tentacleId: "tentacle-a",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const { unmount } = render(<App />);
    await screen.findByLabelText("tentacle-a");
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    unmount();
    expect(socket?.close).toHaveBeenCalledTimes(1);
  });

  it("renders active agents grouped by tentacle in the sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            agentId: "agent-1",
            label: "core-planner",
            state: "live",
            tentacleId: "tentacle-a",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
          {
            agentId: "agent-2",
            label: "worker-1",
            state: "queued",
            tentacleId: "tentacle-a",
            parentAgentId: "agent-1",
            createdAt: "2026-02-24T10:05:00.000Z",
          },
          {
            agentId: "agent-3",
            label: "reviewer",
            state: "idle",
            tentacleId: "tentacle-b",
            createdAt: "2026-02-24T11:00:00.000Z",
          },
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    const tentacleAGroup = within(sidebar).getByLabelText("Active agents in tentacle-a");
    const tentacleBGroup = within(sidebar).getByLabelText("Active agents in tentacle-b");

    expect(within(tentacleAGroup).getByText("core-planner")).toBeInTheDocument();
    expect(within(tentacleAGroup).getByText("worker-1")).toBeInTheDocument();
    expect(within(tentacleBGroup).getByText("reviewer")).toBeInTheDocument();
  });

  it("toggles the active agents sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    render(<App />);

    await screen.findByLabelText("Active Agents sidebar");
    const hideButton = screen.getByRole("button", {
      name: "Hide Active Agents sidebar",
    });

    fireEvent.click(hideButton);

    expect(screen.queryByLabelText("Active Agents sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize Active Agents sidebar" })).toBeNull();
    expect(screen.getByLabelText("Tentacle board").closest(".workspace-shell")).toHaveClass(
      "workspace-shell--full",
    );
    expect(screen.getByRole("button", { name: "Show Active Agents sidebar" })).toBeInTheDocument();
  });

  it("resizes the active agents sidebar with keyboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    const separator = screen.getByRole("separator", {
      name: "Resize Active Agents sidebar",
    });
    const initialWidth = Number.parseInt(sidebar.style.width, 10);

    fireEvent.keyDown(separator, { key: "ArrowRight" });

    await waitFor(() => {
      expect(Number.parseInt(sidebar.style.width, 10)).toBeGreaterThan(initialWidth);
    });
  });
});
