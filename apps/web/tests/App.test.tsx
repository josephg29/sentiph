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

  it("creates a new tentacle and refreshes columns plus sidebar listings", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/agent-snapshots") && method === "GET") {
        const afterCreate = fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/tentacles") &&
            (calledInit?.method ?? "GET") === "POST",
        );

        return new Response(
          JSON.stringify(
            afterCreate
              ? [
                  {
                    agentId: "tentacle-1-root",
                    label: "tentacle-1-root",
                    state: "live",
                    tentacleId: "tentacle-1",
                    createdAt: "2026-02-24T10:00:00.000Z",
                  },
                  {
                    agentId: "tentacle-2-root",
                    label: "tentacle-2-root",
                    state: "live",
                    tentacleId: "tentacle-2",
                    createdAt: "2026-02-24T10:05:00.000Z",
                  },
                ]
              : [
                  {
                    agentId: "tentacle-1-root",
                    label: "tentacle-1-root",
                    state: "live",
                    tentacleId: "tentacle-1",
                    createdAt: "2026-02-24T10:00:00.000Z",
                  },
                ],
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      if (url.endsWith("/api/tentacles") && method === "POST") {
        return new Response(
          JSON.stringify({
            agentId: "tentacle-2-root",
            label: "tentacle-2-root",
            state: "live",
            tentacleId: "tentacle-2",
            createdAt: "2026-02-24T10:05:00.000Z",
          }),
          {
            status: 201,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response("not-found", { status: 404 });
    });

    render(<App />);

    await screen.findByLabelText("tentacle-1");
    fireEvent.click(screen.getByRole("button", { name: "New tentacle" }));

    const tentacleTwoColumn = await screen.findByLabelText("tentacle-2");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");

    expect(tentacleTwoColumn).toBeInTheDocument();
    expect(within(sidebar).getByLabelText("Active agents in tentacle-1")).toBeInTheDocument();
    expect(within(sidebar).getByLabelText("Active agents in tentacle-2")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockWebSocket.instances.some((socket) => socket.url.includes("/tentacle-2/ws"))).toBe(
        true,
      );
    });
  });

  it("resizes adjacent tentacle panes from the divider", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 0,
      height: 0,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            agentId: "tentacle-1-root",
            label: "tentacle-1-root",
            state: "live",
            tentacleId: "tentacle-1",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
          {
            agentId: "tentacle-2-root",
            label: "tentacle-2-root",
            state: "live",
            tentacleId: "tentacle-2",
            createdAt: "2026-02-24T10:05:00.000Z",
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

    const leftPane = await screen.findByLabelText("tentacle-1");
    const rightPane = await screen.findByLabelText("tentacle-2");
    const divider = screen.getByRole("separator", {
      name: "Resize between tentacle-1 and tentacle-2",
    });

    expect(leftPane).toHaveStyle({ width: "497px" });
    expect(rightPane).toHaveStyle({ width: "497px" });

    fireEvent.keyDown(divider, { key: "ArrowRight" });

    await waitFor(() => {
      expect(leftPane).toHaveStyle({ width: "521px" });
      expect(rightPane).toHaveStyle({ width: "473px" });
    });
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

  it("resizes the active agents sidebar from its border without a separate separator strip", async () => {
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
    const resizer = await screen.findByTestId("active-agents-border-resizer");

    expect(sidebar).toHaveStyle({ width: "320px" });
    expect(screen.queryByRole("separator", { name: "Resize Active Agents sidebar" })).toBeNull();

    fireEvent.mouseDown(resizer, { clientX: 320 });
    fireEvent.mouseMove(window, { clientX: 380 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(sidebar).toHaveStyle({ width: "380px" });
    });
  });
});
