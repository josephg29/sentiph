import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import { retainActiveTerminalEntries, retainActiveTerminalIds } from "../terminalState";
import type { TerminalView } from "../types";

type UseTerminalStateReconciliationOptions<TState> = {
  columns: TerminalView;
  setMinimizedTerminalIds: Dispatch<SetStateAction<string[]>>;
  setTerminalStates: Dispatch<SetStateAction<Record<string, TState>>>;
};

export const useTerminalStateReconciliation = <TState>({
  columns,
  setMinimizedTerminalIds,
  setTerminalStates,
}: UseTerminalStateReconciliationOptions<TState>) => {
  useEffect(() => {
    const activeTerminalIds = new Set(columns.map((entry) => entry.terminalId));
    setMinimizedTerminalIds((current) => retainActiveTerminalIds(current, activeTerminalIds));
    setTerminalStates((current) => retainActiveTerminalEntries(current, activeTerminalIds));
  }, [columns, setMinimizedTerminalIds, setTerminalStates]);
};
