import { useEffect } from "react";

import type { PrimaryNavIndex } from "../constants";
import { isEditableEventTarget, parsePrimaryNavKey } from "../hotkeys";

type UseConsoleKeyboardShortcutsOptions = {
  setActivePrimaryNav: (index: PrimaryNavIndex) => void;
  onToggleShortcutsOverlay?: () => void;
};

export const useConsoleKeyboardShortcuts = ({
  setActivePrimaryNav,
  onToggleShortcutsOverlay,
}: UseConsoleKeyboardShortcutsOptions) => {
  useEffect(() => {
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) {
        return;
      }

      // "?" (Shift+/) toggles the shortcuts legend. Guarded by the editable
      // check above so it never fires while typing into a terminal/input.
      if (event.key === "?" && onToggleShortcutsOverlay) {
        onToggleShortcutsOverlay();
        event.preventDefault();
        return;
      }

      const nextPrimaryNav = parsePrimaryNavKey(event.key);
      if (nextPrimaryNav !== null) {
        setActivePrimaryNav(nextPrimaryNav);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [setActivePrimaryNav, onToggleShortcutsOverlay]);
};
