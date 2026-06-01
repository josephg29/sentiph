import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentPod } from "../src/components/deck/AgentPod";

describe("AgentPod skill editor", () => {
  it("saves suggested skills from the deck pod", async () => {
    const onSaveSuggestedSkills = vi.fn().mockResolvedValue(true);

    render(
      <AgentPod
        agent={{
          tentacleId: "docs",
          displayName: "Docs",
          description: "Docs and knowledge.",
          status: "idle",
          color: "#ff6b2b",
          scope: { paths: [], tags: [] },
          vaultFiles: [],
          suggestedSkills: ["docs-writer"],
        }}
        visuals={{
          color: "#ff6b2b",
        }}
        isFocused={false}
        availableSkills={[
          {
            name: "docs-writer",
            description: "Keeps docs aligned with the product.",
            source: "project",
          },
          {
            name: "release-helper",
            description: "Helps with release coordination.",
            source: "user",
          },
        ]}
        onSaveSuggestedSkills={onSaveSuggestedSkills}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    fireEvent.click(screen.getByLabelText(/release-helper/i));
    fireEvent.click(screen.getByRole("button", { name: /save skills/i }));

    await waitFor(() => {
      expect(onSaveSuggestedSkills).toHaveBeenCalledWith("docs", ["docs-writer", "release-helper"]);
    });
  });
});
