import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddAgentForm } from "../src/components/deck/AddAgentForm";

describe("AddAgentForm", () => {
  it("submits selected suggested skills", () => {
    const onSubmit = vi.fn();

    render(
      <AddAgentForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        isSubmitting={false}
        error={null}
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
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "docs" } });
    fireEvent.click(screen.getByLabelText(/docs-writer/i));
    fireEvent.click(screen.getByRole("button", { name: /create agent/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      "docs",
      "",
      expect.any(String),
      ["docs-writer"],
    );
  });
});
