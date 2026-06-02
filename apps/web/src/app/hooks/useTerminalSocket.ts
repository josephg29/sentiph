import { useCallback, useEffect, useRef, useState } from "react";

import { type AgentRuntimeState, isAgentRuntimeState } from "../../components/AgentStateBadge";
import { buildTerminalSocketUrl } from "../../runtime/runtimeEndpoints";

type TerminalStateMessage = {
  type: "state";
  state: AgentRuntimeState;
};

type TerminalOutputMessage = {
  type: "output";
  data: string;
};

type TerminalHistoryMessage = {
  type: "history";
  data: string;
};

type TerminalRenameMessage = {
  type: "rename";
  tentacleName: string;
};

type TerminalActivityMessage = {
  type: "activity";
};

type TerminalServerMessage =
  | TerminalStateMessage
  | TerminalOutputMessage
  | TerminalHistoryMessage
  | TerminalRenameMessage
  | TerminalActivityMessage;

type UseTerminalSocketOptions = {
  terminalId: string;
  onState: (state: AgentRuntimeState) => void;
  onRename: (terminalId: string, tentacleName: string) => void;
  onActivity: (terminalId: string) => void;
  onHistory: (data: string) => void;
  onOutput: (data: string) => void;
  /**
   * Called when the socket opens, so the consumer can flush a pending resize.
   * Mirrors the original `requestResizeSync()` call inside the `open` handler.
   */
  onOpen: () => void;
};

type UseTerminalSocketResult = {
  connectionState: string;
  sendInput: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  isSocketOpen: () => boolean;
};

/**
 * Owns the terminal WebSocket lifecycle: connect, exponential-backoff
 * reconnect, and JSON message dispatch. Communicates with the xterm side via
 * the supplied callbacks (history/output/state/rename/activity) so the two
 * halves stay decoupled. The effect depends only on `terminalId`, exactly like
 * the original component, while the callbacks are read through a ref so a
 * caller passing fresh closures every render never forces a reconnect.
 */
export const useTerminalSocket = ({
  terminalId,
  onState,
  onRename,
  onActivity,
  onHistory,
  onOutput,
  onOpen,
}: UseTerminalSocketOptions): UseTerminalSocketResult => {
  const [connectionState, setConnectionState] = useState("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  const callbacksRef = useRef({
    onState,
    onRename,
    onActivity,
    onHistory,
    onOutput,
    onOpen,
  });
  callbacksRef.current = {
    onState,
    onRename,
    onActivity,
    onHistory,
    onOutput,
    onOpen,
  };

  useEffect(() => {
    let isCancelled = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let socket: WebSocket | null = null;

    const connect = () => {
      const nextSocket = new WebSocket(buildTerminalSocketUrl(terminalId));
      socket = nextSocket;
      setConnectionState("connecting");

      nextSocket.addEventListener("open", () => {
        if (isCancelled || socket !== nextSocket) {
          return;
        }
        socketRef.current = nextSocket;
        setConnectionState("connected");
        reconnectAttempts = 0;
        callbacksRef.current.onOpen();
      });

      nextSocket.addEventListener("close", () => {
        if (isCancelled || socket !== nextSocket) {
          return;
        }
        socketRef.current = null;
        setConnectionState("closed");
        // Exponential backoff (capped) so a terminal that repeatedly fails to
        // start (e.g. the OS is out of PTYs) doesn't hammer the server and spam
        // the same error every second. Resets to fast reconnect on success.
        const delay = Math.min(900 * 2 ** reconnectAttempts, 15_000);
        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, delay);
      });

      nextSocket.addEventListener("error", () => {
        if (isCancelled || socket !== nextSocket) {
          return;
        }
        setConnectionState("error");
      });

      nextSocket.addEventListener("message", (event) => {
        if (isCancelled || socket !== nextSocket) {
          return;
        }

        if (typeof event.data !== "string") {
          return;
        }

        const callbacks = callbacksRef.current;

        try {
          const payload = JSON.parse(event.data) as TerminalServerMessage;
          if (payload.type === "history" && typeof payload.data === "string") {
            callbacks.onHistory(payload.data);
            return;
          }

          if (payload.type === "output" && typeof payload.data === "string") {
            callbacks.onOutput(payload.data);
            return;
          }

          if (payload.type === "state" && isAgentRuntimeState(payload.state)) {
            callbacks.onState(payload.state);
            return;
          }

          if (payload.type === "rename" && typeof payload.tentacleName === "string") {
            callbacks.onRename(terminalId, payload.tentacleName);
            return;
          }

          if (payload.type === "activity") {
            callbacks.onActivity(terminalId);
            return;
          }
        } catch {
          callbacks.onOutput(event.data);
        }
      });
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [terminalId]);

  const isSocketOpen = useCallback(() => {
    const ws = socketRef.current;
    return ws !== null && ws.readyState === 1;
  }, []);

  const sendInput = useCallback((data: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== 1) {
      return;
    }
    ws.send(JSON.stringify({ type: "input", data }));
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== 1) {
      return;
    }
    ws.send(JSON.stringify({ type: "resize", cols, rows }));
  }, []);

  return {
    connectionState,
    sendInput,
    sendResize,
    isSocketOpen,
  };
};
