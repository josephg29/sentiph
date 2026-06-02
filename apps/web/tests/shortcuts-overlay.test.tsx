import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsOverlay } from "../src/components/ui/ShortcutsOverlay";

describe("ShortcutsOverlay", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ShortcutsOverlay open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the heading and the shortcut rows when open", () => {
    render(<ShortcutsOverlay open onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText(/show or hide this shortcuts panel/i)).toBeInTheDocument();
    expect(screen.getByText(/open the focused agent node/i)).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close keyboard shortcuts/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed on the panel", () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText("Keyboard shortcuts"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys on the panel", () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText("Keyboard shortcuts"), { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
