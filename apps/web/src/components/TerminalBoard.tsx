import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
} from "react";

import type {
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  TerminalView,
  TerminalWorkspaceMode,
} from "../app/types";
import { TERMINAL_MIN_WIDTH } from "../layout/terminalPaneSizing";
import type { AgentRuntimeState } from "./AgentStateBadge";
import { OctopusGlyph } from "./EmptyOctopus";
import { Terminal } from "./Terminal";
import { ActionButton } from "./ui/ActionButton";

type TerminalBoardProps = {
  terminalsRef: RefObject<HTMLElement | null>;
  terminalNameInputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  terminals: TerminalView;
  visibleTerminals: TerminalView;
  gitStatusByTentacleId: Record<string, TentacleGitStatusSnapshot>;
  gitStatusLoadingByTentacleId: Record<string, boolean>;
  pullRequestByTentacleId: Record<string, TentaclePullRequestSnapshot>;
  pullRequestLoadingByTentacleId: Record<string, boolean>;
  loadError: string | null;
  terminalWidths: Record<string, number>;
  editingTerminalId: string | null;
  terminalNameDraft: string;
  isDeletingTerminalId: string | null;
  selectedTerminalId: string | null;
  onTerminalHeaderWheel: (event: ReactWheelEvent<HTMLElement>) => void;
  onTerminalNameDraftChange: (name: string) => void;
  onSelectTerminal: (terminalId: string) => void;
  onSubmitTerminalRename: (terminalId: string, currentTerminalName: string) => void;
  onCancelTerminalRename: () => void;
  onBeginTerminalNameEdit: (terminalId: string, currentTerminalName: string) => void;
  onMinimizeTerminal: (terminalId: string) => void;
  onRequestDeleteTerminal: (
    terminalId: string,
    terminalName: string,
    workspaceMode: TerminalWorkspaceMode,
  ) => void;
  onOpenTerminalGitActions: (terminalId: string) => void;
  onTerminalStateChange: (terminalId: string, state: AgentRuntimeState) => void;
  onTerminalDividerKeyDown: (
    leftTerminalId: string,
    rightTerminalId: string,
  ) => (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onTerminalDividerPointerDown: (
    leftTerminalId: string,
    rightTerminalId: string,
  ) => (event: ReactPointerEvent<HTMLDivElement>) => void;
};

const renderTerminalWorkspaceLabel = (workspaceMode: TerminalWorkspaceMode) =>
  workspaceMode === "worktree" ? "WORKTREE" : "MAIN";

const renderTerminalGitDirtyLabel = (
  workspaceMode: TerminalWorkspaceMode,
  gitStatus: TentacleGitStatusSnapshot | undefined,
  isLoadingGitStatus: boolean,
) => {
  if (workspaceMode !== "worktree") {
    return null;
  }

  if (isLoadingGitStatus) {
    return "GIT ...";
  }

  if (!gitStatus) {
    return "GIT ?";
  }

  return gitStatus.isDirty ? "DIRTY" : "CLEAN";
};

const renderTerminalGitAheadBehindLabel = (
  workspaceMode: TerminalWorkspaceMode,
  gitStatus: TentacleGitStatusSnapshot | undefined,
) => {
  if (workspaceMode !== "worktree" || !gitStatus) {
    return null;
  }

  return (
    <>
      <span className="terminal-git-ahead-count">{gitStatus.aheadCount}</span>
      <span className="terminal-git-metric-separator">/</span>
      <span className="terminal-git-behind-count">{gitStatus.behindCount}</span>
    </>
  );
};

const renderTerminalPullRequestLabel = (
  workspaceMode: TerminalWorkspaceMode,
  pullRequest: TentaclePullRequestSnapshot | undefined,
  isLoadingPullRequest: boolean,
) => {
  if (workspaceMode !== "worktree") {
    return null;
  }

  if (isLoadingPullRequest) {
    return "PR ...";
  }

  if (!pullRequest || pullRequest.status === "none") {
    return null;
  }

  const statusLabel = pullRequest.status.toUpperCase();
  const numberLabel = pullRequest.number !== null ? ` #${pullRequest.number}` : "";
  return `PR ${statusLabel}${numberLabel}`;
};

const renderTerminalGitBadges = (
  gitDirtyLabel: string | null,
  gitAheadBehindLabel: ReactNode,
  gitPullRequestLabel: string | null,
) => (
  <>
    {gitDirtyLabel && <span className="terminal-git-status-badge">{gitDirtyLabel}</span>}
    {gitAheadBehindLabel && (
      <span className="terminal-git-metric-badge">{gitAheadBehindLabel}</span>
    )}
    {gitPullRequestLabel && <span className="terminal-pr-status-badge">{gitPullRequestLabel}</span>}
  </>
);

export const TerminalBoard = ({
  terminalsRef,
  terminalNameInputRef,
  isLoading,
  terminals,
  visibleTerminals,
  gitStatusByTentacleId,
  gitStatusLoadingByTentacleId,
  pullRequestByTentacleId,
  pullRequestLoadingByTentacleId,
  loadError,
  terminalWidths,
  editingTerminalId,
  terminalNameDraft,
  isDeletingTerminalId,
  selectedTerminalId,
  onTerminalHeaderWheel,
  onTerminalNameDraftChange,
  onSelectTerminal,
  onSubmitTerminalRename,
  onCancelTerminalRename,
  onBeginTerminalNameEdit,
  onMinimizeTerminal,
  onRequestDeleteTerminal,
  onOpenTerminalGitActions,
  onTerminalStateChange,
  onTerminalDividerKeyDown,
  onTerminalDividerPointerDown,
}: TerminalBoardProps) => {
  return (
    <main
      ref={terminalsRef}
      className="terminals"
      aria-label="Terminal board"
      onWheel={onTerminalHeaderWheel}
    >
      {isLoading && (
        <section className="empty-state" aria-label="Loading">
          <h2>Loading terminals...</h2>
        </section>
      )}

      {!isLoading && terminals.length === 0 && (
        <section className="empty-state" aria-label="Empty state">
          <OctopusGlyph animation="bounce" className="octopus-svg" testId="empty-octopus" />
          <h2>No active terminals</h2>
          <p>When agents start, terminals will appear here.</p>
          {loadError && <p className="empty-state-subtle">{loadError}</p>}
        </section>
      )}

      {!isLoading && terminals.length > 0 && visibleTerminals.length === 0 && (
        <section className="empty-state" aria-label="All minimized">
          <h2>All terminals minimized</h2>
          <p>Use the Active Agents sidebar to maximize a terminal.</p>
          {loadError && <p className="empty-state-subtle">{loadError}</p>}
        </section>
      )}

      {visibleTerminals.map((terminal, index) => {
        const rightNeighbor = visibleTerminals[index + 1];
        const isSelected = selectedTerminalId === terminal.terminalId;
        const workspaceMode = terminal.workspaceMode ?? "shared";
        const terminalName = terminal.tentacleName ?? terminal.terminalId;
        const gitStatus = gitStatusByTentacleId[terminal.tentacleId];
        const isLoadingGitStatus = gitStatusLoadingByTentacleId[terminal.tentacleId] ?? false;
        const pullRequest = pullRequestByTentacleId[terminal.tentacleId];
        const isLoadingPullRequest = pullRequestLoadingByTentacleId[terminal.tentacleId] ?? false;
        const gitDirtyLabel = renderTerminalGitDirtyLabel(
          workspaceMode,
          gitStatus,
          isLoadingGitStatus,
        );
        const gitAheadBehindLabel = renderTerminalGitAheadBehindLabel(workspaceMode, gitStatus);
        const gitPullRequestLabel = renderTerminalPullRequestLabel(
          workspaceMode,
          pullRequest,
          isLoadingPullRequest,
        );
        return (
          <Fragment key={terminal.terminalId}>
            <section
              className={`terminal-column${isSelected ? " terminal-column--selected" : ""}`}
              data-selected={isSelected ? "true" : "false"}
              aria-label={terminal.terminalId}
              onFocusCapture={() => {
                onSelectTerminal(terminal.terminalId);
              }}
              onPointerDownCapture={() => {
                onSelectTerminal(terminal.terminalId);
              }}
              style={{
                width: `${terminalWidths[terminal.terminalId] ?? TERMINAL_MIN_WIDTH}px`,
              }}
            >
              <div
                className={`terminal-column-header${
                  editingTerminalId === terminal.terminalId
                    ? " terminal-column-header--editing"
                    : ""
                }`}
              >
                <div className="terminal-column-heading">
                  {editingTerminalId === terminal.terminalId ? (
                    <>
                      <input
                        ref={terminalNameInputRef}
                        aria-label={`Terminal name for ${terminal.terminalId}`}
                        className="terminal-name-editor"
                        onBlur={() => {
                          onSubmitTerminalRename(terminal.terminalId, terminalName);
                        }}
                        onChange={(event) => {
                          onTerminalNameDraftChange(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onSubmitTerminalRename(terminal.terminalId, terminalName);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            onCancelTerminalRename();
                          }
                        }}
                        type="text"
                        value={terminalNameDraft}
                      />
                      <span
                        className={`terminal-workspace-badge terminal-workspace-badge--${workspaceMode}`}
                      >
                        {renderTerminalWorkspaceLabel(workspaceMode)}
                      </span>
                    </>
                  ) : (
                    <h2>
                      <button
                        className="terminal-name-display"
                        onClick={() => {
                          onBeginTerminalNameEdit(terminal.terminalId, terminalName);
                        }}
                        type="button"
                      >
                        {terminalName}
                      </button>
                      <span
                        className={`terminal-workspace-badge terminal-workspace-badge--${workspaceMode}`}
                      >
                        {renderTerminalWorkspaceLabel(workspaceMode)}
                      </span>
                    </h2>
                  )}
                </div>
                {editingTerminalId !== terminal.terminalId && workspaceMode === "worktree" && (
                  <div className="terminal-header-git-center">
                    <span className="terminal-git-cluster">
                      {renderTerminalGitBadges(
                        gitDirtyLabel,
                        gitAheadBehindLabel,
                        gitPullRequestLabel,
                      )}
                      <ActionButton
                        aria-label={`Open git actions for ${terminal.terminalId}`}
                        className="terminal-git"
                        onClick={() => {
                          onOpenTerminalGitActions(terminal.tentacleId);
                        }}
                        size="dense"
                        variant="info"
                      >
                        Git
                      </ActionButton>
                    </span>
                  </div>
                )}
                {editingTerminalId !== terminal.terminalId && (
                  <div className="terminal-header-actions">
                    <ActionButton
                      aria-label={`Minimize terminal ${terminal.terminalId}`}
                      className="terminal-minimize"
                      onClick={() => {
                        onMinimizeTerminal(terminal.terminalId);
                      }}
                      size="dense"
                      variant="info"
                    >
                      Minimize
                    </ActionButton>
                    <ActionButton
                      aria-label={`Rename terminal ${terminal.terminalId}`}
                      className="terminal-rename"
                      onClick={() => {
                        onBeginTerminalNameEdit(terminal.terminalId, terminalName);
                      }}
                      size="dense"
                      variant="accent"
                    >
                      Rename
                    </ActionButton>
                    <ActionButton
                      aria-label={`Delete terminal ${terminal.terminalId}`}
                      className="terminal-delete"
                      disabled={isDeletingTerminalId === terminal.terminalId}
                      onClick={() => {
                        onRequestDeleteTerminal(terminal.terminalId, terminalName, workspaceMode);
                      }}
                      size="dense"
                      variant="danger"
                    >
                      {isDeletingTerminalId === terminal.terminalId ? "Deleting..." : "Delete"}
                    </ActionButton>
                  </div>
                )}
              </div>
              <div className="terminal-terminals">
                <Terminal
                  terminalId={terminal.terminalId}
                  terminalLabel={terminal.label}
                  isSelected={isSelected}
                  onSelectTerminal={onSelectTerminal}
                  onAgentRuntimeStateChange={(state) => {
                    onTerminalStateChange(terminal.terminalId, state);
                  }}
                />
              </div>
            </section>

            {rightNeighbor && (
              <div
                aria-label={`Resize between ${terminal.terminalId} and ${rightNeighbor.terminalId}`}
                aria-orientation="vertical"
                className="terminal-divider"
                onKeyDown={onTerminalDividerKeyDown(terminal.terminalId, rightNeighbor.terminalId)}
                onPointerDown={onTerminalDividerPointerDown(
                  terminal.terminalId,
                  rightNeighbor.terminalId,
                )}
                role="separator"
                tabIndex={0}
              />
            )}
          </Fragment>
        );
      })}
    </main>
  );
};
