import { ActionButton } from "./ui/ActionButton";

type ClearAllConversationsDialogProps = {
  sessionCount: number;
  isClearing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const ClearAllConversationsDialog = ({
  sessionCount,
  isClearing,
  onCancel,
  onConfirm,
}: ClearAllConversationsDialogProps) => (
  <section
    aria-label="Clear all conversations confirmation"
    className="delete-confirm-dialog"
    onKeyDown={(event) => {
      if (event.key !== "Escape" || isClearing) {
        return;
      }
      event.preventDefault();
      onCancel();
    }}
    tabIndex={-1}
  >
    <header className="delete-confirm-header">
      <h2>Clear All Conversations</h2>
      <div className="delete-confirm-header-actions">
        <span className="pill blocked">DESTRUCTIVE</span>
        <ActionButton
          aria-label="Close confirmation"
          className="delete-confirm-close"
          disabled={isClearing}
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
        Delete all <strong>{sessionCount}</strong> conversation
        {sessionCount === 1 ? "" : "s"} and their transcript data.
      </p>
      <p className="delete-confirm-warning">This action cannot be undone.</p>
    </div>
    <div className="delete-confirm-actions">
      <ActionButton
        aria-label="Cancel clear all"
        className="delete-confirm-cancel"
        disabled={isClearing}
        onClick={onCancel}
        size="dense"
        variant="accent"
      >
        Cancel
      </ActionButton>
      <ActionButton
        aria-label="Confirm clear all conversations"
        className="delete-confirm-submit"
        disabled={isClearing}
        onClick={onConfirm}
        size="dense"
        variant="danger"
      >
        {isClearing ? "Clearing..." : "Clear All"}
      </ActionButton>
    </div>
  </section>
);
