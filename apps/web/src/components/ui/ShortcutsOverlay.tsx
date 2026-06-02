import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";

import { ActionButton } from "./ActionButton";

type ShortcutEntry = {
  keys: string;
  description: string;
};

// Single source of truth for the legend. Keep in sync with the handlers in
// useConsoleKeyboardShortcuts, CanvasGraphLayer, SessionNode, and the dialogs.
const SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: "1 – 4", description: "Switch between Agents, Activity, Settings, and Observe" },
  { keys: "?", description: "Show or hide this shortcuts panel" },
  { keys: "Esc", description: "Close a dialog, deselect a node, or close this panel" },
  { keys: "Enter / Space", description: "Open the focused agent node" },
  { keys: "Click node", description: "Open or focus that agent's terminal panel" },
  { keys: "Enter / Esc", description: "Commit or cancel a terminal rename" },
];

type ShortcutsOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export const ShortcutsOverlay = ({ open, onClose }: ShortcutsOverlayProps) => {
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Remember what had focus so we can hand it back when the dialog closes,
    // and move focus into the dialog so keyboard users aren't stranded behind it.
    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    panelRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    // Trap Tab within the dialog so focus can't escape to the console behind it.
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const items = focusable ? Array.from(focusable) : [];
    if (items.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="shortcuts-overlay-backdrop">
      <section
        ref={panelRef}
        aria-label="Keyboard shortcuts"
        className="shortcuts-overlay"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="shortcuts-overlay-header">
          <h2>Keyboard shortcuts</h2>
          <ActionButton
            aria-label="Close keyboard shortcuts"
            className="shortcuts-overlay-close"
            onClick={onClose}
            size="dense"
            variant="accent"
          >
            Close
          </ActionButton>
        </header>
        <dl className="shortcuts-overlay-list">
          {SHORTCUTS.map((entry) => (
            <div className="shortcuts-overlay-row" key={entry.keys}>
              <dt className="shortcuts-overlay-keys">{entry.keys}</dt>
              <dd className="shortcuts-overlay-desc">{entry.description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
};
