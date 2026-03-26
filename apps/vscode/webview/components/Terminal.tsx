import { useEffect, useRef, useState } from "react";

import { addTerminalListener, webviewClient } from "../bridge/webviewClient";
import { type AgentRuntimeState, AgentStateBadge, isAgentRuntimeState } from "./AgentStateBadge";
import { wheelDeltaToScrollLines } from "./terminalWheel";

import "xterm/css/xterm.css";

type TerminalProps = {
  terminalId: string;
  terminalLabel?: string;
  isSelected?: boolean;
  initialPrompt?: string;
  onSelectTerminal?: (terminalId: string) => void;
  onAgentRuntimeStateChange?: (state: AgentRuntimeState) => void;
};

const SHOW_CURSOR_ESCAPE = "\u001b[?25h";

const PromptInjectIcon = () => (
  <svg
    aria-hidden="true"
    className="terminal-inject-icon"
    viewBox="0 0 16 16"
    width="14"
    height="14"
  >
    <path d="M2 3h12v1H2V3Zm0 3h8v1H2V6Zm0 3h6v1H2V9Zm9 0l3 2.5L11 14v-5Z" fill="currentColor" />
  </svg>
);

export const Terminal = ({
  terminalId,
  terminalLabel,
  isSelected,
  initialPrompt,
  onSelectTerminal,
  onAgentRuntimeStateChange,
}: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connectionState, setConnectionState] = useState("connecting");
  const [agentState, setAgentRuntimeState] = useState<AgentRuntimeState>("idle");
  const [isPromptBannerDismissed, setIsPromptBannerDismissed] = useState(false);
  const terminalTitle = terminalLabel && terminalLabel.length > 0 ? terminalLabel : terminalId;

  useEffect(() => {
    onAgentRuntimeStateChange?.(agentState);
  }, [agentState, onAgentRuntimeStateChange]);

  useEffect(() => {
    let isCancelled = false;
    let cleanupTerminal = () => {};
    let activeTerminal: {
      write: (value: string) => void;
      scrollLines: (lineCount: number) => void;
      clear: () => void;
      cols: number;
      rows: number;
    } | null = null;
    let pendingHistoryData: string | null = null;
    const pendingOutputChunks: string[] = [];

    const removeListener = addTerminalListener({
      onOutput(id, data) {
        if (id !== terminalId) return;
        if (activeTerminal) {
          activeTerminal.write(data);
          activeTerminal.write(SHOW_CURSOR_ESCAPE);
        } else {
          pendingOutputChunks.push(data);
        }
      },
      onHistory(id, data) {
        if (id !== terminalId) return;
        if (activeTerminal) {
          activeTerminal.clear();
          activeTerminal.write(data);
          activeTerminal.write(SHOW_CURSOR_ESCAPE);
        } else {
          pendingHistoryData = data;
          pendingOutputChunks.length = 0;
        }
      },
      onState(id, state) {
        if (id !== terminalId) return;
        if (isAgentRuntimeState(state)) {
          setAgentRuntimeState(state);
        }
      },
    });

    setConnectionState("connected");

    void (async () => {
      if (!containerRef.current) return;

      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("xterm"),
          import("@xterm/addon-fit"),
        ]);

        if (isCancelled || !containerRef.current) return;

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

        if (pendingHistoryData !== null) {
          terminal.clear();
          terminal.write(pendingHistoryData);
          pendingHistoryData = null;
        }
        if (pendingOutputChunks.length > 0) {
          for (const chunk of pendingOutputChunks) {
            terminal.write(chunk);
          }
          pendingOutputChunks.length = 0;
        }
        terminal.write(SHOW_CURSOR_ESCAPE);

        const wheelListenerTarget = containerRef.current;
        const viewportWheelTarget =
          wheelListenerTarget.querySelector<HTMLElement>(".xterm-viewport") ?? wheelListenerTarget;
        const onPointerDown = () => {
          terminal.focus();
          terminal.write(SHOW_CURSOR_ESCAPE);
        };
        const onWheel = (event: WheelEvent) => {
          const lines = wheelDeltaToScrollLines(event.deltaY, event.deltaMode);
          if (lines === 0) return;
          event.preventDefault();
          event.stopPropagation();
          terminal.scrollLines(lines);
        };
        wheelListenerTarget.addEventListener("pointerdown", onPointerDown, { capture: true });
        viewportWheelTarget.addEventListener("wheel", onWheel, { passive: false });

        let resizeDebounceTimer: number | null = null;
        let lastSentCols = -1;
        let lastSentRows = -1;

        const sendResize = () => {
          if (terminal.cols === lastSentCols && terminal.rows === lastSentRows) return;
          webviewClient.sendTerminalResize(terminalId, terminal.cols, terminal.rows);
          lastSentCols = terminal.cols;
          lastSentRows = terminal.rows;
        };

        const scheduleResizeSync = () => {
          if (resizeDebounceTimer !== null) window.clearTimeout(resizeDebounceTimer);
          resizeDebounceTimer = window.setTimeout(() => {
            resizeDebounceTimer = null;
            sendResize();
          }, 60);
        };

        const onDataDisposable = terminal.onData((data) => {
          terminal.write(SHOW_CURSOR_ESCAPE);
          webviewClient.sendTerminalInput(terminalId, data);
        });

        let observer: ResizeObserver | null = null;
        if ("ResizeObserver" in window) {
          observer = new ResizeObserver(() => {
            fitAddon.fit();
            scheduleResizeSync();
          });
          observer.observe(containerRef.current);
        }

        scheduleResizeSync();
        terminal.write(SHOW_CURSOR_ESCAPE);
        cleanupTerminal = () => {
          wheelListenerTarget.removeEventListener("pointerdown", onPointerDown, true);
          viewportWheelTarget.removeEventListener("wheel", onWheel);
          if (resizeDebounceTimer !== null) window.clearTimeout(resizeDebounceTimer);
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
      removeListener();
      cleanupTerminal();
    };
  }, [terminalId]);

  return (
    <div
      className={`terminal-pane${isSelected ? " terminal-pane--selected" : ""}`}
      data-selected={isSelected ? "true" : "false"}
      onFocusCapture={() => {
        onSelectTerminal?.(terminalId);
      }}
      onPointerDownCapture={() => {
        onSelectTerminal?.(terminalId);
      }}
    >
      <div className="terminal-header" data-connection-state={connectionState}>
        <span className="terminal-title">{terminalTitle}</span>
        {initialPrompt && !isPromptBannerDismissed && (
          <div className="terminal-prompt-banner">
            <button
              type="button"
              className="terminal-prompt-banner-inject"
              onClick={() => {
                webviewClient.sendTerminalInput(terminalId, initialPrompt);
                setIsPromptBannerDismissed(true);
              }}
              title={initialPrompt}
            >
              <PromptInjectIcon />
              <span className="terminal-prompt-banner-text">
                {initialPrompt.length > 60 ? `${initialPrompt.slice(0, 60)}...` : initialPrompt}
              </span>
            </button>
            <button
              type="button"
              className="terminal-prompt-banner-close"
              aria-label="Dismiss prompt"
              onClick={() => {
                setIsPromptBannerDismissed(true);
              }}
            >
              &times;
            </button>
          </div>
        )}
        <div className="terminal-header-actions">
          <AgentStateBadge state={agentState} />
        </div>
      </div>
      <div
        ref={containerRef}
        className="terminal-mount"
        data-testid={`terminal-${terminalId}`}
        aria-label={`Terminal ${terminalId}`}
      />
    </div>
  );
};
