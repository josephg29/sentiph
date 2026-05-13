import { useState } from "react";

import {
  useMetricsAggregatePolling,
  useMetricsEvents,
  useMetricsHeatmapPolling,
  useMetricsSummariesPolling,
} from "../app/hooks/useMetricsPolling";
import { AgentAuditTrail } from "./obs/AgentAuditTrail";
import { AgentSuccessRateChart } from "./obs/AgentSuccessRateChart";
import { ErrorHeatmap } from "./obs/ErrorHeatmap";
import { IdleTimeBreakdown } from "./obs/IdleTimeBreakdown";
import { TokenUsageSummary } from "./obs/TokenUsageSummary";

type ObservabilityPrimaryViewProps = {
  enabled?: boolean;
};

const formatRate = (rate: number): string => `${Math.round(rate * 100)}%`;
const formatCost = (usd: number): string =>
  usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`;
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
};

export const ObservabilityPrimaryView = ({ enabled = true }: ObservabilityPrimaryViewProps) => {
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  const { aggregate } = useMetricsAggregatePolling(enabled);
  const { summaries } = useMetricsSummariesPolling(enabled);
  const { heatmap } = useMetricsHeatmapPolling(7, enabled);
  const { events, isLoadingEvents } = useMetricsEvents(selectedTerminalId);

  const selectedSummary = selectedTerminalId
    ? summaries.find((s) => s.terminalId === selectedTerminalId) ?? null
    : null;

  return (
    <section className="obs-view" aria-label="Observability primary view">
      <header className="obs-header">
        <h2 className="obs-heading">Observability</h2>
        <dl className="obs-summary-cards">
          <div className="obs-card">
            <dt>Total Runs</dt>
            <dd>{aggregate?.totalRuns ?? 0}</dd>
          </div>
          <div className="obs-card">
            <dt>Success Rate</dt>
            <dd>{aggregate ? formatRate(aggregate.successRate) : "—"}</dd>
          </div>
          <div className="obs-card">
            <dt>Total Cost</dt>
            <dd>{aggregate ? formatCost(aggregate.totalTokenCostUsd) : "—"}</dd>
          </div>
          <div className="obs-card">
            <dt>Avg Duration</dt>
            <dd>{aggregate ? formatDuration(aggregate.avgDurationMs) : "—"}</dd>
          </div>
          <div className="obs-card">
            <dt>Errors</dt>
            <dd className={aggregate && aggregate.errorCount > 0 ? "obs-card-dd--error" : ""}>
              {aggregate?.errorCount ?? 0}
            </dd>
          </div>
        </dl>
      </header>

      <div className="obs-body">
        <div className="obs-row obs-row--heatmap">
          <ErrorHeatmap buckets={heatmap} />
        </div>

        <div className="obs-row obs-row--charts">
          <AgentSuccessRateChart byTentacleName={aggregate?.byTentacleName ?? {}} />
          <IdleTimeBreakdown summaries={summaries} />
        </div>

        <div className="obs-row obs-row--table">
          <TokenUsageSummary
            summaries={summaries}
            selectedTerminalId={selectedTerminalId}
            onSelectTerminal={setSelectedTerminalId}
          />
        </div>

        <div className="obs-row obs-row--trail">
          <AgentAuditTrail
            terminalId={selectedTerminalId}
            tentacleName={selectedSummary?.tentacleName ?? ""}
            events={events}
            isLoading={isLoadingEvents}
          />
        </div>
      </div>
    </section>
  );
};
