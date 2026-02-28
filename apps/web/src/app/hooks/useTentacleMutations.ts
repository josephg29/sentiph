import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { buildTentacleRenameUrl, buildTentaclesUrl } from "../../runtime/runtimeEndpoints";
import type { TentacleView, TentacleWorkspaceMode } from "../types";

type PendingDeleteTentacle = {
  tentacleId: string;
  tentacleName: string;
};

type UseTentacleMutationsOptions = {
  readColumns: () => Promise<TentacleView>;
  setColumns: Dispatch<SetStateAction<TentacleView>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setMinimizedTentacleIds: Dispatch<SetStateAction<string[]>>;
};

type UseTentacleMutationsResult = {
  editingTentacleId: string | null;
  tentacleNameDraft: string;
  isCreatingTentacle: boolean;
  isDeletingTentacleId: string | null;
  pendingDeleteTentacle: PendingDeleteTentacle | null;
  setTentacleNameDraft: Dispatch<SetStateAction<string>>;
  setEditingTentacleId: Dispatch<SetStateAction<string | null>>;
  beginTentacleNameEdit: (tentacleId: string, currentTentacleName: string) => void;
  submitTentacleRename: (tentacleId: string, currentTentacleName: string) => Promise<void>;
  createTentacle: (workspaceMode: TentacleWorkspaceMode) => Promise<void>;
  requestDeleteTentacle: (tentacleId: string, tentacleName: string) => void;
  confirmDeleteTentacle: () => Promise<void>;
  clearPendingDeleteTentacle: () => void;
  cancelTentacleRename: () => void;
};

export const useTentacleMutations = ({
  readColumns,
  setColumns,
  setLoadError,
  setMinimizedTentacleIds,
}: UseTentacleMutationsOptions): UseTentacleMutationsResult => {
  const [editingTentacleId, setEditingTentacleId] = useState<string | null>(null);
  const [tentacleNameDraft, setTentacleNameDraft] = useState("");
  const [isCreatingTentacle, setIsCreatingTentacle] = useState(false);
  const [isDeletingTentacleId, setIsDeletingTentacleId] = useState<string | null>(null);
  const [pendingDeleteTentacle, setPendingDeleteTentacle] = useState<PendingDeleteTentacle | null>(
    null,
  );
  const cancelTentacleNameSubmitRef = useRef(false);

  const beginTentacleNameEdit = useCallback(
    (tentacleId: string, currentTentacleName: string) => {
      setLoadError(null);
      setEditingTentacleId(tentacleId);
      setTentacleNameDraft(currentTentacleName);
    },
    [setLoadError],
  );

  const submitTentacleRename = useCallback(
    async (tentacleId: string, currentTentacleName: string) => {
      if (cancelTentacleNameSubmitRef.current) {
        cancelTentacleNameSubmitRef.current = false;
        return;
      }

      const trimmedName = tentacleNameDraft.trim();
      if (trimmedName.length === 0) {
        setLoadError("Tentacle name cannot be empty.");
        return;
      }

      if (trimmedName === currentTentacleName) {
        setEditingTentacleId(null);
        return;
      }

      try {
        setLoadError(null);
        const response = await fetch(buildTentacleRenameUrl(tentacleId), {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmedName }),
        });

        if (!response.ok) {
          throw new Error(`Unable to rename tentacle (${response.status})`);
        }

        const nextColumns = await readColumns();
        setColumns(nextColumns);
        setEditingTentacleId(null);
      } catch {
        setLoadError("Unable to rename tentacle.");
      }
    },
    [readColumns, setColumns, setLoadError, tentacleNameDraft],
  );

  const createTentacle = useCallback(
    async (workspaceMode: TentacleWorkspaceMode) => {
      try {
        setIsCreatingTentacle(true);
        setLoadError(null);
        const response = await fetch(buildTentaclesUrl(), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ workspaceMode }),
        });

        if (!response.ok) {
          throw new Error(`Unable to create tentacle (${response.status})`);
        }

        const createdSnapshot = (await response.json()) as {
          tentacleId?: unknown;
          tentacleName?: unknown;
        };
        const nextColumns = await readColumns();
        setColumns(nextColumns);

        const createdTentacleId =
          typeof createdSnapshot.tentacleId === "string" ? createdSnapshot.tentacleId : null;
        if (!createdTentacleId) {
          return;
        }

        const createdColumn = nextColumns.find((column) => column.tentacleId === createdTentacleId);
        const createdTentacleName =
          createdColumn?.tentacleName ??
          (typeof createdSnapshot.tentacleName === "string"
            ? createdSnapshot.tentacleName
            : createdTentacleId);
        setMinimizedTentacleIds((current) =>
          current.filter((tentacleId) => tentacleId !== createdTentacleId),
        );
        beginTentacleNameEdit(createdTentacleId, createdTentacleName);
      } catch {
        setLoadError("Unable to create a new tentacle.");
      } finally {
        setIsCreatingTentacle(false);
      }
    },
    [beginTentacleNameEdit, readColumns, setColumns, setLoadError, setMinimizedTentacleIds],
  );

  const requestDeleteTentacle = useCallback(
    (tentacleId: string, tentacleName: string) => {
      setLoadError(null);
      setPendingDeleteTentacle({ tentacleId, tentacleName });
    },
    [setLoadError],
  );

  const confirmDeleteTentacle = useCallback(async () => {
    if (!pendingDeleteTentacle) {
      return;
    }

    const { tentacleId } = pendingDeleteTentacle;
    try {
      setLoadError(null);
      setIsDeletingTentacleId(tentacleId);
      const response = await fetch(buildTentacleRenameUrl(tentacleId), {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to delete tentacle (${response.status})`);
      }

      if (editingTentacleId === tentacleId) {
        setEditingTentacleId(null);
        setTentacleNameDraft("");
      }
      setMinimizedTentacleIds((current) =>
        current.filter((currentTentacleId) => currentTentacleId !== tentacleId),
      );

      const nextColumns = await readColumns();
      setColumns(nextColumns);
      setPendingDeleteTentacle(null);
    } catch {
      setLoadError("Unable to delete tentacle.");
    } finally {
      setIsDeletingTentacleId(null);
    }
  }, [
    editingTentacleId,
    pendingDeleteTentacle,
    readColumns,
    setColumns,
    setLoadError,
    setMinimizedTentacleIds,
  ]);

  const clearPendingDeleteTentacle = useCallback(() => {
    setPendingDeleteTentacle(null);
  }, []);

  const cancelTentacleRename = useCallback(() => {
    cancelTentacleNameSubmitRef.current = true;
    setEditingTentacleId(null);
    setTentacleNameDraft("");
  }, []);

  return {
    editingTentacleId,
    tentacleNameDraft,
    isCreatingTentacle,
    isDeletingTentacleId,
    pendingDeleteTentacle,
    setTentacleNameDraft,
    setEditingTentacleId,
    beginTentacleNameEdit,
    submitTentacleRename,
    createTentacle,
    requestDeleteTentacle,
    confirmDeleteTentacle,
    clearPendingDeleteTentacle,
    cancelTentacleRename,
  };
};
