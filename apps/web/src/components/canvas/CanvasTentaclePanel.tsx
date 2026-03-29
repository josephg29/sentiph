import { useCallback, useEffect, useMemo, useState } from "react";

import type { DeckTentacleSummary } from "@octogent/core";
import type { GraphNode } from "../../app/canvas/types";
import type { ConversationSessionSummary } from "../../app/types";
import { buildConversationsUrl, buildDeckTentaclesUrl } from "../../runtime/runtimeEndpoints";
import { normalizeConversationSessionSummary } from "../../app/normalizers";
import {
  type OctopusAccessory,
  type OctopusAnimation,
  type OctopusExpression,
  OctopusGlyph,
} from "../EmptyOctopus";

const OCTOPUS_COLORS = [
  "#ff6b2b", "#ff2d6b", "#00ffaa", "#bf5fff", "#00c8ff",
  "#ffee00", "#39ff14", "#ff4df0", "#00fff7", "#ff9500",
];
const ANIMATIONS: OctopusAnimation[] = ["sway", "walk", "jog", "bounce", "float", "swim-up"];
const EXPRESSIONS: OctopusExpression[] = ["normal", "happy", "angry", "surprised"];
const ACCESSORIES: OctopusAccessory[] = ["none", "none", "long", "mohawk", "side-sweep", "curly"];

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function deriveVisuals(tentacle: DeckTentacleSummary) {
  const rng = seededRng(hashStr(tentacle.tentacleId));
  const stored = tentacle.octopus;
  return {
    color: tentacle.color ?? (OCTOPUS_COLORS[hashStr(tentacle.tentacleId) % OCTOPUS_COLORS.length] as string),
    animation: (stored?.animation as OctopusAnimation | null) ?? (ANIMATIONS[Math.floor(rng() * ANIMATIONS.length)] as OctopusAnimation),
    expression: (stored?.expression as OctopusExpression | null) ?? (EXPRESSIONS[Math.floor(rng() * EXPRESSIONS.length)] as OctopusExpression),
    accessory: (stored?.accessory as OctopusAccessory | null) ?? (ACCESSORIES[Math.floor(rng() * ACCESSORIES.length)] as OctopusAccessory),
    hairColor: stored?.hairColor ?? undefined,
  };
}

type CanvasTentaclePanelProps = {
  node: GraphNode;
  isFocused?: boolean;
  onClose: () => void;
  onFocus?: () => void;
  onCreateAgent?: ((tentacleId: string) => void) | undefined;
  onSpawnSwarm?: ((tentacleId: string) => void) | undefined;
  onNavigateToConversation?: ((sessionId: string) => void) | undefined;
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
  onCreateAgent,
  onSpawnSwarm,
  onNavigateToConversation,
}: CanvasTentaclePanelProps) => {
  const [tentacle, setTentacle] = useState<DeckTentacleSummary | null>(null);
  const [sessions, setSessions] = useState<ConversationSessionSummary[]>([]);

  const visuals = useMemo(
    () => (tentacle ? deriveVisuals(tentacle) : null),
    [tentacle],
  );

  const fetchTentacle = useCallback(async () => {
    try {
      const response = await fetch(buildDeckTentaclesUrl(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) return;
      const match = (payload as DeckTentacleSummary[]).find(
        (t) => t.tentacleId === node.tentacleId,
      );
      if (match) setTentacle(match);
    } catch {
      // silent
    }
  }, [node.tentacleId]);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(buildConversationsUrl(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as unknown;
      const all = Array.isArray(payload)
        ? payload
            .map((entry) => normalizeConversationSessionSummary(entry))
            .filter((entry): entry is ConversationSessionSummary => entry !== null)
        : [];
      setSessions(all.filter((s) => s.tentacleId === node.tentacleId));
    } catch {
      // silent
    }
  }, [node.tentacleId]);

  useEffect(() => {
    void fetchTentacle();
    void fetchSessions();
  }, [fetchTentacle, fetchSessions]);

  const progressPct =
    tentacle && tentacle.todoTotal > 0
      ? Math.round((tentacle.todoDone / tentacle.todoTotal) * 100)
      : 0;

  return (
    <div
      className={`detail-panel${isFocused ? " detail-panel--focused" : ""}`}
      onPointerDown={() => onFocus?.()}
    >
      {/* Header */}
      <div className="detail-panel-header">
        <span className="detail-title">Tentacle Details</span>
        {tentacle && (
          <span
            className="detail-type-badge"
            style={{ background: node.color }}
          >
            {STATUS_LABELS[tentacle.status] ?? tentacle.status}
          </span>
        )}
        <button className="detail-close" type="button" onClick={onClose}>
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="detail-content">
        {/* Identity: glyph + info side by side */}
        <div className="detail-identity">
          {visuals && (
            <div className="detail-glyph">
              <OctopusGlyph
                color={visuals.color}
                animation={visuals.animation}
                expression={visuals.expression}
                accessory={visuals.accessory}
                {...(visuals.hairColor ? { hairColor: visuals.hairColor } : {})}
                scale={4}
              />
            </div>
          )}
          <div className="detail-identity-info">
            <div className="detail-row">
              <span className="detail-label">Name</span>
              <span className="detail-value">{tentacle?.displayName ?? node.label}</span>
            </div>
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

        {/* Progress section */}
        {tentacle && tentacle.todoTotal > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Progress</div>
            <div className="detail-progress">
              <div className="detail-progress-bar">
                <div
                  className="detail-progress-fill"
                  style={{ width: `${progressPct}%`, backgroundColor: node.color }}
                />
              </div>
              <span className="detail-progress-label">
                {tentacle.todoDone}/{tentacle.todoTotal}
              </span>
            </div>
            {tentacle.todoItems.length > 0 && (
              <ul className="detail-todos">
                {tentacle.todoItems.map((item) => (
                  <li
                    key={item.text}
                    className={`detail-todo${item.done ? " detail-todo--done" : ""}`}
                  >
                    <input type="checkbox" checked={item.done} readOnly />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Vault files */}
        {tentacle && tentacle.vaultFiles.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Vault Files</div>
            <div className="detail-labels-list">
              {tentacle.vaultFiles.map((file) => (
                <span key={file} className="detail-label-tag">{file}</span>
              ))}
            </div>
          </div>
        )}

        {/* Sessions section */}
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

        {/* Actions section */}
        <div className="detail-section">
          <div className="detail-section-title">Actions</div>
          <div className="detail-actions">
            <button
              type="button"
              className="detail-action-btn"
              onClick={() => onCreateAgent?.(node.tentacleId)}
            >
              &gt;_ Create Agent
            </button>
            <button
              type="button"
              className="detail-action-btn"
              onClick={() => onSpawnSwarm?.(node.tentacleId)}
            >
              &#x2263; Spawn Swarm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
