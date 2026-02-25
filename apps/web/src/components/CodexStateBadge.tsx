import { StatusBadge } from "./ui/StatusBadge";

type CodexStateBadgeProps = {
  state: CodexState;
};

export type CodexState = "idle" | "processing";

export const isCodexState = (value: unknown): value is CodexState =>
  value === "idle" || value === "processing";

export const CodexStateBadge = ({ state }: CodexStateBadgeProps) => (
  <StatusBadge className="terminal-state-badge" label={state.toUpperCase()} tone={state} />
);
