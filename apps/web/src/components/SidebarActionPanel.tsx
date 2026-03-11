import type { PendingDeleteTentacle } from "../app/hooks/useTentacleMutations";
import type {
  TentacleGitStatusSnapshot,
  TentaclePullRequestSnapshot,
  TentacleView,
} from "../app/types";
import { DeleteTentacleDialog } from "./DeleteTentacleDialog";
import { TentacleGitActionsDialog } from "./TentacleGitActionsDialog";

type SidebarActionPanelProps = {
  pendingDeleteTentacle: PendingDeleteTentacle | null;
  isDeletingTentacleId: string | null;
  clearPendingDeleteTentacle: () => void;
  confirmDeleteTentacle: () => Promise<void>;
  openGitTentacleId: string | null;
  columns: TentacleView;
  openGitTentacleStatus: TentacleGitStatusSnapshot | null;
  openGitTentaclePullRequest: TentaclePullRequestSnapshot | null;
  gitCommitMessageDraft: string;
  gitDialogError: string | null;
  isGitDialogLoading: boolean;
  isGitDialogMutating: boolean;
  setGitCommitMessageDraft: (value: string) => void;
  closeTentacleGitActions: () => void;
  commitTentacleChanges: () => Promise<void>;
  commitAndPushTentacleBranch: () => Promise<void>;
  pushTentacleBranch: () => Promise<void>;
  syncTentacleBranch: () => Promise<void>;
  mergeTentaclePullRequest: () => Promise<void>;
  requestDeleteTentacle: (
    tentacleId: string,
    tentacleName: string,
    options: {
      workspaceMode: "shared" | "worktree";
      intent: "delete-tentacle" | "cleanup-worktree";
    },
  ) => void;
};

export const SidebarActionPanel = ({
  pendingDeleteTentacle,
  isDeletingTentacleId,
  clearPendingDeleteTentacle,
  confirmDeleteTentacle,
  openGitTentacleId,
  columns,
  openGitTentacleStatus,
  openGitTentaclePullRequest,
  gitCommitMessageDraft,
  gitDialogError,
  isGitDialogLoading,
  isGitDialogMutating,
  setGitCommitMessageDraft,
  closeTentacleGitActions,
  commitTentacleChanges,
  commitAndPushTentacleBranch,
  pushTentacleBranch,
  syncTentacleBranch,
  mergeTentaclePullRequest,
  requestDeleteTentacle,
}: SidebarActionPanelProps) => {
  const openGitTentacleColumn =
    openGitTentacleId !== null
      ? columns.find((column) => column.tentacleId === openGitTentacleId)
      : null;

  if (pendingDeleteTentacle) {
    return (
      <DeleteTentacleDialog
        isDeletingTentacleId={isDeletingTentacleId}
        onCancel={clearPendingDeleteTentacle}
        onConfirmDelete={() => {
          void confirmDeleteTentacle();
        }}
        pendingDeleteTentacle={pendingDeleteTentacle}
      />
    );
  }

  if (openGitTentacleColumn && openGitTentacleColumn.tentacleWorkspaceMode === "worktree") {
    return (
      <TentacleGitActionsDialog
        errorMessage={gitDialogError}
        gitCommitMessage={gitCommitMessageDraft}
        gitPullRequest={openGitTentaclePullRequest}
        gitStatus={openGitTentacleStatus}
        isLoading={isGitDialogLoading}
        isMutating={isGitDialogMutating}
        onClose={closeTentacleGitActions}
        onCommit={() => {
          void commitTentacleChanges();
        }}
        onCommitAndPush={() => {
          void commitAndPushTentacleBranch();
        }}
        onCommitMessageChange={setGitCommitMessageDraft}
        onMergePullRequest={() => {
          void mergeTentaclePullRequest();
        }}
        onPush={() => {
          void pushTentacleBranch();
        }}
        onSync={() => {
          void syncTentacleBranch();
        }}
        onCleanupWorktree={() => {
          requestDeleteTentacle(
            openGitTentacleColumn.tentacleId,
            openGitTentacleColumn.tentacleName,
            {
              workspaceMode: openGitTentacleColumn.tentacleWorkspaceMode,
              intent: "cleanup-worktree",
            },
          );
          closeTentacleGitActions();
        }}
        tentacleId={openGitTentacleColumn.tentacleId}
        tentacleName={openGitTentacleColumn.tentacleName}
      />
    );
  }

  return null;
};
