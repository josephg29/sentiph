import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useConsoleKeyboardShortcuts } from "../src/app/hooks/useConsoleKeyboardShortcuts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useConsoleKeyboardShortcuts", () => {
  it("maps the visible digit keys to the stable primary nav index", () => {
    const setActivePrimaryNav = vi.fn();
    const { unmount } = renderHook(() => useConsoleKeyboardShortcuts({ setActivePrimaryNav }));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "4", cancelable: true }));

    expect(setActivePrimaryNav).toHaveBeenNthCalledWith(1, 1);
    expect(setActivePrimaryNav).toHaveBeenNthCalledWith(2, 9);
    unmount();
  });

  it("toggles the shortcuts overlay on '?' and prevents default", () => {
    const setActivePrimaryNav = vi.fn();
    const onToggleShortcutsOverlay = vi.fn();
    const { unmount } = renderHook(() =>
      useConsoleKeyboardShortcuts({ setActivePrimaryNav, onToggleShortcutsOverlay }),
    );

    const event = new KeyboardEvent("keydown", { key: "?", cancelable: true });
    window.dispatchEvent(event);

    expect(onToggleShortcutsOverlay).toHaveBeenCalledTimes(1);
    expect(setActivePrimaryNav).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("ignores shortcuts while typing into an editable element", () => {
    const setActivePrimaryNav = vi.fn();
    const onToggleShortcutsOverlay = vi.fn();
    const { unmount } = renderHook(() =>
      useConsoleKeyboardShortcuts({ setActivePrimaryNav, onToggleShortcutsOverlay }),
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));

    expect(setActivePrimaryNav).not.toHaveBeenCalled();
    expect(onToggleShortcutsOverlay).not.toHaveBeenCalled();
    unmount();
  });

  it("does nothing for unmapped keys or '?' without a handler", () => {
    const setActivePrimaryNav = vi.fn();
    const { unmount } = renderHook(() => useConsoleKeyboardShortcuts({ setActivePrimaryNav }));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", cancelable: true }));

    expect(setActivePrimaryNav).not.toHaveBeenCalled();
    unmount();
  });
});
