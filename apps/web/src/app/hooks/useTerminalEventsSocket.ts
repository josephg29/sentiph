import { type TerminalSnapshot, isAgentRuntimeState } from "@sentiph/core";
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import { buildTerminalEventsSocketUrl } from "../../runtime/runtimeEndpoints";
import {
  type TerminalRuntimeStateStore,
  getTerminalRuntimeStateInfo,
  stripTerminalRuntimeState,
} from "../terminalRuntimeStateStore";
import type { TerminalView } from "../types";

type UseTerminalEventsSocketOptions = {
  refreshColumns: () => Promise<TerminalView>;
  runtimeStateStore: TerminalRuntimeStateStore;
  setTerminals: Dispatch<SetStateAction<TerminalView>>;
  setRecentlyCreatedTerminal: Dispatch<SetStateAction<TerminalView[number] | null>>;
};

// Stable column ordering — oldest-created first.
const sortTerminalSnapshots = (snapshots: TerminalView): TerminalView =>
  [...snapshots].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

/**
 * Owns the live terminal-events WebSocket: connect, reconnect-on-close, and the
 * incremental snapshot reducer that keeps the column list in sync without a full
 * refetch. A debounced fallback refresh covers `terminal-list-changed` events.
 */
export const useTerminalEventsSocket = ({
  refreshColumns,
  runtimeStateStore,
  setTerminals,
  setRecentlyCreatedTerminal,
}: UseTerminalEventsSocketOptions): void => {
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let isUnmounted = false;

    const scheduleReconnect = () => {
      if (isUnmounted || reconnectTimer !== null) {
        return;
      }
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1000);
    };

    const connect = () => {
      if (isUnmounted) {
        return;
      }
      socket = new WebSocket(buildTerminalEventsSocketUrl());
      socket.addEventListener("close", () => {
        if (!isUnmounted) {
          // Refresh once on reconnect so we don't miss events that happened while disconnected.
          void refreshColumns();
          scheduleReconnect();
        }
      });
      socket.addEventListener("error", () => {
        try {
          socket?.close();
        } catch {
          // Ignore — close listener will reconnect.
        }
      });
      attachMessageHandler(socket);
    };

    const attachMessageHandler = (ws: WebSocket) => {
      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as
            | {
                type?: unknown;
                snapshot?: TerminalSnapshot;
                terminalId?: string;
                agentRuntimeState?: string;
                toolName?: string;
              }
            | undefined;
          if (!payload || typeof payload.type !== "string") {
            return;
          }

          if (payload.type === "terminal-created" || payload.type === "terminal-updated") {
            if (!payload.snapshot) {
              return;
            }
            const runtimeState = getTerminalRuntimeStateInfo(payload.snapshot);
            runtimeStateStore.setRuntimeState(payload.snapshot.terminalId, runtimeState);
            const structuralSnapshot = stripTerminalRuntimeState(payload.snapshot);
            if (payload.type === "terminal-created") {
              setRecentlyCreatedTerminal(structuralSnapshot as TerminalView[number]);
            }
            setTerminals((current) =>
              sortTerminalSnapshots([
                ...current.filter(
                  (terminal) => terminal.terminalId !== structuralSnapshot.terminalId,
                ),
                structuralSnapshot,
              ]),
            );
            return;
          }

          if (payload.type === "terminal-state-changed") {
            if (!payload.terminalId || !isAgentRuntimeState(payload.agentRuntimeState)) {
              return;
            }
            runtimeStateStore.setRuntimeState(payload.terminalId, {
              state: payload.agentRuntimeState,
              ...(payload.toolName ? { toolName: payload.toolName } : {}),
            });
            return;
          }

          if (payload.type === "terminal-deleted") {
            if (!payload.terminalId) {
              return;
            }
            runtimeStateStore.removeTerminal(payload.terminalId);
            setTerminals((current) =>
              current.filter((terminal) => terminal.terminalId !== payload.terminalId),
            );
            return;
          }

          if (payload.type !== "terminal-list-changed") {
            return;
          }
        } catch {
          return;
        }

        if (refreshTimerRef.current !== null) {
          window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          void refreshColumns();
        }, 100);
      });
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      try {
        socket?.close();
      } catch {
        // Ignore — socket may already be closing.
      }
    };
  }, [refreshColumns, runtimeStateStore, setTerminals, setRecentlyCreatedTerminal]);
};
