import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("App active agents sidebar", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("renders terminals individually in the sidebar", async () => {
    const longWorkerLabel = "worker-1-with-a-very-long-label-that-should-truncate-in-the-sidebar";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse([
        {
          terminalId: "terminal-1",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
        {
          terminalId: "terminal-2",
          label: longWorkerLabel,
          state: "idle",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:05:00.000Z",
        },
        {
          terminalId: "terminal-3",
          label: "reviewer",
          state: "idle",
          tentacleId: "tentacle-b",
          tentacleName: "tentacle-b",
          createdAt: "2026-02-24T11:00:00.000Z",
        },
      ]),
    );

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    const terminal1Group = within(sidebar).getByLabelText("Terminal terminal-1");
    const terminal3Group = within(sidebar).getByLabelText("Terminal terminal-3");

    expect(within(sidebar).getByText("3 terminals")).toBeInTheDocument();
    expect(within(terminal1Group).getByText("core-planner")).toBeInTheDocument();
    expect(within(sidebar).getByText(longWorkerLabel)).toBeInTheDocument();
    expect(within(terminal3Group).getByText("reviewer")).toBeInTheDocument();

    const longLabel = within(sidebar).getByText(longWorkerLabel);
    expect(longLabel).toHaveAttribute("title", longWorkerLabel);
    const agentRow = longLabel.closest("li");
    expect(agentRow).toHaveClass("active-agents-agent-row");
  });

  it("collapses and expands the active agents sidebar section", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse([
        {
          terminalId: "terminal-1",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]),
    );

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    const terminalGroupLabel = "Terminal terminal-1";
    expect(within(sidebar).getByLabelText(terminalGroupLabel)).toBeInTheDocument();

    const collapseButton = within(sidebar).getByRole("button", {
      name: "Collapse Active Agents section",
    });
    fireEvent.click(collapseButton);

    expect(within(sidebar).queryByLabelText(terminalGroupLabel)).toBeNull();
    expect(
      within(sidebar).getByRole("button", {
        name: "Expand Active Agents section",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(sidebar).getByRole("button", {
        name: "Expand Active Agents section",
      }),
    );

    expect(within(sidebar).getByLabelText(terminalGroupLabel)).toBeInTheDocument();
  });

  it("toggles the active agents sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);

    await screen.findByLabelText("Active Agents sidebar");
    const hideButton = screen.getByRole("button", {
      name: "Hide Active Agents sidebar",
    });

    fireEvent.click(hideButton);

    expect(screen.queryByLabelText("Active Agents sidebar")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize Active Agents sidebar" })).toBeNull();
    const canvas = screen.getByLabelText("Main content canvas");
    expect(canvas.querySelector(".workspace-shell")).toHaveClass("workspace-shell--full");
    expect(screen.getByRole("button", { name: "Show Active Agents sidebar" })).toBeInTheDocument();
  });

  it("resizes the active agents sidebar from its border without a separate separator strip", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    const resizer = await screen.findByTestId("active-agents-border-resizer");

    expect(sidebar).toHaveStyle({ width: "240px" });
    expect(screen.queryByRole("separator", { name: "Resize Active Agents sidebar" })).toBeNull();

    fireEvent.mouseDown(resizer, { clientX: 320 });
    fireEvent.mouseMove(window, { clientX: 380 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(sidebar).toHaveStyle({ width: "380px" });
    });
  });
});
