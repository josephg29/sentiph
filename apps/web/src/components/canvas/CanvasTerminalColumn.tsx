import { Minus, X } from "lucide-react";
import { type KeyboardEvent, type Ref, useCallback, useRef, useState } from "react";

import type { GraphNode } from "../../app/canvas/types";
import type { TerminalView } from "../../app/types";
import { type AgentRuntimeState, AgentStateBadge } from "../AgentStateBadge";
import { Terminal } from "../Terminal";

type CanvasTerminalColumnProps = {
  node: GraphNode;
  terminals: TerminalView;
  layoutVersion?: string | number;
  isFocused?: boolean;
  onMinimize: () => void;
  onClose: () => void;
  onFocus?: () => void;
  panelRef?: Ref<HTMLElement> | undefined;
  onTerminalRenamed?: ((terminalId: string, tentacleName: string) => void) | undefined;
  onTerminalActivity?: ((terminalId: string) => void) | undefined;
};

export const CanvasTerminalColumn = ({
  node,
  terminals,
  layoutVersion,
  isFocused,
  onMinimize,
  onClose,
  onFocus,
  panelRef,
  onTerminalRenamed,
  onTerminalActivity,
}: CanvasTerminalColumnProps) => {
  const [agentState, setAgentState] = useState<AgentRuntimeState>("idle");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const cancelRef = useRef(false);

  const terminal = terminals.find((t) => t.terminalId === node.sessionId);
  const rawName = terminal?.tentacleName ?? node.tentacleId;
  const displayName = rawName.length > 24 ? `${rawName.slice(0, 24)}...` : rawName;

  const handleFocus = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  const beginEdit = useCallback(() => {
    cancelRef.current = false;
    setNameDraft(rawName);
    setIsEditingName(true);
  }, [rawName]);

  const submitRename = useCallback(async () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setIsEditingName(false);
      return;
    }
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === rawName || !node.sessionId) {
      setIsEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/terminals/${encodeURIComponent(node.sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onTerminalRenamed?.(node.sessionId, trimmed);
      }
    } finally {
      setIsEditingName(false);
    }
  }, [nameDraft, node.sessionId, onTerminalRenamed, rawName]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void submitRename();
      } else if (e.key === "Escape") {
        cancelRef.current = true;
        setIsEditingName(false);
      }
    },
    [submitRename],
  );

  if (!node.sessionId) return null;

  return (
    <section
      ref={panelRef}
      className={`canvas-terminal-column${isFocused ? " canvas-terminal-column--focused" : ""}`}
      tabIndex={-1}
      onPointerDown={handleFocus}
      onFocusCapture={handleFocus}
    >
      <div className="canvas-terminal-column-header">
        <div className="canvas-terminal-column-heading">
          <h2>
            {isEditingName ? (
              <input
                autoFocus
                className="canvas-terminal-column-name-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => { void submitRename(); }}
                onKeyDown={handleKeyDown}
                aria-label="Rename terminal"
              />
            ) : (
              <button
                type="button"
                className="canvas-terminal-column-name canvas-terminal-column-name--editable"
                onClick={beginEdit}
                title="Click to rename"
              >
                {displayName}
              </button>
            )}
          </h2>
        </div>
        <div className="canvas-terminal-column-actions">
          <AgentStateBadge state={agentState} />
          <button
            type="button"
            className="canvas-terminal-column-minimize"
            onClick={onMinimize}
            aria-label="Minimize terminal panel"
            title="Minimize terminal panel"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="canvas-terminal-column-close"
            onClick={onClose}
            aria-label="Close terminal session"
            title="Close terminal session"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="canvas-terminal-column-body">
        <Terminal
          terminalId={node.sessionId}
          terminalLabel={node.label}
          {...(layoutVersion === undefined ? {} : { layoutVersion })}
          onAgentRuntimeStateChange={setAgentState}
          {...(onTerminalRenamed ? { onTerminalRenamed } : {})}
          {...(onTerminalActivity ? { onTerminalActivity } : {})}
        />
      </div>
    </section>
  );
};
