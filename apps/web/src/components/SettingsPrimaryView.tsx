import {
  TENTACLE_COMPLETION_SOUND_OPTIONS,
  type TentacleCompletionSoundId,
} from "../app/notificationSounds";
import { ActionButton } from "./ui/ActionButton";

type SettingsPrimaryViewProps = {
  tentacleCompletionSound: TentacleCompletionSoundId;
  onTentacleCompletionSoundChange: (soundId: TentacleCompletionSoundId) => void;
  onPreviewTentacleCompletionSound: (soundId: TentacleCompletionSoundId) => void;
};

export const SettingsPrimaryView = ({
  tentacleCompletionSound,
  onTentacleCompletionSoundChange,
  onPreviewTentacleCompletionSound,
}: SettingsPrimaryViewProps) => (
  <section className="settings-view" aria-label="Settings primary view">
    <section className="settings-panel" aria-label="Completion notification settings">
      <header className="settings-panel-header">
        <h2>Tentacle completion sound</h2>
        <p>Play a notification when a tentacle moves from processing to idle.</p>
      </header>

      <div
        className="settings-sound-picker"
        role="radiogroup"
        aria-label="Tentacle completion notification sound"
      >
        {TENTACLE_COMPLETION_SOUND_OPTIONS.map((option) => (
          <button
            aria-checked={tentacleCompletionSound === option.id}
            className="settings-sound-option"
            data-active={tentacleCompletionSound === option.id ? "true" : "false"}
            key={option.id}
            onClick={() => {
              onTentacleCompletionSoundChange(option.id);
              onPreviewTentacleCompletionSound(option.id);
            }}
            role="radio"
            type="button"
          >
            <span className="settings-sound-option-label">{option.label}</span>
            <span className="settings-sound-option-description">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="settings-panel-actions">
        <ActionButton
          aria-label="Preview selected completion sound"
          className="settings-sound-preview"
          onClick={() => {
            onPreviewTentacleCompletionSound(tentacleCompletionSound);
          }}
          size="dense"
          variant="accent"
        >
          Preview
        </ActionButton>
        <span className="settings-saved-pill">Saved to workspace</span>
      </div>
    </section>
  </section>
);
