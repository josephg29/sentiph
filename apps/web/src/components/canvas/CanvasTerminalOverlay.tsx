import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GraphNode } from "../../app/canvas/types";
import { normalizeConversationSessionDetail } from "../../app/normalizers";
import type { ConversationSessionDetail, ConversationTurn, TerminalView } from "../../app/types";
import { buildConversationSessionUrl } from "../../runtime/runtimeEndpoints";
import { type AgentRuntimeState, AgentStateBadge } from "../AgentStateBadge";
import { Terminal } from "../Terminal";
import { MarkdownContent } from "../ui/MarkdownContent";

type CanvasTerminalOverlayProps = {
  node: GraphNode;
  terminals: TerminalView;
  screenX: number;
  screenY: number;
  onClose: () => void;
  onMove?: (left: number, top: number) => void;
  onResize?: (width: number, height: number) => void;
};

const renderWorkspaceLabel = (mode: string) => (mode === "worktree" ? "WORKTREE" : "MAIN");

const TranscriptTurn = ({ turn }: { turn: ConversationTurn }) => (
  <div className={`canvas-transcript-turn canvas-transcript-turn--${turn.role}`}>
    <div className="canvas-transcript-turn-role">{turn.role === "user" ? "User" : "Assistant"}</div>
    <MarkdownContent content={turn.content} className="canvas-transcript-turn-content" />
  </div>
);

const TranscriptViewer = ({ sessionId }: { sessionId: string }) => {
  const [session, setSession] = useState<ConversationSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(buildConversationSessionUrl(sessionId), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) throw new Error(`Failed to load (${response.status})`);

        const payload = normalizeConversationSessionDetail(await response.json());
        if (cancelled) return;

        if (!payload) {
          setError("Invalid conversation data");
          return;
        }

        setSession(payload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load transcript");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (isLoading) {
    return <div className="canvas-transcript-status">Loading transcript...</div>;
  }
  if (error) {
    return <div className="canvas-transcript-status canvas-transcript-status--error">{error}</div>;
  }
  if (!session || session.turns.length === 0) {
    return <div className="canvas-transcript-status">No conversation turns found.</div>;
  }

  return (
    <div className="canvas-transcript-turns">
      {session.turns.map((turn) => (
        <TranscriptTurn key={turn.turnId} turn={turn} />
      ))}
    </div>
  );
};

export const CanvasTerminalOverlay = ({
  node,
  terminals,
  screenX,
  screenY,
  onClose,
  onMove,
  onResize,
}: CanvasTerminalOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [agentState, setAgentState] = useState<AgentRuntimeState>("idle");

  // Report size changes (user resize via CSS resize handle)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !onResize) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      onResize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onResize]);

  const isActive = node.type === "active-session";

  const terminal = terminals.find((t) => t.tentacleId === node.tentacleId);
  const tentacleName = terminal?.tentacleName ?? node.tentacleId;
  const workspaceMode = terminal?.workspaceMode ?? "shared";

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: offset.x,
        origY: offset.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset],
  );

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = {
        x: drag.origX + (e.clientX - drag.startX),
        y: drag.origY + (e.clientY - drag.startY),
      };
      setOffset(next);
      onMove?.(screenX + next.x, screenY + next.y);
    },
    [screenX, screenY, onMove],
  );

  const handleHeaderPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const left = screenX + offset.x;
  const top = screenY + offset.y;

  if (isActive && node.sessionId) {
    return (
      <div
        ref={overlayRef}
        className="canvas-terminal-overlay canvas-terminal-overlay--active"
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        <div
          className="tentacle-column-header canvas-tentacle-header"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
        >
          <div className="tentacle-column-heading">
            <h2>
              <span className="tentacle-name-display">{node.label}</span>
            </h2>
          </div>
          <div />
          <div className="tentacle-header-actions">
            <AgentStateBadge state={agentState} />
            <button
              type="button"
              className="canvas-terminal-overlay-close"
              onClick={onClose}
              aria-label="Close overlay"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="terminal-terminals">
          <Terminal
            terminalId={node.sessionId}
            terminalLabel={node.label}
            onAgentRuntimeStateChange={setAgentState}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      className="canvas-terminal-overlay"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <div
        className="canvas-terminal-overlay-title"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
      >
        <span className="canvas-terminal-overlay-title-text">{node.label}</span>
        <button
          type="button"
          className="canvas-terminal-overlay-close"
          onClick={onClose}
          aria-label="Close overlay"
        >
          <X size={14} />
        </button>
      </div>
      <div className="canvas-terminal-overlay-body">
        {node.sessionId ? (
          <TranscriptViewer sessionId={node.sessionId} />
        ) : (
          <div className="canvas-transcript-status">No session data available.</div>
        )}
      </div>
    </div>
  );
};
