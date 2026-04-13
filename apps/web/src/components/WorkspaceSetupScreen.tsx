import type { WorkspaceSetupSnapshot, WorkspaceSetupStepId } from "@octogent/core";

type WorkspaceSetupScreenProps = {
  workspaceSetup: WorkspaceSetupSnapshot | null;
  isLoading: boolean;
  error: string | null;
  runningStepId: WorkspaceSetupStepId | null;
  onRunStep: (stepId: WorkspaceSetupStepId) => void;
  onContinueToDeck: () => void;
};

const canContinueToDeck = (workspaceSetup: WorkspaceSetupSnapshot | null) => {
  if (!workspaceSetup) {
    return false;
  }

  const blockingStepIds = new Set<WorkspaceSetupStepId>([
    "initialize-workspace",
    "ensure-gitignore",
  ]);

  return workspaceSetup.steps
    .filter((step) => blockingStepIds.has(step.id))
    .every((step) => step.complete);
};

const countRequiredSteps = (workspaceSetup: WorkspaceSetupSnapshot | null) =>
  (workspaceSetup?.steps ?? []).filter((step) => step.required).length;

const countCompletedSteps = (workspaceSetup: WorkspaceSetupSnapshot | null) =>
  (workspaceSetup?.steps ?? []).filter((step) => step.complete).length;

export const WorkspaceSetupScreen = ({
  workspaceSetup,
  isLoading,
  error,
  runningStepId,
  onRunStep,
  onContinueToDeck,
}: WorkspaceSetupScreenProps) => {
  const totalRequiredSteps = countRequiredSteps(workspaceSetup);
  const completedSteps = countCompletedSteps(workspaceSetup);

  return (
    <section className="workspace-setup-screen" aria-label="Workspace setup">
      <div className="workspace-setup-screen-panel">
        <div className="workspace-setup-screen-hero">
          <span className="workspace-setup-screen-kicker">FIRST RUN</span>
          <h1 className="workspace-setup-screen-title">
            Review each setup change before Octogent writes to this repository.
          </h1>
          <p className="workspace-setup-screen-copy">
            Nothing here runs silently. Each button performs one setup step, then the app re-reads
            the workspace before marking it done.
          </p>
          <div className="workspace-setup-screen-metrics" aria-label="Workspace setup progress">
            <div className="workspace-setup-screen-metric">
              <span className="workspace-setup-screen-metric-value">{completedSteps}</span>
              <span className="workspace-setup-screen-metric-label">verified steps</span>
            </div>
            <div className="workspace-setup-screen-metric">
              <span className="workspace-setup-screen-metric-value">{totalRequiredSteps}</span>
              <span className="workspace-setup-screen-metric-label">required before Deck</span>
            </div>
          </div>
          <div className="workspace-setup-screen-note">
            <span className="workspace-setup-screen-note-label">After this screen</span>
            <p className="workspace-setup-screen-note-copy">
              Continue to Deck, create tentacles, then the normal Claude Code and terminal actions
              become the next step in the flow.
            </p>
          </div>
        </div>

        <div className="workspace-setup-screen-steps">
          {error ? <p className="workspace-setup-screen-error">{error}</p> : null}
          {isLoading && workspaceSetup === null ? (
            <p className="workspace-setup-screen-loading">Loading workspace setup…</p>
          ) : null}
          {(workspaceSetup?.steps ?? []).map((step, index) => (
            <article
              key={step.id}
              className="workspace-setup-screen-step"
              data-complete={step.complete}
            >
              <div className="workspace-setup-screen-step-head">
                <div className="workspace-setup-screen-step-summary">
                  <span className="workspace-setup-screen-step-number">{index + 1}</span>
                  <div>
                    <h2 className="workspace-setup-screen-step-title">{step.title}</h2>
                    <p className="workspace-setup-screen-step-description">{step.description}</p>
                  </div>
                </div>
                <span className="workspace-setup-screen-step-state">
                  {step.complete ? "Done" : step.required ? "Required" : "Optional"}
                </span>
              </div>

              <p className="workspace-setup-screen-step-status">{step.statusText}</p>
              {!step.complete && step.guidance ? (
                <p className="workspace-setup-screen-step-guidance">{step.guidance}</p>
              ) : null}
              {!step.complete && step.command ? (
                <code className="workspace-setup-screen-step-command">{step.command}</code>
              ) : null}

              {step.actionLabel ? (
                <button
                  type="button"
                  className="workspace-setup-screen-step-action"
                  disabled={isLoading || runningStepId === step.id}
                  onClick={() => onRunStep(step.id)}
                >
                  {runningStepId === step.id ? "Working..." : step.actionLabel}
                </button>
              ) : null}
            </article>
          ))}

          <div className="workspace-setup-screen-footer">
            <div>
              <h2 className="workspace-setup-screen-footer-title">
                Next: create tentacles in Deck
              </h2>
              <p className="workspace-setup-screen-footer-copy">
                Continue after workspace initialization and `.gitignore` are verified. The Deck view
                will guide the first tentacle creation step.
              </p>
            </div>
            <button
              type="button"
              className="workspace-setup-screen-continue"
              disabled={!canContinueToDeck(workspaceSetup)}
              onClick={onContinueToDeck}
            >
              Continue to Deck
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
