import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { MockWebSocket, jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("App tentacle layout interactions", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("minimizes tentacles from the header and maximizes them from the sidebar", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          agentId: "tentacle-a-root",
          label: "tentacle-a-root",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
        {
          agentId: "tentacle-b-root",
          label: "tentacle-b-root",
          state: "live",
          tentacleId: "tentacle-b",
          tentacleName: "tentacle-b",
          createdAt: "2026-02-24T10:05:00.000Z",
        },
      ]),
    );

    render(<App />);

    await screen.findByLabelText("tentacle-a");
    await screen.findByLabelText("tentacle-b");
    await screen.findByLabelText("Active Agents sidebar");

    fireEvent.click(screen.getByRole("button", { name: "Minimize tentacle tentacle-b" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("tentacle-b")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Maximize tentacle tentacle-b" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Active agents in tentacle-b")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Maximize tentacle tentacle-b" }));

    expect(await screen.findByLabelText("tentacle-b")).toBeInTheDocument();
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
      jsonResponse([
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

  it("applies a focused visual state to the selected tentacle column", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
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
    );

    render(<App />);

    const firstPane = await screen.findByLabelText("tentacle-1");
    const secondPane = await screen.findByLabelText("tentacle-2");

    expect(firstPane).toHaveClass("tentacle-column--selected");
    expect(secondPane).not.toHaveClass("tentacle-column--selected");
    expect(within(firstPane).getByText("Focused")).toBeInTheDocument();

    fireEvent.pointerDown(secondPane);

    await waitFor(() => {
      expect(secondPane).toHaveClass("tentacle-column--selected");
      expect(firstPane).not.toHaveClass("tentacle-column--selected");
      expect(within(secondPane).getByText("Focused")).toBeInTheDocument();
      expect(within(firstPane).queryByText("Focused")).toBeNull();
    });
  });
});
