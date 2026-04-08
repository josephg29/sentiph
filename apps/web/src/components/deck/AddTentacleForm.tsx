import { useEffect, useRef, useState } from "react";

import type { OctopusAccessory, OctopusAnimation, OctopusExpression } from "../EmptyOctopus";
import { OctopusGlyph } from "../EmptyOctopus";
import { ACCESSORIES, ANIMATIONS, EXPRESSIONS, OCTOPUS_COLORS } from "./octopusVisuals";

// ─── Add tentacle form ───────────────────────────────────────────────────────

export type OctopusAppearancePayload = {
  animation: string;
  expression: string;
  accessory: string;
  hairColor: string;
};

export type AddTentacleFormProps = {
  onSubmit: (
    name: string,
    description: string,
    color: string,
    octopus: OctopusAppearancePayload,
  ) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
};

export const EXPRESSION_OPTIONS: { value: OctopusExpression; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "happy", label: "Happy" },
  { value: "angry", label: "Angry" },
  { value: "surprised", label: "Surprised" },
];

export const ACCESSORY_OPTIONS: { value: OctopusAccessory; label: string }[] = [
  { value: "none", label: "None" },
  { value: "long", label: "Long" },
  { value: "mohawk", label: "Mohawk" },
  { value: "side-sweep", label: "Side Sweep" },
  { value: "curly", label: "Curly" },
];

export const HAIR_COLORS = [
  "#4a2c0a",
  "#1a1a1a",
  "#c8a04a",
  "#e04020",
  "#f5f5f5",
  "#6b3fa0",
  "#2a6e3f",
  "#1e90ff",
];

export const AddTentacleForm = ({
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: AddTentacleFormProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(
    () => OCTOPUS_COLORS[Math.floor(Math.random() * OCTOPUS_COLORS.length)] as string,
  );
  const [selectedExpression, setSelectedExpression] = useState<OctopusExpression>(() => {
    const pick = EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)] as OctopusExpression;
    return pick;
  });
  const [selectedAccessory, setSelectedAccessory] = useState<OctopusAccessory>(() => {
    const pick = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)] as OctopusAccessory;
    return pick;
  });
  const [selectedAnimation] = useState<OctopusAnimation>(() => {
    const pick = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)] as OctopusAnimation;
    return pick;
  });
  const [selectedHairColor, setSelectedHairColor] = useState(
    () => HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)] as string,
  );
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length === 0) return;
    onSubmit(name.trim(), description.trim(), selectedColor, {
      animation: selectedAnimation,
      expression: selectedExpression,
      accessory: selectedAccessory,
      hairColor: selectedHairColor,
    });
  };

  return (
    <form className="deck-add-form" onSubmit={handleSubmit}>
      <div className="deck-add-form-header">
        <button type="button" className="deck-add-form-back" onClick={onCancel}>
          ← Back
        </button>
        <span className="deck-add-form-title">New Tentacle</span>
      </div>

      <div className="deck-add-form-body">
        <div className="deck-add-form-preview">
          <OctopusGlyph
            color={selectedColor}
            animation={selectedAnimation}
            expression={selectedExpression}
            accessory={selectedAccessory}
            hairColor={selectedHairColor}
            scale={8}
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
            placeholder="What this tentacle is responsible for..."
            rows={3}
          />
        </label>

        <div className="deck-add-form-label">
          Color
          <div className="deck-add-form-colors">
            {OCTOPUS_COLORS.map((c) => (
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

        <div className="deck-add-form-row">
          <div className="deck-add-form-label">
            Expression
            <div className="deck-add-form-chips">
              {EXPRESSION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="deck-add-form-chip"
                  data-selected={opt.value === selectedExpression ? "true" : "false"}
                  onClick={() => setSelectedExpression(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="deck-add-form-label">
            Hair Style
            <div className="deck-add-form-chips">
              {ACCESSORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="deck-add-form-chip"
                  data-selected={opt.value === selectedAccessory ? "true" : "false"}
                  onClick={() => setSelectedAccessory(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="deck-add-form-label">
            Hair Color
            <div className="deck-add-form-colors">
              {HAIR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="deck-add-form-color-swatch deck-add-form-color-swatch--small"
                  data-selected={c === selectedHairColor ? "true" : "false"}
                  style={{ backgroundColor: c }}
                  onClick={() => setSelectedHairColor(c)}
                  aria-label={`Select hair color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        {error && <div className="deck-add-form-error">{error}</div>}

        <button
          type="submit"
          className="deck-add-form-submit"
          disabled={isSubmitting || name.trim().length === 0}
        >
          {isSubmitting ? "Creating..." : "Create Tentacle"}
        </button>
      </div>
    </form>
  );
};
