import type { PendingDeleteTerminal } from "../app/hooks/useTerminalMutations";
import type {
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  TerminalView,
} from "../app/types";
import { DeleteTentacleDialog } from "./DeleteTentacleDialog";
import { TentacleGitActionsDialog } from "./TentacleGitActionsDialog";

type SidebarActionPanelProps = {
  pendingDeleteTerminal: PendingDeleteTerminal | null;
  isDeletingTerminalId: string | null;
  clearPendingDeleteTerminal: () => void;
  confirmDeleteTerminal: () => Promise<void>;
  openGitAgentId: string | null;
  columns: TerminalView;
  openGitAgentStatus: TentacleGitStatusSnapshot | null;
  openGitAgentPullRequest: TentaclePullRequestSnapshot | null;
  gitCommitMessageDraft: string;
  gitDialogError: string | null;
  isGitDialogLoading: boolean;
  isGitDialogMutating: boolean;
  setGitCommitMessageDraft: (value: string) => void;
  closeAgentGitActions: () => void;
  commitAgentChanges: () => Promise<void>;
  commitAndPushAgentBranch: () => Promise<void>;
  pushAgentBranch: () => Promise<void>;
  syncAgentBranch: () => Promise<void>;
  mergeAgentPullRequest: () => Promise<void>;
  requestDeleteTerminal: (
    tentacleId: string,
    tentacleName: string,
    options: {
      workspaceMode: "shared" | "worktree";
      intent: "delete-terminal" | "cleanup-worktree";
    },
  ) => void;
};

export const SidebarActionPanel = ({
  pendingDeleteTerminal,
  isDeletingTerminalId,
  clearPendingDeleteTerminal,
  confirmDeleteTerminal,
  openGitAgentId,
  columns,
  openGitAgentStatus,
  openGitAgentPullRequest,
  gitCommitMessageDraft,
  gitDialogError,
  isGitDialogLoading,
  isGitDialogMutating,
  setGitCommitMessageDraft,
  closeAgentGitActions,
  commitAgentChanges,
  commitAndPushAgentBranch,
  pushAgentBranch,
  syncAgentBranch,
  mergeAgentPullRequest,
  requestDeleteTerminal,
}: SidebarActionPanelProps) => {
  const openGitAgentTerminal =
    openGitAgentId !== null
      ? columns.find((terminal) => terminal.tentacleId === openGitAgentId)
      : null;

  if (pendingDeleteTerminal) {
    return (
      <DeleteTentacleDialog
        isDeletingTerminalId={isDeletingTerminalId}
        onCancel={clearPendingDeleteTerminal}
        onConfirmDelete={() => {
          void confirmDeleteTerminal();
        }}
        pendingDeleteTerminal={pendingDeleteTerminal}
      />
    );
  }

  if (openGitAgentTerminal && openGitAgentTerminal.workspaceMode === "worktree") {
    return (
      <TentacleGitActionsDialog
        errorMessage={gitDialogError}
        gitCommitMessage={gitCommitMessageDraft}
        gitPullRequest={openGitAgentPullRequest}
        gitStatus={openGitAgentStatus}
        isLoading={isGitDialogLoading}
        isMutating={isGitDialogMutating}
        onClose={closeAgentGitActions}
        onCommit={() => {
          void commitAgentChanges();
        }}
        onCommitAndPush={() => {
          void commitAndPushAgentBranch();
        }}
        onCommitMessageChange={setGitCommitMessageDraft}
        onMergePullRequest={() => {
          void mergeAgentPullRequest();
        }}
        onPush={() => {
          void pushAgentBranch();
        }}
        onSync={() => {
          void syncAgentBranch();
        }}
        onCleanupWorktree={() => {
          requestDeleteTerminal(
            openGitAgentTerminal.terminalId,
            openGitAgentTerminal.tentacleName ?? openGitAgentTerminal.tentacleId,
            {
              workspaceMode: openGitAgentTerminal.workspaceMode ?? "shared",
              intent: "cleanup-worktree",
            },
          );
          closeAgentGitActions();
        }}
        tentacleId={openGitAgentTerminal.tentacleId}
        tentacleName={openGitAgentTerminal.tentacleName ?? openGitAgentTerminal.tentacleId}
      />
    );
  }

  return null;
};
