import { X } from "lucide-react";
import { type Ref, useMemo } from "react";

import type { DeckTentacleSummary, TentacleWorkspaceMode } from "@sentiph/core";
import type { GraphNode } from "../../app/canvas/types";
import type { ConversationSessionSummary } from "../../app/types";
import { AgentGlyph } from "../AgentGlyph";
import { AGENT_COLORS } from "../deck/agentVisuals";

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function deriveVisuals(tentacle: DeckTentacleSummary) {
  return {
    color:
      tentacle.color ??
      (AGENT_COLORS[hashStr(tentacle.tentacleId) % AGENT_COLORS.length] as string),
  };
}

type CanvasTentaclePanelProps = {
  node: GraphNode;
  isFocused?: boolean;
  onClose: () => void;
  onFocus?: () => void;
  panelRef?: Ref<HTMLDivElement> | undefined;
  tentacle: DeckTentacleSummary | null;
  sessions: ConversationSessionSummary[];
  onCreateAgent?: ((tentacleId: string) => void) | undefined;
  onSpawnSwarm?: ((tentacleId: string, workspaceMode: TentacleWorkspaceMode) => void) | undefined;
  onNavigateToConversation?: ((sessionId: string) => void) | undefined;
  onRefreshTentacleData?: (() => Promise<void>) | undefined;
};

const STATUS_LABELS: Record<string, string> = {
  idle: "idle",
  active: "active",
  blocked: "blocked",
  "needs-review": "review",
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
  tentacle,
  sessions,
  onCreateAgent,
  onSpawnSwarm,
  onNavigateToConversation,
  onRefreshTentacleData,
}: CanvasTentaclePanelProps) => {
  const visuals = useMemo(() => (tentacle ? deriveVisuals(tentacle) : null), [tentacle]);

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
        <span className="detail-title">{tentacle?.displayName ?? node.label}</span>
        {tentacle && (
          <span className="detail-type-badge">
            {STATUS_LABELS[tentacle.status] ?? tentacle.status}
          </span>
        )}
        <button className="detail-close" type="button" onClick={onClose} aria-label="Close panel">
          <X size={14} />
        </button>
      </div>

      <div className="detail-content">
        <div className="detail-identity">
          {visuals && (
            <div className="detail-glyph">
              <AgentGlyph
                color={visuals.color}
                scale={2}
              />
            </div>
          )}
          <div className="detail-identity-info">
            <div className="detail-name">{tentacle?.displayName ?? node.label}</div>
            <div className="detail-row">
              <span className="detail-label">ID</span>
              <span className="detail-value detail-value--mono">{node.tentacleId}</span>
            </div>
            {tentacle?.description && (
              <div className="detail-row">
                <span className="detail-label">Description</span>
                <span className="detail-value">{tentacle.description}</span>
              </div>
            )}
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
                <button
                  type="button"
                  className="detail-action-btn"
                  onClick={() => onSpawnSwarm?.(node.tentacleId, "worktree")}
                >
                  &#x2263; Spawn Swarm (Worktrees)
                </button>
                <button
                  type="button"
                  className="detail-action-btn"
                  onClick={() => onSpawnSwarm?.(node.tentacleId, "shared")}
                >
                  &#x2263; Spawn Swarm (Normal)
                </button>
              </div>
            </div>
          )}

        {tentacle && tentacle.vaultFiles.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Vault Files</div>
            <div className="detail-labels-list">
              {tentacle.vaultFiles.map((file) => (
                <span key={file} className="detail-label-tag">
                  {file}
                </span>
              ))}
            </div>
          </div>
        )}

        {tentacle && tentacle.suggestedSkills.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Suggested Skills</div>
            <div className="detail-labels-list">
              {tentacle.suggestedSkills.map((skill) => (
                <span key={skill} className="detail-label-tag">
                  {skill}
                </span>
              ))}
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
