import { useCallback, useMemo, useState } from "react";

import type { GraphNode } from "../../app/canvas/types";
import type { TerminalView } from "../../app/types";
import { ActionButton } from "../ui/ActionButton";

type DeleteAllTerminalsDialogProps = {
  columns: TerminalView;
  nodes: GraphNode[];
  onCancel: () => void;
  onDeleted: () => void;
};

export const DeleteAllTerminalsDialog = ({
  columns,
  nodes,
  onCancel,
  onDeleted,
}: DeleteAllTerminalsDialogProps) => {
  const [inactiveOnly, setInactiveOnly] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const inactiveTerminals = useMemo(() => columns.filter((t) => !t.hasUserPrompt), [columns]);

  const inactiveSessionIds = useMemo(
    () =>
      nodes.filter((n) => n.type === "inactive-session" && n.sessionId).map((n) => n.sessionId!),
    [nodes],
  );

  const activeTargets = inactiveOnly ? inactiveTerminals : columns;
  const totalTargetCount = activeTargets.length + inactiveSessionIds.length;

  const handleConfirm = useCallback(async () => {
    if (totalTargetCount === 0) return;
    setIsDeleting(true);
    setProgress({ done: 0, total: totalTargetCount });

    let done = 0;

    // Delete active terminals
    for (const terminal of activeTargets) {
      try {
        await fetch(`/api/terminals/${encodeURIComponent(terminal.terminalId)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
      } catch {
        // continue
      }
      done += 1;
      setProgress({ done, total: totalTargetCount });
    }

    // Delete inactive conversation sessions
    for (const sessionId of inactiveSessionIds) {
      try {
        await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
      } catch {
        // continue
      }
      done += 1;
      setProgress({ done, total: totalTargetCount });
    }

    setIsDeleting(false);
    setProgress(null);
    onDeleted();
  }, [activeTargets, inactiveSessionIds, totalTargetCount, onDeleted]);

  return (
    <section
      aria-label="Delete all terminals"
      className="delete-confirm-dialog"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || isDeleting) return;
        event.preventDefault();
        onCancel();
      }}
      tabIndex={-1}
    >
      <header className="delete-confirm-header">
        <h2>Delete Terminals</h2>
        <div className="delete-confirm-header-actions">
          <span className="pill blocked">DESTRUCTIVE</span>
          <ActionButton
            aria-label="Close confirmation"
            className="delete-confirm-close"
            disabled={isDeleting}
            onClick={onCancel}
            size="dense"
            variant="accent"
          >
            Close
          </ActionButton>
        </div>
      </header>
      <div className="delete-confirm-body">
        <p className="delete-confirm-message">
          Delete{" "}
          <strong>
            {totalTargetCount} {totalTargetCount === 1 ? "session" : "sessions"}
          </strong>
          {inactiveOnly ? " (inactive terminals + past sessions)" : " (all)"}.
        </p>
        <p className="delete-confirm-warning">This action cannot be undone.</p>
        <div className="delete-all-mode-row">
          <span className="delete-all-mode-label">
            {inactiveOnly ? "Inactive only" : "All terminals"}
          </span>
          <button
            type="button"
            className="delete-all-toggle-switch"
            role="switch"
            aria-checked={!inactiveOnly}
            aria-label="Toggle between inactive only and all terminals"
            disabled={isDeleting}
            onClick={() => setInactiveOnly((prev) => !prev)}
          >
            <span className="delete-all-toggle-thumb" />
          </button>
        </div>
        <dl className="delete-confirm-details delete-all-details">
          <div>
            <dt>Inactive</dt>
            <dd>{inactiveTerminals.length}</dd>
          </div>
          <div>
            <dt>Past sessions</dt>
            <dd>{inactiveSessionIds.length}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{columns.length}</dd>
          </div>
        </dl>
        {progress && (
          <div className="delete-all-progress">
            Deleting... {progress.done}/{progress.total}
          </div>
        )}
      </div>
      <div className="delete-confirm-actions">
        <ActionButton
          aria-label="Cancel delete all"
          className="delete-confirm-cancel"
          disabled={isDeleting}
          onClick={onCancel}
          size="dense"
          variant="accent"
        >
          Cancel
        </ActionButton>
        <ActionButton
          aria-label="Confirm delete all terminals"
          className="delete-confirm-submit"
          disabled={isDeleting || totalTargetCount === 0}
          onClick={() => void handleConfirm()}
          size="dense"
          variant="danger"
        >
          {isDeleting
            ? `Deleting ${progress?.done ?? 0}/${progress?.total ?? 0}`
            : `Delete ${totalTargetCount}`}
        </ActionButton>
      </div>
    </section>
  );
};
