import { useCallback, useEffect, useRef } from "react";

import type { CodexState } from "../../components/CodexStateBadge";
import {
  buildTentacleCompletionSoundDataUrl,
  type TentacleCompletionSoundId,
} from "../notificationSounds";

const createCompletionAudio = (soundId: TentacleCompletionSoundId): HTMLAudioElement | null => {
  if (soundId === "silent" || typeof Audio === "undefined") {
    return null;
  }

  if (import.meta.env.MODE === "test" && !("mock" in Audio)) {
    return null;
  }

  const source = buildTentacleCompletionSoundDataUrl(soundId);
  if (!source) {
    return null;
  }

  const audio = new Audio(source);
  audio.preload = "auto";
  return audio;
};

export const useTentacleCompletionNotification = (
  tentacleStates: Record<string, CodexState>,
  selectedSound: TentacleCompletionSoundId,
) => {
  const previousTentacleStatesRef = useRef<Record<string, CodexState>>({});
  const audioCacheRef = useRef<Partial<Record<TentacleCompletionSoundId, HTMLAudioElement | null>>>(
    {},
  );

  const playCompletionSound = useCallback((soundId: TentacleCompletionSoundId) => {
    if (soundId === "silent") {
      return;
    }

    if (audioCacheRef.current[soundId] === undefined) {
      audioCacheRef.current[soundId] = createCompletionAudio(soundId);
    }

    const audio = audioCacheRef.current[soundId];
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    try {
      const playResult = audio.play();
      if (typeof playResult?.catch === "function") {
        void playResult.catch(() => {
          // Browsers can block untrusted audio playback; ignore and keep UI responsive.
        });
      }
    } catch {
      // Some environments throw synchronously for media playback; ignore.
    }
  }, []);

  useEffect(() => {
    const previousTentacleStates = previousTentacleStatesRef.current;
    const shouldPlayCompletionSound = Object.entries(tentacleStates).some(
      ([tentacleId, state]) =>
        previousTentacleStates[tentacleId] === "processing" && state === "idle",
    );
    previousTentacleStatesRef.current = tentacleStates;

    if (!shouldPlayCompletionSound) {
      return;
    }

    playCompletionSound(selectedSound);
  }, [playCompletionSound, selectedSound, tentacleStates]);

  const playCompletionSoundPreview = useCallback(
    (soundId?: TentacleCompletionSoundId) => {
      playCompletionSound(soundId ?? selectedSound);
    },
    [playCompletionSound, selectedSound],
  );

  return {
    playCompletionSoundPreview,
  };
};
