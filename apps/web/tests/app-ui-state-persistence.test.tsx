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

      if (url.endsWith("/api/agent-snapshots") && method === "GET") {
        return jsonResponse([
          {
            agentId: "agent-1",
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

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({
          isAgentsSidebarVisible: true,
          sidebarWidth: 380,
          isActiveAgentsSectionExpanded: true,
          isCodexUsageSectionExpanded: false,
          tentacleCompletionSound: "retro-beep",
          minimizedTentacleIds: ["tentacle-a"],
          tentacleWidths: {
            "tentacle-a": 450,
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

    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    await waitFor(() => {
      expect(sidebar).toHaveStyle({ width: "380px" });
    });
    expect(
      within(sidebar).getByRole("button", {
        name: "Expand Codex token usage section",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("All tentacles minimized")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Maximize tentacle tentacle-a" }));

    await waitFor(() => {
      expect(uiStatePatchBodies.some((body) => Array.isArray(body.minimizedTentacleIds))).toBe(
        true,
      );
    });
    expect(uiStatePatchBodies.at(-1)?.minimizedTentacleIds).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "[3] Settings" }));
    fireEvent.click(screen.getByRole("radio", { name: /Double beep/i }));

    await waitFor(() => {
      expect(
        uiStatePatchBodies.some((body) => body.tentacleCompletionSound === "double-beep"),
      ).toBe(true);
    });
  });
});
