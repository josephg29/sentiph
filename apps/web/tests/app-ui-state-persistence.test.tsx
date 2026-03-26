import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { jsonResponse, notFoundResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("App UI state persistence", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("hydrates ui state from the API and persists ui changes back to the API", async () => {
    const uiStatePatchBodies: Array<Record<string, unknown>> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse([
          {
            terminalId: "terminal-1",
            label: "core-planner",
            state: "live",
            tentacleId: "tentacle-a",
            tentacleName: "tentacle-a",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]);
      }

      if (url.endsWith("/api/codex/usage") && method === "GET") {
        return jsonResponse({
          status: "unavailable",
          fetchedAt: "2026-02-24T10:00:00.000Z",
          source: "none",
        });
      }

      if (url.endsWith("/api/claude/usage") && method === "GET") {
        return jsonResponse({
          status: "unavailable",
          fetchedAt: "2026-02-24T10:00:00.000Z",
          source: "none",
        });
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({
          isAgentsSidebarVisible: true,
          sidebarWidth: 380,
          isActiveAgentsSectionExpanded: true,
          isRuntimeStatusStripVisible: false,
          isMonitorVisible: false,
          isBottomTelemetryVisible: false,
          isCodexUsageVisible: true,
          isClaudeUsageVisible: true,
          isCodexUsageSectionExpanded: false,
          isClaudeUsageSectionExpanded: false,
          terminalCompletionSound: "retro-beep",
          minimizedTerminalIds: ["terminal-1"],
          terminalWidths: {
            "terminal-1": 450,
          },
        });
      }

      if (url.endsWith("/api/ui-state") && method === "PATCH") {
        const body = init?.body;
        if (typeof body === "string") {
          uiStatePatchBodies.push(JSON.parse(body) as Record<string, unknown>);
        }

        return new Response(body ?? "{}", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      return notFoundResponse();
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "[9] Board" }));
    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    await waitFor(() => {
      expect(sidebar).toHaveStyle({ width: "380px" });
    });
    expect(
      within(sidebar).getByRole("button", {
        name: "Expand Codex token usage section",
      }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", {
        name: "Expand Claude token usage section",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("All terminals minimized")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Maximize terminal terminal-1" }));

    await waitFor(() => {
      expect(uiStatePatchBodies.some((body) => Array.isArray(body.minimizedTerminalIds))).toBe(
        true,
      );
    });
    expect(uiStatePatchBodies.at(-1)?.minimizedTerminalIds).toEqual([]);
    expect(uiStatePatchBodies.at(-1)?.isClaudeUsageSectionExpanded).toBe(false);
    expect(uiStatePatchBodies.at(-1)?.isRuntimeStatusStripVisible).toBe(false);
    expect(uiStatePatchBodies.at(-1)?.isMonitorVisible).toBe(false);
    expect(uiStatePatchBodies.at(-1)?.isBottomTelemetryVisible).toBe(false);
    expect(uiStatePatchBodies.at(-1)?.isCodexUsageVisible).toBe(true);
    expect(uiStatePatchBodies.at(-1)?.isClaudeUsageVisible).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "[6] Settings" }));
    fireEvent.click(screen.getByRole("radio", { name: /Double beep/i }));

    await waitFor(() => {
      expect(
        uiStatePatchBodies.some((body) => body.terminalCompletionSound === "double-beep"),
      ).toBe(true);
    });
  });
});
