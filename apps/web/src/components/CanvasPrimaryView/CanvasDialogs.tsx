import type { GraphNode } from "../../app/canvas/types";
import type { PendingDeleteTerminal } from "../../app/hooks/useTerminalMutations";
import type { TerminalView } from "../../app/types";
import { DeleteTentacleDialog } from "../DeleteTentacleDialog";
import { DeleteAllTerminalsDialog } from "../canvas/DeleteAllTerminalsDialog";

type CanvasDialogsProps = {
  columns: TerminalView;
  nodes: GraphNode[];
  isDeleteAllDialogOpen: boolean;
  pendingDeleteTerminal?: PendingDeleteTerminal | null | undefined;
  isDeletingTerminalId?: string | null | undefined;
  onCancelDelete?: (() => void) | undefined;
  onConfirmDelete?: (() => void) | undefined;
  setIsDeleteAllDialogOpen: (value: boolean) => void;
  setOpenTerminals: (value: Map<string, GraphNode>) => void;
  onRefreshColumns?: (() => Promise<void> | void) | undefined;
  refreshGraphData: () => void;
};

export const CanvasDialogs = ({
  columns,
  nodes,
  isDeleteAllDialogOpen,
  pendingDeleteTerminal,
  isDeletingTerminalId,
  onCancelDelete,
  onConfirmDelete,
  setIsDeleteAllDialogOpen,
  setOpenTerminals,
  onRefreshColumns,
  refreshGraphData,
}: CanvasDialogsProps) => {
  return (
    <>
      {pendingDeleteTerminal && onCancelDelete && onConfirmDelete && (
        <div className="canvas-delete-dialog">
          <DeleteTentacleDialog
            pendingDeleteTerminal={pendingDeleteTerminal}
            isDeletingTerminalId={isDeletingTerminalId ?? null}
            onCancel={onCancelDelete}
            onConfirmDelete={onConfirmDelete}
          />
        </div>
      )}

      {isDeleteAllDialogOpen && (
        <div className="canvas-delete-dialog">
          <DeleteAllTerminalsDialog
            columns={columns}
            nodes={nodes}
            onCancel={() => setIsDeleteAllDialogOpen(false)}
            onDeleted={({ hadFailures }) => {
              if (!hadFailures) {
                setIsDeleteAllDialogOpen(false);
              }
              setOpenTerminals(new Map());
              void onRefreshColumns?.();
              refreshGraphData();
            }}
          />
        </div>
      )}
    </>
  );
};
