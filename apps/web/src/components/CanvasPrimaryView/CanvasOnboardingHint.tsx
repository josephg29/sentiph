import { useState } from "react";

const DISMISS_KEY = "sentiph.onboarding.canvasHint";

const readDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

type CanvasOnboardingHintProps = {
  onSpawn?: () => void;
};

/**
 * First-run guidance shown on the empty canvas. The canvas is intentionally a
 * near-empty low-activity surface, so this is an additive, dismissible hint —
 * it names the start action ("New agent") and signposts the pan/zoom affordances
 * a newcomer would otherwise have to discover by trial. Dismissal persists.
 */
export const CanvasOnboardingHint = ({ onSpawn }: CanvasOnboardingHintProps) => {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) {
    return null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage failures — the hint just won't persist its dismissal.
    }
    setDismissed(true);
  };

  return (
    <div className="canvas-onboarding-hint" role="note" aria-label="Getting started">
      <div className="canvas-onboarding-hint-eyebrow">Start here</div>
      <p className="canvas-onboarding-hint-text">
        This canvas maps your running agents. Spawn your first one to boot a Claude Code terminal —
        then drag to pan and scroll to zoom.
      </p>
      <div className="canvas-onboarding-hint-actions">
        {onSpawn ? (
          <button
            type="button"
            className="canvas-onboarding-hint-cta"
            onClick={() => {
              onSpawn();
            }}
          >
            + New agent
          </button>
        ) : null}
        <button type="button" className="canvas-onboarding-hint-dismiss" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
};
