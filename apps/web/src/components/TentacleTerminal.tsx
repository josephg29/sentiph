import { useEffect, useRef, useState } from "react";

import { buildTerminalSocketUrl } from "../runtime/runtimeEndpoints";
import { type CodexState, CodexStateBadge, isCodexState } from "./CodexStateBadge";
import { wheelDeltaToScrollLines } from "./terminalWheel";

import "xterm/css/xterm.css";

type TentacleTerminalProps = {
  tentacleId: string;
  onCodexStateChange?: (state: CodexState) => void;
};

type TerminalStateMessage = {
  type: "state";
  state: CodexState;
};

type TerminalOutputMessage = {
  type: "output";
  data: string;
};

type TerminalServerMessage = TerminalStateMessage | TerminalOutputMessage;
const SHOW_CURSOR_ESCAPE = "\u001b[?25h";

export const TentacleTerminal = ({ tentacleId, onCodexStateChange }: TentacleTerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connectionState, setConnectionState] = useState("connecting");
  const [codexState, setCodexState] = useState<CodexState>("idle");

  useEffect(() => {
    onCodexStateChange?.(codexState);
  }, [codexState, onCodexStateChange]);

  useEffect(() => {
    let isCancelled = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;
    let cleanupTerminal = () => {};
    let activeTerminal: {
      write: (value: string) => void;
      scrollLines: (lineCount: number) => void;
    } | null = null;

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

        if (typeof event.data !== "string") {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as TerminalServerMessage;
          if (payload.type === "output" && typeof payload.data === "string") {
            activeTerminal?.write(payload.data);
            activeTerminal?.write(SHOW_CURSOR_ESCAPE);
            return;
          }

          if (payload.type === "state" && isCodexState(payload.state)) {
            setCodexState(payload.state);
            return;
          }
        } catch {
          activeTerminal?.write(event.data);
          activeTerminal?.write(SHOW_CURSOR_ESCAPE);
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

        const rootFontSize = Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        );
        const terminalFontSize = Number.isFinite(rootFontSize)
          ? Math.max(13, Math.round(rootFontSize * 0.82))
          : 13;
        const terminalBackground =
          window
            .getComputedStyle(document.documentElement)
            .getPropertyValue("--terminal-bg")
            .trim() || "#101722";

        const terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          cursorInactiveStyle: "bar",
          cursorStyle: "bar",
          cursorWidth: 2,
          fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
          fontSize: terminalFontSize,
          theme: {
            background: terminalBackground,
            foreground: "#f0f0f0",
            cursor: "#faa32c",
            cursorAccent: terminalBackground,
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        fitAddon.fit();
        terminal.focus();
        activeTerminal = terminal;

        const wheelListenerTarget = containerRef.current;
        const viewportWheelTarget =
          wheelListenerTarget.querySelector<HTMLElement>(".xterm-viewport") ?? wheelListenerTarget;
        const onPointerDown = () => {
          terminal.focus();
          terminal.write(SHOW_CURSOR_ESCAPE);
        };
        const onWheel = (event: WheelEvent) => {
          const lines = wheelDeltaToScrollLines(event.deltaY, event.deltaMode);
          if (lines === 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          terminal.scrollLines(lines);
        };
        wheelListenerTarget.addEventListener("pointerdown", onPointerDown, {
          capture: true,
        });
        viewportWheelTarget.addEventListener("wheel", onWheel, {
          passive: false,
        });

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
          terminal.write(SHOW_CURSOR_ESCAPE);
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
        terminal.write(SHOW_CURSOR_ESCAPE);
        cleanupTerminal = () => {
          wheelListenerTarget.removeEventListener("pointerdown", onPointerDown, true);
          viewportWheelTarget.removeEventListener("wheel", onWheel);
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
        <CodexStateBadge state={codexState} />
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
