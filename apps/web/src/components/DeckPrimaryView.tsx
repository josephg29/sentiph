import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DeckTentacleSummary } from "@octogent/core";
import { buildDeckTentaclesUrl, buildDeckVaultFileUrl } from "../runtime/runtimeEndpoints";
import {
  type OctopusAccessory,
  type OctopusAnimation,
  type OctopusExpression,
  OctopusGlyph,
} from "./EmptyOctopus";
import { MarkdownContent } from "./ui/MarkdownContent";

// ─── Octopus visual derivation (seeded from tentacle id) ────────────────────

const OCTOPUS_COLORS = [
  "#d4a017",
  "#e05555",
  "#4ec9b0",
  "#c586c0",
  "#569cd6",
  "#ce9178",
  "#6a9955",
  "#d16969",
  "#dcdcaa",
  "#9cdcfe",
];

const ANIMATIONS: OctopusAnimation[] = ["sway", "walk", "jog", "bounce", "float", "swim-up"];
const EXPRESSIONS: OctopusExpression[] = ["normal", "happy", "sleepy", "angry", "surprised"];
const ACCESSORIES: OctopusAccessory[] = ["none", "none", "long", "mohawk", "side-sweep", "curly"];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type OctopusVisuals = {
  color: string;
  animation: OctopusAnimation;
  expression: OctopusExpression;
  accessory: OctopusAccessory;
};

function deriveOctopusVisuals(tentacleId: string, colorOverride: string | null): OctopusVisuals {
  const rng = seededRandom(hashString(tentacleId));
  return {
    color:
      colorOverride ?? (OCTOPUS_COLORS[hashString(tentacleId) % OCTOPUS_COLORS.length] as string),
    animation: ANIMATIONS[Math.floor(rng() * ANIMATIONS.length)] as OctopusAnimation,
    expression: EXPRESSIONS[Math.floor(rng() * EXPRESSIONS.length)] as OctopusExpression,
    accessory: ACCESSORIES[Math.floor(rng() * ACCESSORIES.length)] as OctopusAccessory,
  };
}

// ─── Status styling ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DeckTentacleSummary["status"], string> = {
  idle: "idle",
  active: "active",
  blocked: "blocked",
  "needs-review": "review",
};

// ─── Components ──────────────────────────────────────────────────────────────

const TodoList = ({ items }: { items: { text: string; done: boolean }[] }) => {
  const lastDoneIndex = items.findLastIndex((item) => item.done);
  const scrollRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <ul className="deck-pod-todos">
      {items.map((item, i) => (
        <li
          key={item.text}
          ref={i === lastDoneIndex ? scrollRef : undefined}
          className={`deck-pod-todo-item${item.done ? " deck-pod-todo-item--done" : ""}`}
        >
          <input type="checkbox" checked={item.done} readOnly className="deck-pod-todo-checkbox" />
          {item.text}
        </li>
      ))}
    </ul>
  );
};

type TentaclePodProps = {
  tentacle: DeckTentacleSummary;
  visuals: OctopusVisuals;
  isFocused: boolean;
  activeFileName?: string | undefined;
  onVaultFileClick?: (fileName: string) => void;
  onClose?: () => void;
};

const TentaclePod = ({
  tentacle,
  visuals,
  isFocused,
  activeFileName,
  onVaultFileClick,
  onClose,
}: TentaclePodProps) => {
  const progressPct =
    tentacle.todoTotal > 0 ? Math.round((tentacle.todoDone / tentacle.todoTotal) * 100) : 0;

  return (
    <article
      className={`deck-pod${isFocused ? " deck-pod--focused" : ""}`}
      data-status={tentacle.status}
      style={{ borderColor: visuals.color }}
    >
      <header className="deck-pod-header">
        {isFocused && (
          <button type="button" className="deck-pod-btn deck-pod-btn--secondary" onClick={onClose}>
            ← Back
          </button>
        )}
        <button type="button" className="deck-pod-btn">
          Spawn
        </button>
        <button type="button" className="deck-pod-btn">
          Vault
        </button>
        <button type="button" className="deck-pod-btn deck-pod-btn--secondary">
          Edit
        </button>
      </header>

      <div className="deck-pod-body">
        <span className={`deck-pod-status deck-pod-status--${tentacle.status}`}>
          {STATUS_LABELS[tentacle.status]}
        </span>
        <div className="deck-pod-identity">
          <div className="deck-pod-octopus-col">
            <div className="deck-pod-octopus">
              <OctopusGlyph
                color={visuals.color}
                animation={visuals.animation}
                expression={visuals.expression}
                accessory={visuals.accessory}
                scale={5}
              />
            </div>
          </div>
          <div className="deck-pod-identity-text">
            <span className="deck-pod-name">{tentacle.displayName}</span>
            <span className="deck-pod-description">{tentacle.description}</span>
          </div>
        </div>

        <div className="deck-pod-details">
          {tentacle.todoTotal > 0 && (
            <div className="deck-pod-progress">
              <div className="deck-pod-progress-bar">
                <div
                  className="deck-pod-progress-fill"
                  style={{ width: `${progressPct}%`, backgroundColor: visuals.color }}
                />
              </div>
              <span
                className="deck-pod-progress-label"
                style={{ backgroundColor: `${visuals.color}22`, color: visuals.color }}
              >
                {tentacle.todoDone}/{tentacle.todoTotal} done
              </span>
            </div>
          )}

          {tentacle.todoItems.length > 0 && <TodoList items={tentacle.todoItems} />}

          {tentacle.vaultFiles.length > 0 && (
            <div className="deck-pod-vault">
              <span className="deck-pod-vault-label">vault</span>
              <div className="deck-pod-vault-files">
                {tentacle.vaultFiles.map((file) => (
                  <button
                    key={file}
                    type="button"
                    className="deck-pod-vault-file"
                    aria-current={activeFileName === file ? "true" : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      onVaultFileClick?.(file);
                    }}
                  >
                    {file}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

// ─── Main view ───────────────────────────────────────────────────────────────

type FocusState = {
  tentacleId: string;
  fileName: string;
};

export const DeckPrimaryView = () => {
  const [tentacles, setTentacles] = useState<DeckTentacleSummary[]>([]);
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [vaultContent, setVaultContent] = useState<string | null>(null);
  const [loadingVault, setLoadingVault] = useState(false);

  // Fetch tentacle list on mount
  useEffect(() => {
    let cancelled = false;
    const fetchTentacles = async () => {
      try {
        const response = await fetch(buildDeckTentaclesUrl(), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!cancelled) setTentacles(data);
      } catch {
        // silently ignore fetch errors
      }
    };
    void fetchTentacles();
    return () => {
      cancelled = true;
    };
  }, []);

  // Precompute visuals for all tentacles
  const visualsMap = useMemo(() => {
    const map = new Map<string, OctopusVisuals>();
    for (const t of tentacles) {
      map.set(t.tentacleId, deriveOctopusVisuals(t.tentacleId, t.color));
    }
    return map;
  }, [tentacles]);

  // Fetch vault file content when focus changes
  useEffect(() => {
    if (!focus) {
      setVaultContent(null);
      return;
    }

    let cancelled = false;
    setLoadingVault(true);
    const fetchVault = async () => {
      try {
        const response = await fetch(buildDeckVaultFileUrl(focus.tentacleId, focus.fileName), {
          headers: { Accept: "text/markdown" },
        });
        if (cancelled) return;
        if (!response.ok) {
          setVaultContent(null);
          setLoadingVault(false);
          return;
        }
        const text = await response.text();
        if (!cancelled) {
          setVaultContent(text);
          setLoadingVault(false);
        }
      } catch {
        if (!cancelled) {
          setVaultContent(null);
          setLoadingVault(false);
        }
      }
    };
    void fetchVault();
    return () => {
      cancelled = true;
    };
  }, [focus]);

  const handleVaultFileClick = useCallback((tentacleId: string, fileName: string) => {
    setFocus({ tentacleId, fileName });
  }, []);

  const handleClose = useCallback(() => {
    setFocus(null);
  }, []);

  const focusedTentacle = focus ? tentacles.find((t) => t.tentacleId === focus.tentacleId) : null;

  const mode = focus ? "detail" : "grid";

  if (tentacles.length === 0) {
    return (
      <section className="deck-view" data-mode="grid" aria-label="Deck">
        <div className="deck-pods-container">
          <div className="deck-empty-state">
            No tentacles yet. Create a folder in <code>.octogent/tentacles/</code> with a{" "}
            <code>tentacle.json</code> to get started.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="deck-view" data-mode={mode} aria-label="Deck">
      <div className="deck-pods-container">
        {tentacles.map((t) => {
          const isThis = focus?.tentacleId === t.tentacleId;
          return (
            <div
              key={t.tentacleId}
              className="deck-pod-slot"
              data-pod-role={isThis ? "focused" : focus ? "other" : "idle"}
            >
              <TentaclePod
                tentacle={t}
                visuals={visualsMap.get(t.tentacleId) as OctopusVisuals}
                isFocused={isThis}
                activeFileName={isThis ? focus?.fileName : undefined}
                onVaultFileClick={(fileName) =>
                  isThis
                    ? setFocus({ tentacleId: t.tentacleId, fileName })
                    : handleVaultFileClick(t.tentacleId, fileName)
                }
                onClose={handleClose}
              />
            </div>
          );
        })}
      </div>

      <div className="deck-detail-main">
        {focusedTentacle && focus && (
          <>
            <header className="deck-detail-main-header">
              <span className="deck-detail-main-path">
                {focusedTentacle.displayName} / <strong>{focus.fileName}</strong>
              </span>
            </header>
            <div className="deck-detail-main-content" key={`${focus.tentacleId}/${focus.fileName}`}>
              {loadingVault ? (
                <span className="deck-detail-loading">Loading…</span>
              ) : vaultContent !== null ? (
                <MarkdownContent content={vaultContent} className="deck-detail-markdown" />
              ) : (
                <span className="deck-detail-loading">File not found.</span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
