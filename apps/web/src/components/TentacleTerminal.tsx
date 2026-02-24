import { useEffect, useRef, useState } from "react";

import { buildTerminalSocketUrl } from "../runtime/runtimeEndpoints";

import "xterm/css/xterm.css";

type TentacleTerminalProps = {
  tentacleId: string;
};

export const TentacleTerminal = ({ tentacleId }: TentacleTerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connectionState, setConnectionState] = useState("connecting");

  useEffect(() => {
    let isCancelled = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;
    let cleanupTerminal = () => {};
    let activeTerminal: { write: (value: string) => void } | null = null;

    const connect = () => {
      const nextSocket = new WebSocket(buildTerminalSocketUrl(tentacleId));
      socket = nextSocket;
      setConnectionState("connecting");

      nextSocket.addEventListener("open", () => {
        if (isCancelled || socket !== nextSocket) {
          return;
        }
        setConnectionState("connected");
      });

      nextSocket.addEventListener("close", () => {
        if (isCancelled || socket !== nextSocket) {
          return;
        }
        setConnectionState("closed");
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 900);
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
        if (typeof event.data === "string") {
          activeTerminal?.write(event.data);
        }
      });
    };

    connect();

    if (import.meta.env.MODE === "test") {
      return () => {
        isCancelled = true;
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
        }
        socket?.close();
      };
    }

    void (async () => {
      if (!containerRef.current) {
        return;
      }

      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("xterm"),
          import("@xterm/addon-fit"),
        ]);

        if (isCancelled || !containerRef.current) {
          return;
        }

        const terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
          fontSize: 13,
          theme: {
            background: "#040404",
            foreground: "#f0f0f0",
            cursor: "#faa32c",
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        fitAddon.fit();
        activeTerminal = terminal;

        const sendResize = () => {
          if (!socket || socket.readyState !== 1) {
            return;
          }

          socket.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            }),
          );
        };

        const onDataDisposable = terminal.onData((data) => {
          if (!socket || socket.readyState !== 1) {
            return;
          }

          socket.send(
            JSON.stringify({
              type: "input",
              data,
            }),
          );
        });

        let observer: ResizeObserver | null = null;
        if ("ResizeObserver" in window) {
          observer = new ResizeObserver(() => {
            fitAddon.fit();
            sendResize();
          });
          observer.observe(containerRef.current);
        }

        sendResize();
        cleanupTerminal = () => {
          observer?.disconnect();
          onDataDisposable.dispose();
          terminal.dispose();
        };
      } catch {
        setConnectionState("fallback");
      }
    })();

    return () => {
      isCancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      cleanupTerminal();
      socket?.close();
    };
  }, [tentacleId]);

  return (
    <div className="tentacle-terminal">
      <div className="terminal-header" data-connection-state={connectionState}>
        <span className="terminal-title">terminal</span>
        <span className="terminal-connection">{connectionState}</span>
      </div>
      <div
        ref={containerRef}
        className="terminal-mount"
        data-testid={`terminal-${tentacleId}`}
        aria-label={`Terminal ${tentacleId}`}
      />
    </div>
  );
};
