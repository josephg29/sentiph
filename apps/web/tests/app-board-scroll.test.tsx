import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import {
  MockWebSocket,
  jsonResponse,
  notFoundResponse,
  resetAppTestHarness,
} from "./test-utils/appTestHarness";

describe("App board scroll behavior", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("scrolls the board horizontally from tentacle headers without hijacking terminal wheel events", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/agent-snapshots")) {
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

      if (url.endsWith("/api/codex/usage")) {
        return jsonResponse({
          status: "unavailable",
          fetchedAt: "2026-02-24T10:00:00.000Z",
          source: "none",
        });
      }

      return notFoundResponse();
    });

    render(<App />);

    const board = await screen.findByLabelText("Tentacle board");
    const headerNameButton = await screen.findByRole("button", { name: "tentacle-a" });
    const terminal = await screen.findByTestId("terminal-agent-1");

    expect(board.scrollLeft).toBe(0);

    fireEvent.wheel(headerNameButton, { deltaY: 120 });
    expect(board.scrollLeft).toBe(120);

    fireEvent.wheel(terminal, { deltaY: 120 });
    expect(board.scrollLeft).toBe(120);
  });
});
