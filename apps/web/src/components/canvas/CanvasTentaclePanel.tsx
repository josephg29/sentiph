import { X } from "lucide-react";
import { type Ref, useMemo } from "react";

import type { GraphNode } from "../../app/canvas/types";
import type { ConversationSessionSummary } from "../../app/types";
import { AgentGlyph } from "../AgentGlyph";

const AGENT_COLORS = [
  "#6366f1", "#a78bfa", "#c084fc", "#e879f9",
  "#fb7185", "#f472b6", "#34d399", "#2dd4bf",
  "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8",
  "#f97316", "#fbbf24", "#a3e635", "#4ade80",
];

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function deriveColor(tentacleId: string, color: string | null | undefined): string {
  if (color) return color;
  return AGENT_COLORS[hashStr(tentacleId) % AGENT_COLORS.length] as string;
}

type CanvasTentaclePanelProps = {
  node: GraphNode;
  isFocused?: boolean;
  onClose: () => void;
  onFocus?: () => void;
  panelRef?: Ref<HTMLDivElement> | undefined;
  sessions: ConversationSessionSummary[];
  onCreateAgent?: ((tentacleId: string) => void) | undefined;
  onNavigateToConversation?: ((sessionId: string) => void) | undefined;
};

const formatTime = (isoString: string | null): string => {
  if (!isoString) return "—";
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

export const CanvasTentaclePanel = ({
  node,
  isFocused,
  onClose,
  onFocus,
  panelRef,
  sessions,
  onCreateAgent,
  onNavigateToConversation,
}: CanvasTentaclePanelProps) => {
  const color = useMemo(() => deriveColor(node.tentacleId, node.color), [node.tentacleId, node.color]);

  return (
    <div
      ref={panelRef}
      className={`detail-panel${isFocused ? " detail-panel--focused" : ""}`}
      tabIndex={-1}
      onPointerDown={() => onFocus?.()}
    >
      <div
        className="detail-panel-header"
        style={{
          background: node.color ?? "#111",
        }}
      >
        <span className="detail-title">{node.label}</span>
        <button className="detail-close" type="button" onClick={onClose} aria-label="Close panel">
          <X size={14} />
        </button>
      </div>

      <div className="detail-content">
        <div className="detail-identity">
          <div className="detail-glyph">
            <AgentGlyph
              color={color}
              scale={2}
            />
          </div>
          <div className="detail-identity-info">
            <div className="detail-name">{node.label}</div>
            <div className="detail-row">
              <span className="detail-label">ID</span>
              <span className="detail-value detail-value--mono">{node.tentacleId}</span>
            </div>
          </div>
        </div>

        {node.type !== "sentiph" && (
          <div className="detail-section">
            <div className="detail-section-title">Actions</div>
            <div className="detail-actions">
              <button
                type="button"
                className="detail-action-btn"
                onClick={() => onCreateAgent?.(node.tentacleId)}
              >
                {">_"} Create Agent
              </button>
            </div>
          </div>
        )}

        <div className="detail-section">
          <div className="detail-section-title">Sessions ({sessions.length})</div>
          {sessions.length === 0 ? (
            <div className="detail-empty">No sessions yet</div>
          ) : (
            <div className="detail-sessions">
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  type="button"
                  className="detail-session-item"
                  onClick={() => onNavigateToConversation?.(s.sessionId)}
                >
                  <span className="detail-session-preview">
                    {s.firstUserTurnPreview
                      ? s.firstUserTurnPreview.slice(0, 60)
                      : s.sessionId.slice(0, 16)}
                  </span>
                  <span className="detail-session-meta">
                    {s.turnCount} turns · {formatTime(s.lastEventAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
