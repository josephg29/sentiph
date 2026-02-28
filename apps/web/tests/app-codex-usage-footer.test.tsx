import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { jsonResponse, notFoundResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

const mockCodexUsageRequests = () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/agent-snapshots") && method === "GET") {
      return jsonResponse([]);
    }

    if (url.endsWith("/api/codex/usage") && method === "GET") {
      return jsonResponse({
        status: "ok",
        source: "oauth-api",
        fetchedAt: "2026-02-25T12:00:00.000Z",
        primaryUsedPercent: 12,
        secondaryUsedPercent: 34,
        creditsBalance: 15.5,
      });
    }

    return notFoundResponse();
  });
};

describe("App codex usage footer", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("shows codex usage in the active agents sidebar footer", async () => {
    mockCodexUsageRequests();

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    expect(within(sidebar).getByText("Codex token usage")).toBeInTheDocument();
    expect(within(sidebar).getByText("5H tokens")).toBeInTheDocument();
    expect(within(sidebar).getByText("Week tokens")).toBeInTheDocument();
    expect(within(sidebar).getByRole("progressbar", { name: "5H token usage" })).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
    expect(
      within(sidebar).getByRole("progressbar", { name: "Weekly token usage" }),
    ).toHaveAttribute("aria-valuenow", "34");
    expect(within(sidebar).getByText("12%")).toBeInTheDocument();
    expect(within(sidebar).getByText("34%")).toBeInTheDocument();
    expect(within(sidebar).getByText("Credits $15.50")).toBeInTheDocument();
  });

  it("collapses and expands the codex usage section in the sidebar footer", async () => {
    mockCodexUsageRequests();

    render(<App />);

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    expect(
      within(sidebar).getByRole("progressbar", { name: "5H token usage" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(sidebar).getByRole("button", {
        name: "Collapse Codex token usage section",
      }),
    );

    expect(within(sidebar).queryByRole("progressbar", { name: "5H token usage" })).toBeNull();
    expect(
      within(sidebar).getByRole("button", {
        name: "Expand Codex token usage section",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(sidebar).getByRole("button", {
        name: "Expand Codex token usage section",
      }),
    );

    expect(
      within(sidebar).getByRole("progressbar", { name: "5H token usage" }),
    ).toBeInTheDocument();
  });
});
