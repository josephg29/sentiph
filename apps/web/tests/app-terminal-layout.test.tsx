import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { MockWebSocket, jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("App terminal layout interactions", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("minimizes terminals from the header and maximizes them from the sidebar", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse([
        {
          terminalId: "terminal-a",
          label: "terminal-a",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
        {
          terminalId: "terminal-b",
          label: "terminal-b",
          state: "live",
          tentacleId: "tentacle-b",
          tentacleName: "tentacle-b",
          createdAt: "2026-02-24T10:05:00.000Z",
        },
      ]),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "[9] Board" }));
    await screen.findByLabelText("terminal-a");
    await screen.findByLabelText("terminal-b");
    await screen.findByLabelText("Active Agents sidebar");

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal terminal-b" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("terminal-b")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Maximize terminal terminal-b" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Terminal terminal-b")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Maximize terminal terminal-b" }));

    expect(await screen.findByLabelText("terminal-b")).toBeInTheDocument();
  });

  it("resizes adjacent terminal panes from the divider", async () => {
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

    const terminals = [
      {
        terminalId: "terminal-1",
        label: "terminal-1",
        state: "live",
        tentacleId: "tentacle-1",
        createdAt: "2026-02-24T10:00:00.000Z",
      },
      {
        terminalId: "terminal-2",
        label: "terminal-2",
        state: "live",
        tentacleId: "tentacle-2",
        createdAt: "2026-02-24T10:05:00.000Z",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/ui-state")) {
        return jsonResponse({ activePrimaryNav: 9 });
      }
      return jsonResponse(terminals);
    });

    render(<App />);

    const leftPane = await screen.findByLabelText("terminal-1");
    const rightPane = await screen.findByLabelText("terminal-2");
    const divider = screen.getByRole("separator", {
      name: "Resize between terminal-1 and terminal-2",
    });

    expect(leftPane).toHaveStyle({ width: "497px" });
    expect(rightPane).toHaveStyle({ width: "497px" });

    fireEvent.keyDown(divider, { key: "ArrowRight" });

    await waitFor(() => {
      expect(leftPane).toHaveStyle({ width: "521px" });
      expect(rightPane).toHaveStyle({ width: "473px" });
    });
  });

  it("applies a focused visual state to the selected terminal column", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse([
        {
          terminalId: "terminal-1",
          label: "terminal-1",
          state: "live",
          tentacleId: "tentacle-1",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
        {
          terminalId: "terminal-2",
          label: "terminal-2",
          state: "live",
          tentacleId: "tentacle-2",
          createdAt: "2026-02-24T10:05:00.000Z",
        },
      ]),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "[9] Board" }));
    const firstPane = await screen.findByLabelText("terminal-1");
    const secondPane = await screen.findByLabelText("terminal-2");

    await waitFor(() => {
      expect(firstPane).toHaveClass("terminal-column--selected");
      expect(secondPane).not.toHaveClass("terminal-column--selected");
      expect(firstPane).toHaveAttribute("data-selected", "true");
      expect(secondPane).toHaveAttribute("data-selected", "false");
    });

    fireEvent.pointerDown(secondPane);

    await waitFor(() => {
      expect(secondPane).toHaveClass("terminal-column--selected");
      expect(firstPane).not.toHaveClass("terminal-column--selected");
      expect(secondPane).toHaveAttribute("data-selected", "true");
      expect(firstPane).toHaveAttribute("data-selected", "false");
    });
  });
});
