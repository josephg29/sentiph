import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(await screen.findByText("tentacle-a")).toBeInTheDocument();
    expect(screen.getByText("core-planner")).toBeInTheDocument();
  });
});
