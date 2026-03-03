import { useEffect, useState } from "react";

import type { PendingDeleteTentacle } from "../app/hooks/useTentacleMutations";
import { ActionButton } from "./ui/ActionButton";

type DeleteTentacleDialogProps = {
  pendingDeleteTentacle: PendingDeleteTentacle;
  isDeletingTentacleId: string | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
};

export const DeleteTentacleDialog = ({
  pendingDeleteTentacle,
  isDeletingTentacleId,
  onCancel,
  onConfirmDelete,
}: DeleteTentacleDialogProps) => {
  const [cleanupConfirmationInput, setCleanupConfirmationInput] = useState("");
  const isCleanupIntent =
    pendingDeleteTentacle.intent === "cleanup-worktree" &&
    pendingDeleteTentacle.workspaceMode === "worktree";
  const isCleanupConfirmationValid =
    !isCleanupIntent || cleanupConfirmationInput.trim() === pendingDeleteTentacle.tentacleId;

  useEffect(() => {
    setCleanupConfirmationInput("");
  }, [pendingDeleteTentacle.tentacleId, pendingDeleteTentacle.intent]);

  return (
    <div className="delete-confirm-backdrop" role="presentation">
      <dialog
        aria-label={`Delete confirmation for ${pendingDeleteTentacle.tentacleName}`}
        className="delete-confirm-dialog"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || isDeletingTentacleId !== null) {
            return;
          }
          event.preventDefault();
          onCancel();
        }}
        open
      >
        <header className="delete-confirm-header">
          <h2>{isCleanupIntent ? "Cleanup Worktree Tentacle" : "Delete Tentacle"}</h2>
          <span className="pill blocked">DESTRUCTIVE</span>
        </header>
        <div className="delete-confirm-body">
          <p className="delete-confirm-message">
            {isCleanupIntent ? (
              <>
                Cleanup <strong>{pendingDeleteTentacle.tentacleName}</strong> and delete the
                tentacle session metadata.
              </>
            ) : (
              <>
                Delete <strong>{pendingDeleteTentacle.tentacleName}</strong> and terminate all of
                its active sessions.
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
              <dd>{pendingDeleteTentacle.tentacleName}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd>{pendingDeleteTentacle.tentacleId}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{pendingDeleteTentacle.workspaceMode === "worktree" ? "worktree" : "shared"}</dd>
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
            aria-label={`Confirm delete ${pendingDeleteTentacle.tentacleId}`}
            className="delete-confirm-submit"
            disabled={
              isDeletingTentacleId === pendingDeleteTentacle.tentacleId || !isCleanupConfirmationValid
            }
            onClick={onConfirmDelete}
            size="dense"
            variant="danger"
          >
            {isDeletingTentacleId === pendingDeleteTentacle.tentacleId
              ? "Deleting..."
              : isCleanupIntent
                ? "Cleanup"
                : "Delete"}
          </ActionButton>
        </div>
      </dialog>
    </div>
  );
};
