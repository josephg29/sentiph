import { useEffect, useState } from "react";

import type { PendingDeleteTerminal } from "../app/hooks/useTerminalMutations";
import { ActionButton } from "./ui/ActionButton";

type DeleteTentacleDialogProps = {
  pendingDeleteTerminal: PendingDeleteTerminal;
  isDeletingTerminalId: string | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
};

export const DeleteTentacleDialog = ({
  pendingDeleteTerminal,
  isDeletingTerminalId,
  onCancel,
  onConfirmDelete,
}: DeleteTentacleDialogProps) => {
  const [cleanupConfirmationInput, setCleanupConfirmationInput] = useState("");
  const isCleanupIntent =
    pendingDeleteTerminal.intent === "cleanup-worktree" &&
    pendingDeleteTerminal.workspaceMode === "worktree";
  const isCleanupConfirmationValid =
    !isCleanupIntent || cleanupConfirmationInput.trim() === pendingDeleteTerminal.terminalId;

  useEffect(() => {
    setCleanupConfirmationInput("");
  }, [pendingDeleteTerminal.terminalId, pendingDeleteTerminal.intent]);

  return (
    <section
      aria-label={`Delete confirmation for ${pendingDeleteTerminal.terminalId}`}
      className="delete-confirm-dialog"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || isDeletingTerminalId !== null) {
          return;
        }
        event.preventDefault();
        onCancel();
      }}
      tabIndex={-1}
    >
      <header className="delete-confirm-header">
        <h2>{isCleanupIntent ? "Cleanup Worktree Tentacle" : "Delete Tentacle"}</h2>
        <div className="delete-confirm-header-actions">
          <span className="pill blocked">DESTRUCTIVE</span>
          <ActionButton
            aria-label="Close sidebar action panel"
            className="delete-confirm-close"
            disabled={isDeletingTerminalId !== null}
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
          {isCleanupIntent ? (
            <>
              Cleanup <strong>{pendingDeleteTerminal.tentacleName}</strong> and delete the tentacle
              session metadata.
            </>
          ) : (
            <>
              Delete <strong>{pendingDeleteTerminal.tentacleName}</strong> and terminate all of its
              active sessions.
            </>
          )}
        </p>
        <p className="delete-confirm-warning">
          {isCleanupIntent
            ? "This action removes the worktree directory and local branch."
            : "This action cannot be undone."}
        </p>
        <dl className="delete-confirm-details">
          <div>
            <dt>Name</dt>
            <dd>{pendingDeleteTerminal.tentacleName}</dd>
          </div>
          <div>
            <dt>ID</dt>
            <dd>{pendingDeleteTerminal.terminalId}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{pendingDeleteTerminal.workspaceMode === "worktree" ? "worktree" : "shared"}</dd>
          </div>
        </dl>
        {isCleanupIntent && (
          <div className="delete-confirm-typed-check">
            <label htmlFor="cleanup-confirm-id-input">Type tentacle ID to confirm cleanup</label>
            <input
              aria-label="Type tentacle ID to confirm cleanup"
              id="cleanup-confirm-id-input"
              onChange={(event) => {
                setCleanupConfirmationInput(event.target.value);
              }}
              type="text"
              value={cleanupConfirmationInput}
            />
          </div>
        )}
      </div>
      <div className="delete-confirm-actions">
        <ActionButton
          aria-label="Cancel delete"
          className="delete-confirm-cancel"
          onClick={onCancel}
          size="dense"
          variant="accent"
        >
          Cancel
        </ActionButton>
        <ActionButton
          aria-label={`Confirm delete ${pendingDeleteTerminal.terminalId}`}
          className="delete-confirm-submit"
          disabled={
            isDeletingTerminalId === pendingDeleteTerminal.terminalId || !isCleanupConfirmationValid
          }
          onClick={onConfirmDelete}
          size="dense"
          variant="danger"
        >
          {isDeletingTerminalId === pendingDeleteTerminal.terminalId
            ? "Deleting..."
            : isCleanupIntent
              ? "Cleanup"
              : "Delete"}
        </ActionButton>
      </div>
    </section>
  );
};
