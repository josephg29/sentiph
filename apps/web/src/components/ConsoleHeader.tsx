import { Check } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useClickOutside } from "../app/hooks/useClickOutside";
import type { TerminalAgentProvider } from "../app/types";
import { ActionButton } from "./ui/ActionButton";

const PROVIDER_LABELS: Record<TerminalAgentProvider, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
};

const AGENT_PROVIDER_STORAGE_KEY = "octogent:defaultAgentProvider";

const readStoredProvider = (): TerminalAgentProvider => {
  try {
    const stored = localStorage.getItem(AGENT_PROVIDER_STORAGE_KEY);
    if (stored === "codex" || stored === "claude-code") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "claude-code";
};

const storeProvider = (provider: TerminalAgentProvider) => {
  try {
    localStorage.setItem(AGENT_PROVIDER_STORAGE_KEY, provider);
  } catch {
    // ignore
  }
};

type SplitTentacleButtonProps = {
  label: string;
  ariaLabel: string;
  className: string;
  variant: "primary" | "info";
  disabled: boolean;
  isCreating: boolean;
  defaultProvider: TerminalAgentProvider;
  onProviderChange: (provider: TerminalAgentProvider) => void;
  onCreate: (provider: TerminalAgentProvider) => void;
};

const SplitTentacleButton = ({
  label,
  ariaLabel,
  className,
  variant,
  disabled,
  isCreating,
  defaultProvider,
  onProviderChange,
  onCreate,
}: SplitTentacleButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMainClick = useCallback(() => {
    onCreate(defaultProvider);
  }, [onCreate, defaultProvider]);

  const handleToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (provider: TerminalAgentProvider) => {
      onProviderChange(provider);
      storeProvider(provider);
      setIsOpen(false);
      onCreate(provider);
    },
    [onCreate, onProviderChange],
  );

  const handleDismiss = useCallback(() => setIsOpen(false), []);
  useClickOutside(containerRef, isOpen, handleDismiss);

  return (
    <div className={`split-button ${className}`} ref={containerRef}>
      <ActionButton
        aria-label={ariaLabel}
        className={`split-button-main ${className}`}
        disabled={disabled}
        onClick={handleMainClick}
        size="dense"
        variant={variant}
      >
        {isCreating ? "Creating..." : `${label} (${PROVIDER_LABELS[defaultProvider]})`}
      </ActionButton>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Choose agent provider for ${label}`}
        className={`split-button-toggle split-button-toggle--${variant}`}
        disabled={disabled}
        onClick={handleToggle}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="split-button-toggle-icon"
          viewBox="0 0 10 6"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="split-button-menu" role="menu">
          {(["codex", "claude-code"] as const).map((provider) => (
            <button
              key={provider}
              className="split-button-menu-item"
              data-active={provider === defaultProvider ? "true" : "false"}
              onClick={() => handleSelect(provider)}
              role="menuitem"
              type="button"
            >
              {PROVIDER_LABELS[provider]}
              {provider === defaultProvider && (
                <span aria-label="(default)" className="split-button-menu-check">
                  <Check size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

type ConsoleHeaderProps = {
  isAgentsSidebarVisible: boolean;
  onToggleAgentsSidebar: () => void;
  backendLivenessStatus: "live" | "offline";
  isCreatingTentacle: boolean;
  onCreateSharedTentacle: (provider: TerminalAgentProvider) => void;
  onCreateWorktreeTentacle: (provider: TerminalAgentProvider) => void;
};

export const ConsoleHeader = ({
  isAgentsSidebarVisible,
  onToggleAgentsSidebar,
  backendLivenessStatus,
  isCreatingTentacle,
  onCreateSharedTentacle,
  onCreateWorktreeTentacle,
}: ConsoleHeaderProps) => {
  const [defaultProvider, setDefaultProvider] = useState<TerminalAgentProvider>(readStoredProvider);

  return (
    <header className="chrome">
      <div className="chrome-left">
        <button
          aria-label={
            isAgentsSidebarVisible ? "Hide Active Agents sidebar" : "Show Active Agents sidebar"
          }
          className="chrome-sidebar-toggle"
          data-active={isAgentsSidebarVisible ? "true" : "false"}
          onClick={onToggleAgentsSidebar}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="chrome-sidebar-toggle-icon"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              fill="none"
              height="12"
              stroke="currentColor"
              strokeWidth="1.5"
              width="12"
              x="2"
              y="2"
            />
            <rect height="12" width="6" x="2" y="2" />
          </svg>
        </button>
        <h1>Octogent Terminal</h1>
      </div>

      <div className="chrome-right">
        <span className="console-live-indicator" data-live-state={backendLivenessStatus}>
          <span
            className="console-live-dot"
            data-live-state={backendLivenessStatus}
            aria-hidden="true"
          />
          {backendLivenessStatus === "live" ? "LIVE" : "OFFLINE"}
        </span>
        <SplitTentacleButton
          ariaLabel="Create tentacle in main codebase"
          className="chrome-create-tentacle chrome-create-tentacle--shared"
          defaultProvider={defaultProvider}
          disabled={isCreatingTentacle}
          isCreating={isCreatingTentacle}
          label="+ Main Tentacle"
          onCreate={onCreateSharedTentacle}
          onProviderChange={setDefaultProvider}
          variant="primary"
        />
        <SplitTentacleButton
          ariaLabel="Create tentacle with isolated worktree"
          className="chrome-create-tentacle chrome-create-tentacle--worktree"
          defaultProvider={defaultProvider}
          disabled={isCreatingTentacle}
          isCreating={isCreatingTentacle}
          label="+ Worktree Tentacle"
          onCreate={onCreateWorktreeTentacle}
          onProviderChange={setDefaultProvider}
          variant="info"
        />
      </div>
    </header>
  );
};
