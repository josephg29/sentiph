import type { AgentRunSummary } from "@sentiph/core";

type TokenUsageSummaryProps = {
  summaries: AgentRunSummary[];
  selectedTerminalId: string | null;
  onSelectTerminal: (id: string | null) => void;
};

const formatCost = (usd: number): string => {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
};

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export const TokenUsageSummary = ({
  summaries,
  selectedTerminalId,
  onSelectTerminal,
}: TokenUsageSummaryProps) => {
  const sorted = [...summaries].sort((a, b) => b.tokenCostUsd - a.tokenCostUsd).slice(0, 20);

  if (sorted.length === 0) {
    return (
      <div className="obs-empty">
        <span>No completed runs yet.</span>
      </div>
    );
  }

  return (
    <div className="obs-table-panel">
      <h4 className="obs-chart-title">Token Usage</h4>
      <div className="obs-table-scroll">
        <table className="obs-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Provider</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>In</th>
              <th>Out</th>
              <th>Cost</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.terminalId}
                className={`obs-table-row${selectedTerminalId === s.terminalId ? " is-selected" : ""}`}
                onClick={() =>
                  onSelectTerminal(selectedTerminalId === s.terminalId ? null : s.terminalId)
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelectTerminal(selectedTerminalId === s.terminalId ? null : s.terminalId);
                  }
                }}
              >
                <td className="obs-table-name">{s.tentacleName}</td>
                <td className="obs-table-mono">{s.agentProvider}</td>
                <td>
                  <span className={`obs-outcome obs-outcome--${s.outcome}`}>{s.outcome}</span>
                </td>
                <td className="obs-table-mono">{formatDuration(s.durationMs)}</td>
                <td className="obs-table-mono">{formatTokens(s.tokenIn)}</td>
                <td className="obs-table-mono">{formatTokens(s.tokenOut)}</td>
                <td className="obs-table-mono obs-table-cost">{formatCost(s.tokenCostUsd)}</td>
                <td className="obs-table-mono">{s.errorCount || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
