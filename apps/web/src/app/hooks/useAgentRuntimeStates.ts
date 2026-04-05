import { useEffect, useMemo, useRef, useState } from "react";

import type { AgentRuntimeState } from "@octogent/core";
import { isAgentRuntimeState } from "@octogent/core";
import { buildTerminalSocketUrl } from "../../runtime/runtimeEndpoints";
import type { TerminalView } from "../types";

export type AgentRuntimeStateInfo = {
  state: AgentRuntimeState;
  toolName?: string;
};

export const useAgentRuntimeStates = (
  columns: TerminalView,
): Map<string, AgentRuntimeStateInfo> => {
  const [stateMap, setStateMap] = useState<Map<string, AgentRuntimeStateInfo>>(new Map());
  const socketsRef = useRef<Map<string, WebSocket>>(new Map());

  // Stable key so effects only fire when the set of terminal IDs actually changes
  const terminalIdKey = useMemo(() => columns.map((c) => c.terminalId).join("\0"), [columns]);

  // Seed from REST snapshot data whenever columns change
  useEffect(() => {
    setStateMap((prev) => {
      const next = new Map(prev);
      for (const col of columns) {
        if (col.agentRuntimeState && !next.has(col.terminalId)) {
          next.set(col.terminalId, { state: col.agentRuntimeState });
        }
      }
      const activeIds = new Set(columns.map((c) => c.terminalId));
      for (const id of next.keys()) {
        if (!activeIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [terminalIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage WebSocket connections — only reacts to terminal ID set changes
  useEffect(() => {
    const activeIds = new Set(columns.map((c) => c.terminalId));
    const sockets = socketsRef.current;

    // Close sockets for removed terminals
    for (const [id, ws] of sockets) {
      if (!activeIds.has(id)) {
        ws.close();
        sockets.delete(id);
      }
    }

    // Open sockets for new terminals
    for (const id of activeIds) {
      if (sockets.has(id)) continue;

      const ws = new WebSocket(buildTerminalSocketUrl(id));
      sockets.set(id, ws);

      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          if (payload.type !== "state") return;
          if (!isAgentRuntimeState(payload.state)) return;

          const info: AgentRuntimeStateInfo = { state: payload.state };
          if (typeof payload.toolName === "string") {
            info.toolName = payload.toolName;
          }
          setStateMap((prev) => {
            const next = new Map(prev);
            next.set(id, info);
            return next;
          });
        } catch {
          // ignore non-JSON or malformed messages
        }
      });

      ws.addEventListener("close", () => {
        if (sockets.get(id) === ws) {
          sockets.delete(id);
        }
      });
    }
  }, [terminalIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up all sockets on unmount only
  useEffect(() => {
    return () => {
      for (const ws of socketsRef.current.values()) {
        ws.close();
      }
      socketsRef.current.clear();
    };
  }, []);

  return stateMap;
};
