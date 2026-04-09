import { useMemo } from "react";

import type { AgentRuntimeState } from "@octogent/core";
import type { TerminalView } from "../types";

export type AgentRuntimeStateInfo = {
  state: AgentRuntimeState;
  toolName?: string;
};

export const useAgentRuntimeStates = (
  columns: TerminalView,
): Map<string, AgentRuntimeStateInfo> => {
  return useMemo(() => {
    const next = new Map<string, AgentRuntimeStateInfo>();
    for (const col of columns) {
      if (!col.agentRuntimeState) {
        continue;
      }
      next.set(col.terminalId, {
        state: col.agentRuntimeState,
      });
    }
    return next;
  }, [columns]);
};
