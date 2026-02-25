type CodexStateBadgeProps = {
  state: CodexState;
};

export type CodexState = "idle" | "processing";

export const isCodexState = (value: unknown): value is CodexState =>
  value === "idle" || value === "processing";

export const CodexStateBadge = ({ state }: CodexStateBadgeProps) => (
  <span className={`pill terminal-state-badge ${state}`}>{state.toUpperCase()}</span>
);
