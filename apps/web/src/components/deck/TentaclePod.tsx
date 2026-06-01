import { useEffect, useState } from "react";

import type { DeckAvailableSkill, DeckTentacleSummary } from "@sentiph/core";
import { AgentGlyph } from "../AgentGlyph";
import type { AgentVisuals } from "./agentVisuals";

const STATUS_LABELS: Record<DeckTentacleSummary["status"], string> = {
  idle: "idle",
  active: "active",
  blocked: "blocked",
  "needs-review": "review",
};

export type TentaclePodProps = {
  tentacle: DeckTentacleSummary;
  visuals: AgentVisuals;
  isFocused: boolean;
  activeFileName?: string | undefined;
  onVaultFileClick?: (fileName: string) => void;
  onVaultBrowse?: () => void;
  onClose?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean | undefined;
  availableSkills: DeckAvailableSkill[];
  isSavingSkills?: boolean | undefined;
  onSaveSuggestedSkills?:
    | ((tentacleId: string, suggestedSkills: string[]) => Promise<boolean>)
    | undefined;
};

export const TentaclePod = ({
  tentacle,
  visuals,
  isFocused,
  activeFileName,
  onVaultFileClick,
  onVaultBrowse,
  onClose,
  onDelete,
  isDeleting,
  availableSkills,
  isSavingSkills,
  onSaveSuggestedSkills,
}: TentaclePodProps) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isEditingSkills, setIsEditingSkills] = useState(false);
  const [draftSkills, setDraftSkills] = useState<string[]>(tentacle.suggestedSkills);

  useEffect(() => {
    setDraftSkills(tentacle.suggestedSkills);
  }, [tentacle.suggestedSkills]);

  const availableSkillNames = availableSkills.map((skill) => skill.name);
  const skillNames = [...new Set([...availableSkillNames, ...draftSkills])].sort((a, b) =>
    a.localeCompare(b),
  );

  const toggleSkill = (skillName: string) => {
    setDraftSkills((current) =>
      current.includes(skillName)
        ? current.filter((skill) => skill !== skillName)
        : [...current, skillName].sort((a, b) => a.localeCompare(b)),
    );
  };

  const handleSaveSkills = async () => {
    const saved = await onSaveSuggestedSkills?.(tentacle.tentacleId, draftSkills);
    if (saved) {
      setIsEditingSkills(false);
    }
  };

  return (
    <article
      className={`deck-pod${isFocused ? " deck-pod--focused" : ""}`}
      data-status={tentacle.status}
      style={{ borderColor: "var(--accent-primary)" }}
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
        <button
          type="button"
          className="deck-pod-btn"
          onClick={() => {
            setDraftSkills(tentacle.suggestedSkills);
            setIsEditingSkills((current) => !current);
          }}
        >
          Skills
        </button>
        <button type="button" className="deck-pod-btn" onClick={() => onVaultBrowse?.()}>
          Vault
        </button>
        {confirmingDelete ? (
          <>
            <button
              type="button"
              className="deck-pod-btn deck-pod-btn--danger"
              disabled={isDeleting}
              onClick={() => onDelete?.()}
            >
              {isDeleting ? "..." : "Confirm Delete"}
            </button>
            <button
              type="button"
              className="deck-pod-btn deck-pod-btn--secondary"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="deck-pod-btn deck-pod-btn--delete"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete tentacle"
          >
            <svg className="deck-pod-btn-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M5.5 1.5h5M2 4h12M6 7v5M10 7v5M3.5 4l.75 9.5a1 1 0 001 .9h5.5a1 1 0 001-.9L12.5 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </header>

      <div className="deck-pod-body">
        <span className={`deck-pod-status deck-pod-status--${tentacle.status}`}>
          {STATUS_LABELS[tentacle.status]}
        </span>
        <div className="deck-pod-identity">
          <div className="deck-pod-agent-col">
            <div className="deck-pod-agent">
              <AgentGlyph
                color={visuals.color}
                scale={1.5}
              />
            </div>
          </div>
          <div className="deck-pod-identity-text">
            <span className="deck-pod-name">{tentacle.displayName}</span>
            <span className="deck-pod-description">{tentacle.description}</span>
          </div>
        </div>

        <div className="deck-pod-details">
          {isEditingSkills && (
            <div className="deck-pod-skills-editor">
              {skillNames.length === 0 ? (
                <span className="deck-pod-skills-empty">No Claude Code skills found.</span>
              ) : (
                <div className="deck-pod-skills-options">
                  {skillNames.map((skillName) => {
                    const skill = availableSkills.find((entry) => entry.name === skillName);
                    return (
                      <label key={skillName} className="deck-pod-skill-option">
                        <input
                          type="checkbox"
                          checked={draftSkills.includes(skillName)}
                          onChange={() => toggleSkill(skillName)}
                        />
                        <span className="deck-pod-skill-copy">
                          <span className="deck-pod-skill-name">{skillName}</span>
                          {skill?.description && (
                            <span className="deck-pod-skill-desc">{skill.description}</span>
                          )}
                          {!skill && (
                            <span className="deck-pod-skill-desc">
                              Stored on this tentacle, but not available right now.
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="deck-pod-skills-actions">
                <button
                  type="button"
                  className="deck-pod-btn deck-pod-btn--secondary"
                  onClick={() => {
                    setDraftSkills(tentacle.suggestedSkills);
                    setIsEditingSkills(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="deck-pod-btn"
                  disabled={Boolean(isSavingSkills)}
                  onClick={() => void handleSaveSkills()}
                >
                  {isSavingSkills ? "Saving..." : "Save Skills"}
                </button>
              </div>
            </div>
          )}

          {tentacle.suggestedSkills.length > 0 && (
            <div className="deck-pod-vault">
              <span className="deck-pod-vault-label">skills</span>
              <div className="deck-pod-vault-files">
                {tentacle.suggestedSkills.map((skill) => (
                  <span key={skill} className="deck-pod-vault-file">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

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
