import { useCallback, useEffect, useRef, useState } from "react";

import { X } from "lucide-react";
import { useTerminalSocket } from "../app/hooks/useTerminalSocket";
import { useXtermInstance } from "../app/hooks/useXtermInstance";
import { type AgentRuntimeState, AgentStateBadge } from "./AgentStateBadge";

import "xterm/css/xterm.css";

type TerminalProps = {
  terminalId: string;
  terminalLabel?: string;
  layoutVersion?: string | number;
  isSelected?: boolean;
  initialPrompt?: string;
  onSelectTerminal?: (terminalId: string) => void;
  onAgentRuntimeStateChange?: (state: AgentRuntimeState) => void;
  onTerminalRenamed?: ((terminalId: string, tentacleName: string) => void) | undefined;
  onTerminalActivity?: ((terminalId: string) => void) | undefined;
};

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
  layoutVersion,
  isSelected,
  initialPrompt,
  onSelectTerminal,
  onAgentRuntimeStateChange,
  onTerminalRenamed,
  onTerminalActivity,
}: TerminalProps) => {
  const [agentState, setAgentRuntimeState] = useState<AgentRuntimeState>("idle");
  const [isPromptBannerDismissed, setIsPromptBannerDismissed] = useState(false);
  const [displayConnectionState, setDisplayConnectionState] = useState("connecting");

  const onTerminalActivityRef = useRef(onTerminalActivity);
  const onTerminalRenamedRef = useRef(onTerminalRenamed);
  onTerminalActivityRef.current = onTerminalActivity;
  onTerminalRenamedRef.current = onTerminalRenamed;

  const rawTitle = terminalLabel && terminalLabel.length > 0 ? terminalLabel : terminalId;
  const terminalTitle = rawTitle.length > 24 ? `${rawTitle.slice(0, 24)}...` : rawTitle;

  // Forward refs that let the xterm side push input/resize to the socket
  // without the xterm setup effect depending on the (potentially fresh) socket
  // send functions, which would otherwise re-create the terminal each render.
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const sendResizeRef = useRef<(cols: number, rows: number) => void>(() => {});

  const handleData = useCallback((data: string) => {
    sendInputRef.current(data);
  }, []);
  const handleResize = useCallback((cols: number, rows: number) => {
    sendResizeRef.current(cols, rows);
  }, []);
  const handleSetupError = useCallback(() => {
    setDisplayConnectionState("fallback");
  }, []);

  const { containerRef, handleHistory, handleOutput, requestResizeSync } = useXtermInstance({
    terminalId,
    layoutVersion,
    onData: handleData,
    onResize: handleResize,
    onSetupError: handleSetupError,
  });

  const handleRename = useCallback((id: string, tentacleName: string) => {
    onTerminalRenamedRef.current?.(id, tentacleName);
  }, []);
  const handleActivity = useCallback((id: string) => {
    onTerminalActivityRef.current?.(id);
  }, []);

  const { connectionState, sendInput, sendResize, isSocketOpen } = useTerminalSocket({
    terminalId,
    onState: setAgentRuntimeState,
    onRename: handleRename,
    onActivity: handleActivity,
    onHistory: handleHistory,
    onOutput: handleOutput,
    onOpen: requestResizeSync,
  });

  sendInputRef.current = sendInput;
  sendResizeRef.current = sendResize;

  useEffect(() => {
    onAgentRuntimeStateChange?.(agentState);
  }, [agentState, onAgentRuntimeStateChange]);

  // Mirror the socket connection state into the rendered attribute. The xterm
  // setup-failure path may overwrite this with "fallback"; a later socket event
  // overwrites it again, matching the original single-state "last write wins".
  useEffect(() => {
    setDisplayConnectionState(connectionState);
  }, [connectionState]);

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
      <div className="terminal-header" data-connection-state={displayConnectionState}>
        <span className="terminal-title">{terminalTitle}</span>
        {initialPrompt && !isPromptBannerDismissed && (
          <div className="terminal-prompt-banner">
            <button
              type="button"
              className="terminal-prompt-banner-inject"
              onClick={() => {
                if (isSocketOpen()) {
                  sendInput(initialPrompt);
                }
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
              <X size={14} />
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
