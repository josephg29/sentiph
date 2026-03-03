import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { MockWebSocket, jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("App tentacle presence and runtime state", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("renders tentacle columns when API returns agent snapshots", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          agentId: "agent-1",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleWorkspaceMode: "worktree",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]),
    );

    render(<App />);

    const tentacleColumn = await screen.findByLabelText("tentacle-a");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    expect(tentacleColumn).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename tentacle tentacle-a" })).toBeInTheDocument();
    expect(within(tentacleColumn).getByText("WORKTREE")).toBeInTheDocument();
    expect(within(tentacleColumn).queryByText("core-planner")).toBeNull();
    expect(within(sidebar).getByText("core-planner")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-tentacle-a")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });
    expect(MockWebSocket.instances[0]?.url).toContain("/api/terminals/tentacle-a/ws");
  });

  it("keeps sidebar root badge synced with the terminal idle/processing state", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          agentId: "agent-1",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]),
    );

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    const tentacleGroup = within(sidebar).getByLabelText("Active agents in tentacle-a");

    await waitFor(() => {
      const idleBadge = within(tentacleGroup).getByText("IDLE");
      expect(idleBadge).toHaveClass("pill", "terminal-state-badge", "idle");
    });

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });
    const socket = MockWebSocket.instances[0];
    socket?.emit("message", JSON.stringify({ type: "state", state: "processing" }));

    await waitFor(() => {
      const processingBadge = within(tentacleGroup).getByText("PROCESSING");
      expect(processingBadge).toHaveClass("pill", "terminal-state-badge", "processing");
    });
  });

  it("plays a completion notification only when tentacle state moves from processing to idle", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const play = vi.fn().mockResolvedValue(undefined);
    const MockAudio = vi.fn(() => ({
      currentTime: 0,
      play,
      preload: "auto",
    }));
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          agentId: "agent-1",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]),
    );

    render(<App />);
    await screen.findByLabelText("tentacle-a");
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    const socket = MockWebSocket.instances[0];
    socket?.emit("message", JSON.stringify({ type: "state", state: "idle" }));
    socket?.emit("message", JSON.stringify({ type: "state", state: "processing" }));

    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(0);
    });

    socket?.emit("message", JSON.stringify({ type: "state", state: "idle" }));
    await waitFor(() => {
      expect(MockAudio).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(1);
    });

    socket?.emit("message", JSON.stringify({ type: "state", state: "idle" }));
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("closes terminal websocket when app unmounts", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          agentId: "agent-1",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]),
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
});
