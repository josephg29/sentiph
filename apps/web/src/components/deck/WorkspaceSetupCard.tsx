import type { WorkspaceSetupSnapshot, WorkspaceSetupStepId } from "@octogent/core";
import type { RefObject } from "react";

import type { TerminalAgentProvider } from "../../app/types";
import { OctopusGlyph } from "../EmptyOctopus";
import { AGENT_PROVIDER_OPTIONS } from "./ActionCards";

type WorkspaceSetupCardProps = {
  compact?: boolean;
  workspaceSetup: WorkspaceSetupSnapshot | null;
  isLoading: boolean;
  error: string | null;
  selectedAgent: TerminalAgentProvider;
  setSelectedAgent: (agent: TerminalAgentProvider) => void;
  agentMenuOpen: boolean;
  setAgentMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  agentMenuRef: RefObject<HTMLDivElement | null>;
  onRunStep: (stepId: WorkspaceSetupStepId) => void;
  onLaunchPlanner: () => void;
  onAddManually: () => void;
  isLaunchingAgent?: boolean;
  isRunningStepId?: WorkspaceSetupStepId | null;
};

export const WorkspaceSetupCard = ({
  compact,
  workspaceSetup,
  isLoading,
  error,
  selectedAgent,
  setSelectedAgent,
  agentMenuOpen,
  setAgentMenuOpen,
  agentMenuRef,
  onRunStep,
  onLaunchPlanner,
  onAddManually,
  isLaunchingAgent,
  isRunningStepId,
}: WorkspaceSetupCardProps) => (
  <section
    className={`workspace-setup-card${compact ? " workspace-setup-card--compact" : ""}`}
    aria-label="Workspace setup"
  >
    <header className="workspace-setup-card-header">
      <div className="workspace-setup-card-glyph">
        <OctopusGlyph
          color="#d4a017"
          animation={compact ? "idle" : "walk"}
          expression="happy"
          accessory="none"
          scale={compact ? 4 : 7}
        />
      </div>
      <div className="workspace-setup-card-copy">
        <h2 className="workspace-setup-card-title">Workspace Setup</h2>
        <p className="workspace-setup-card-desc">
          Run the setup steps in order. Each step only completes after Octogent verifies the
          workspace or tool state again.
        </p>
      </div>
    </header>

    {error ? <p className="workspace-setup-card-error">{error}</p> : null}

    <div className="workspace-setup-step-list">
      {(workspaceSetup?.steps ?? []).map((step) => (
        <article key={step.id} className="workspace-setup-step" data-complete={step.complete}>
          <div className="workspace-setup-step-main">
            <div className="workspace-setup-step-title-row">
              <span className="workspace-setup-step-title">{step.title}</span>
              <span className="workspace-setup-step-state">
                {step.complete ? "Done" : step.required ? "Required" : "Optional"}
              </span>
            </div>
            <p className="workspace-setup-step-desc">{step.description}</p>
            <p className="workspace-setup-step-status">{step.statusText}</p>
            {!step.complete && step.guidance ? (
              <p className="workspace-setup-step-guidance">{step.guidance}</p>
            ) : null}
            {!step.complete && step.command ? (
              <code className="workspace-setup-step-command">{step.command}</code>
            ) : null}
          </div>
          {step.actionLabel ? (
            <button
              type="button"
              className="workspace-setup-step-action"
              disabled={isLoading || isRunningStepId === step.id}
              onClick={() => onRunStep(step.id)}
            >
              {isRunningStepId === step.id ? "..." : step.actionLabel}
            </button>
          ) : null}
        </article>
      ))}
      {isLoading && workspaceSetup === null ? (
        <p className="workspace-setup-card-loading">Loading workspace setup…</p>
      ) : null}
    </div>

    <div className="workspace-setup-card-actions">
      <div className="workspace-setup-card-actions-copy">
        <span className="workspace-setup-card-actions-title">Create tentacles</span>
        <span className="workspace-setup-card-actions-desc">
          Plan department tentacles with an agent, or create the first one manually.
        </span>
      </div>
      <div className="workspace-setup-card-actions-row">
        <div className="deck-empty-agent-picker" ref={agentMenuRef}>
          <button
            type="button"
            className="deck-empty-agent-trigger"
            aria-expanded={agentMenuOpen}
            aria-haspopup="menu"
            onClick={() => setAgentMenuOpen((current: boolean) => !current)}
          >
            {AGENT_PROVIDER_OPTIONS.find((option) => option.value === selectedAgent)?.label}
            <svg className="deck-empty-agent-chevron" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          {agentMenuOpen ? (
            <div className="deck-empty-agent-menu" role="menu">
              {AGENT_PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="deck-empty-agent-menu-item"
                  role="menuitem"
                  data-active={option.value === selectedAgent ? "true" : "false"}
                  onClick={() => {
                    setSelectedAgent(option.value);
                    setAgentMenuOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="workspace-setup-card-primary-action"
          disabled={isLaunchingAgent}
          onClick={onLaunchPlanner}
        >
          {isLaunchingAgent ? "..." : "Plan Tentacles"}
        </button>
        <button
          type="button"
          className="workspace-setup-card-secondary-action"
          onClick={onAddManually}
        >
          Add Manually
        </button>
      </div>
    </div>
  </section>
);
