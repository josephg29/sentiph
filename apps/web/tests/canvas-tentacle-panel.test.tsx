import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasTentaclePanel } from "../src/components/canvas/CanvasTentaclePanel";

const tentacle = {
  tentacleId: "docs-knowledge",
  displayName: "Docs & Knowledge",
  description: "Keep docs aligned with the product.",
  status: "active" as const,
  color: "#ff6b2b",
  octopus: {
    animation: null,
    expression: null,
    accessory: null,
    hairColor: null,
  },
  scope: { paths: [], tags: [] },
  vaultFiles: ["todo.md"],
  todoTotal: 2,
  todoDone: 0,
  todoItems: [
    { text: "Audit docs", done: false },
    { text: "Consolidate principles", done: false },
  ],
  suggestedSkills: ["docs-writer", "release-helper"],
};

describe("CanvasTentaclePanel actions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers worktree and normal swarm options", async () => {
    const onSpawnSwarm = vi.fn();

    render(
      <CanvasTentaclePanel
        node={{
          id: "docs-knowledge",
          type: "tentacle",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          pinned: false,
          radius: 48,
          tentacleId: "docs-knowledge",
          label: "Docs & Knowledge",
          color: "#ff6b2b",
        }}
        tentacle={tentacle}
        sessions={[]}
        onClose={() => {}}
        onSpawnSwarm={onSpawnSwarm}
      />,
    );

    const worktreeButton = await screen.findByRole("button", {
      name: /spawn swarm \(worktrees\)/i,
    });
    const normalButton = await screen.findByRole("button", {
      name: /spawn swarm \(normal\)/i,
    });

    fireEvent.click(worktreeButton);
    fireEvent.click(normalButton);

    expect(onSpawnSwarm).toHaveBeenNthCalledWith(1, "docs-knowledge", "worktree");
    expect(onSpawnSwarm).toHaveBeenNthCalledWith(2, "docs-knowledge", "shared");
  });

  it("shows suggested skills in the tentacle detail panel", async () => {
    render(
      <CanvasTentaclePanel
        node={{
          id: "docs-knowledge",
          type: "tentacle",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          pinned: false,
          radius: 48,
          tentacleId: "docs-knowledge",
          label: "Docs & Knowledge",
          color: "#ff6b2b",
        }}
        tentacle={tentacle}
        sessions={[]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Suggested Skills")).toBeInTheDocument();
    expect(screen.getByText("docs-writer")).toBeInTheDocument();
    expect(screen.getByText("release-helper")).toBeInTheDocument();
  });
});
