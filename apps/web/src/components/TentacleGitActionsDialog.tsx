import type { TentacleGitStatusSnapshot, TentaclePullRequestSnapshot } from "../app/types";
import { ActionButton } from "./ui/ActionButton";

type TentacleGitActionsDialogProps = {
  tentacleId: string;
  tentacleName: string;
  gitStatus: TentacleGitStatusSnapshot | null;
  gitPullRequest: TentaclePullRequestSnapshot | null;
  gitCommitMessage: string;
  gitPullRequestTitle: string;
  gitPullRequestBody: string;
  gitPullRequestBaseRef: string;
  isLoading: boolean;
  isMutating: boolean;
  errorMessage: string | null;
  onCommitMessageChange: (value: string) => void;
  onPullRequestTitleChange: (value: string) => void;
  onPullRequestBodyChange: (value: string) => void;
  onPullRequestBaseRefChange: (value: string) => void;
  onClose: () => void;
  onCommit: () => void;
  onPush: () => void;
  onSync: () => void;
  onCreatePullRequest: () => void;
  onMergePullRequest: () => void;
  onCleanupWorktree: () => void;
};

const renderDirtyState = (isDirty: boolean) => (isDirty ? "Dirty" : "Clean");

export const TentacleGitActionsDialog = ({
  tentacleId,
  tentacleName,
  gitStatus,
  gitPullRequest,
  gitCommitMessage,
  gitPullRequestTitle,
  gitPullRequestBody,
  gitPullRequestBaseRef,
  isLoading,
  isMutating,
  errorMessage,
  onCommitMessageChange,
  onPullRequestTitleChange,
  onPullRequestBodyChange,
  onPullRequestBaseRefChange,
  onClose,
  onCommit,
  onPush,
  onSync,
  onCreatePullRequest,
  onMergePullRequest,
  onCleanupWorktree,
}: TentacleGitActionsDialogProps) => {
  const isCommitDisabled = isLoading || isMutating || gitCommitMessage.trim().length === 0;
  const isSyncDisabled = isLoading || isMutating || Boolean(gitStatus?.isDirty);
  const hasOpenPullRequest = gitPullRequest?.status === "open";
  const isCreatePullRequestDisabled =
    isLoading || isMutating || hasOpenPullRequest || gitPullRequestTitle.trim().length === 0;
  const canMergePullRequest =
    hasOpenPullRequest &&
    gitPullRequest?.isDraft !== true &&
    gitPullRequest?.mergeable !== "CONFLICTING";
  const isMergePullRequestDisabled = isLoading || isMutating || !canMergePullRequest;

  const disabledActionReasons: string[] = [];
  if (isLoading) {
    disabledActionReasons.push("Git lifecycle snapshot is loading.");
  } else if (isMutating) {
    disabledActionReasons.push("Another git action is currently running.");
  } else {
    if (gitCommitMessage.trim().length === 0) {
      disabledActionReasons.push("Commit blocked: enter a commit message.");
    }
    if (Boolean(gitStatus?.isDirty)) {
      disabledActionReasons.push("Sync blocked: worktree has uncommitted changes.");
    }
    if (hasOpenPullRequest) {
      disabledActionReasons.push("Create pull request blocked: an open pull request already exists.");
    } else if (gitPullRequestTitle.trim().length === 0) {
      disabledActionReasons.push("Create pull request blocked: enter a pull request title.");
    }
    if (!hasOpenPullRequest) {
      disabledActionReasons.push("Merge blocked: no open pull request.");
    } else if (gitPullRequest?.isDraft === true) {
      disabledActionReasons.push("Merge blocked: pull request is still a draft.");
    } else if (gitPullRequest?.mergeable === "CONFLICTING") {
      disabledActionReasons.push("Merge blocked: pull request has merge conflicts.");
    }
  }

  return (
    <div className="git-actions-backdrop" role="presentation">
      <dialog
        aria-label={`Git actions for ${tentacleId}`}
        className="git-actions-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isMutating) {
            event.preventDefault();
            onClose();
          }
        }}
        open
      >
        <header className="git-actions-header">
          <h2>Worktree Git Actions</h2>
          <span className="pill git-actions-worktree-badge">WORKTREE</span>
        </header>
        <div className="git-actions-body">
          <p className="git-actions-message">
            Manage git lifecycle for <strong>{tentacleName}</strong> ({tentacleId}).
          </p>
          {isLoading ? (
            <p className="git-actions-loading">Loading git status...</p>
          ) : gitStatus ? (
            <dl className="git-actions-status">
              <div>
                <dt>Branch</dt>
                <dd>{gitStatus.branchName}</dd>
              </div>
              <div>
                <dt>Upstream</dt>
                <dd>{gitStatus.upstreamBranchName ?? "Not set"}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{renderDirtyState(gitStatus.isDirty)}</dd>
              </div>
              <div>
                <dt>Sync</dt>
                <dd className="git-actions-sync-metric">
                  <span className="git-actions-ahead-count">{gitStatus.aheadCount}</span>
                  <span className="git-actions-metric-separator">/</span>
                  <span className="git-actions-behind-count">{gitStatus.behindCount}</span>
                </dd>
              </div>
              <div>
                <dt>Line diff</dt>
                <dd className="git-actions-line-diff-metric">
                  <span className="git-actions-insertions-count">+{gitStatus.insertedLineCount}</span>
                  <span className="git-actions-metric-separator">/</span>
                  <span className="git-actions-deletions-count">-{gitStatus.deletedLineCount}</span>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="git-actions-loading">No git status available.</p>
          )}
          <label className="git-actions-commit-label" htmlFor="git-actions-commit-input">
            Commit message
          </label>
          <input
            aria-label={`Commit message for ${tentacleId}`}
            className="git-actions-commit-input"
            id="git-actions-commit-input"
            onChange={(event) => {
              onCommitMessageChange(event.target.value);
            }}
            placeholder="feat: describe your change"
            type="text"
            value={gitCommitMessage}
          />
          <div className="git-actions-pr-section">
            <h3>Pull request</h3>
            <p className="git-actions-pr-status">
              Status: {gitPullRequest?.status ?? "none"}
              {gitPullRequest?.number ? ` · #${gitPullRequest.number}` : ""}
            </p>
            <label className="git-actions-commit-label" htmlFor="git-actions-pr-title-input">
              PR title
            </label>
            <input
              aria-label={`Pull request title for ${tentacleId}`}
              className="git-actions-commit-input"
              id="git-actions-pr-title-input"
              onChange={(event) => {
                onPullRequestTitleChange(event.target.value);
              }}
              placeholder="feat: summarize this branch"
              type="text"
              value={gitPullRequestTitle}
            />
            <label className="git-actions-commit-label" htmlFor="git-actions-pr-body-input">
              PR body
            </label>
            <textarea
              aria-label={`Pull request body for ${tentacleId}`}
              className="git-actions-pr-body-input"
              id="git-actions-pr-body-input"
              onChange={(event) => {
                onPullRequestBodyChange(event.target.value);
              }}
              rows={3}
              value={gitPullRequestBody}
            />
            <label className="git-actions-commit-label" htmlFor="git-actions-pr-base-input">
              PR base
            </label>
            <input
              aria-label={`Pull request base for ${tentacleId}`}
              className="git-actions-commit-input"
              id="git-actions-pr-base-input"
              onChange={(event) => {
                onPullRequestBaseRefChange(event.target.value);
              }}
              placeholder="main"
              type="text"
              value={gitPullRequestBaseRef}
            />
          </div>
          {errorMessage && <p className="git-actions-error">{errorMessage}</p>}
          {disabledActionReasons.length > 0 && (
            <div aria-live="polite" className="git-actions-disabled-reasons">
              <p>Blocked actions</p>
              <ul>
                {disabledActionReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="git-actions-buttons">
          <ActionButton
            aria-label="Commit changes"
            className="git-actions-commit"
            disabled={isCommitDisabled}
            onClick={onCommit}
            size="dense"
            variant="accent"
          >
            {isMutating ? "Running..." : "Commit changes"}
          </ActionButton>
          <ActionButton
            aria-label="Push branch"
            className="git-actions-push"
            disabled={isLoading || isMutating}
            onClick={onPush}
            size="dense"
            variant="info"
          >
            Push branch
          </ActionButton>
          <ActionButton
            aria-label="Sync with base"
            className="git-actions-sync"
            disabled={isSyncDisabled}
            onClick={onSync}
            size="dense"
            variant="info"
          >
            Sync with base
          </ActionButton>
          <ActionButton
            aria-label="Close git actions"
            className="git-actions-close"
            disabled={isMutating}
            onClick={onClose}
            size="dense"
            variant="accent"
          >
            Close
          </ActionButton>
          <ActionButton
            aria-label="Create pull request"
            className="git-actions-create-pr"
            disabled={isCreatePullRequestDisabled}
            onClick={onCreatePullRequest}
            size="dense"
            variant="accent"
          >
            Create pull request
          </ActionButton>
          <ActionButton
            aria-label="Merge pull request"
            className="git-actions-merge-pr"
            disabled={isMergePullRequestDisabled}
            onClick={onMergePullRequest}
            size="dense"
            variant="info"
          >
            Merge pull request
          </ActionButton>
          <ActionButton
            aria-label="Cleanup worktree"
            className="git-actions-cleanup"
            disabled={isLoading || isMutating}
            onClick={onCleanupWorktree}
            size="dense"
            variant="danger"
          >
            Cleanup worktree
          </ActionButton>
        </div>
      </dialog>
    </div>
  );
};
