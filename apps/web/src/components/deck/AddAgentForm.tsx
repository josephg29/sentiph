import { useEffect, useRef, useState } from "react";

import type { DeckAvailableSkill } from "@sentiph/core";
import { AgentGlyph } from "../AgentGlyph";
import { AGENT_COLORS } from "./agentVisuals";

export type AgentAppearancePayload = Record<string, unknown>;

export type AddAgentFormProps = {
  onSubmit: (
    name: string,
    description: string,
    color: string,
    suggestedSkills: string[],
  ) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  availableSkills: DeckAvailableSkill[];
};

export const AddAgentForm = ({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  availableSkills,
}: AddAgentFormProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(
    () => AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)] as string,
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length === 0) return;
    onSubmit(
      name.trim(),
      description.trim(),
      selectedColor,
      selectedSkills,
    );
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((current) =>
      current.includes(skillName)
        ? current.filter((skill) => skill !== skillName)
        : [...current, skillName].sort((a, b) => a.localeCompare(b)),
    );
  };

  return (
    <form className="deck-add-form" onSubmit={handleSubmit}>
      <div className="deck-add-form-header">
        <button type="button" className="deck-add-form-back" onClick={onCancel}>
          ← Back
        </button>
        <span className="deck-add-form-title">New Agent</span>
      </div>

      <div className="deck-add-form-body">
        <div className="deck-add-form-preview">
          <AgentGlyph
            color={selectedColor}
            scale={2}
          />
        </div>

        <label className="deck-add-form-label">
          Name
          <input
            ref={nameRef}
            type="text"
            className="deck-add-form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Database Layer"
          />
        </label>

        <label className="deck-add-form-label">
          Description
          <textarea
            className="deck-add-form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent is responsible for..."
            rows={3}
          />
        </label>

        {availableSkills.length > 0 && (
          <div className="deck-add-form-label">
            Suggested Skills
            <div className="deck-add-form-skills">
              {availableSkills.map((skill) => {
                const checked = selectedSkills.includes(skill.name);
                return (
                  <label
                    key={`${skill.source}:${skill.name}`}
                    className="deck-add-form-skill-option"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSkill(skill.name)}
                    />
                    <span className="deck-add-form-skill-copy">
                      <span className="deck-add-form-skill-name">{skill.name}</span>
                      {skill.description && (
                        <span className="deck-add-form-skill-desc">{skill.description}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="deck-add-form-label">
          Color
          <div className="deck-add-form-colors">
            {AGENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="deck-add-form-color-swatch"
                data-selected={c === selectedColor ? "true" : "false"}
                style={{ backgroundColor: c }}
                onClick={() => setSelectedColor(c)}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
        </div>

        {error && <div className="deck-add-form-error">{error}</div>}

        <button
          type="submit"
          className="deck-add-form-submit"
          disabled={isSubmitting || name.trim().length === 0}
        >
          {isSubmitting ? "Creating..." : "Create Agent"}
        </button>
      </div>
    </form>
  );
};
