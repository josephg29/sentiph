import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type { TerminalView } from "../types";

type UseTerminalNameInputFocusOptions = {
  columns: TerminalView;
  editingTerminalId: string | null;
  setEditingTerminalId: Dispatch<SetStateAction<string | null>>;
  terminalNameInputRef: RefObject<HTMLInputElement | null>;
};

export const useTerminalNameInputFocus = ({
  columns,
  editingTerminalId,
  setEditingTerminalId,
  terminalNameInputRef,
}: UseTerminalNameInputFocusOptions) => {
  useEffect(() => {
    if (!editingTerminalId) {
      return;
    }

    if (!columns.some((entry) => entry.terminalId === editingTerminalId)) {
      setEditingTerminalId(null);
      return;
    }

    const input = terminalNameInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, [columns, editingTerminalId, setEditingTerminalId, terminalNameInputRef]);
};
