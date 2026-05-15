import type { AgentProviderStats } from "@sentiph/core";

type AgentSuccessRateChartProps = {
  byTentacleName: Record<string, AgentProviderStats>;
};

const BAR_HEIGHT = 18;
const BAR_GAP = 8;
const LABEL_WIDTH = 140;
const BAR_MAX_WIDTH = 260;
const CHART_PADDING = 12;

export const AgentSuccessRateChart = ({ byTentacleName }: AgentSuccessRateChartProps) => {
  const entries = Object.entries(byTentacleName).slice(0, 12);

  if (entries.length === 0) {
    return (
      <div className="obs-empty">
        <span>No agent runs recorded yet.</span>
      </div>
    );
  }

  const svgHeight = entries.length * (BAR_HEIGHT + BAR_GAP) + CHART_PADDING * 2 - BAR_GAP;

  return (
    <div className="obs-chart-panel">
      <h4 className="obs-chart-title">Success Rate by Agent</h4>
      <svg
        className="obs-chart-svg"
        viewBox={`0 0 ${LABEL_WIDTH + BAR_MAX_WIDTH + CHART_PADDING * 2 + 48} ${svgHeight}`}
        style={{ width: "100%", height: svgHeight }}
        aria-label="Agent success rate chart"
      >
        {entries.map(([name, stats], i) => {
          const y = CHART_PADDING + i * (BAR_HEIGHT + BAR_GAP);
          const rate = stats.runs > 0 ? stats.successCount / stats.runs : 0;
          const successW = rate * BAR_MAX_WIDTH;
          const errorW = stats.runs > 0 ? (stats.errorCount / stats.runs) * BAR_MAX_WIDTH : 0;

          const shortName = name.length > 18 ? `${name.slice(0, 17)}…` : name;
          const pct = `${Math.round(rate * 100)}%`;

          return (
            <g key={name}>
              <text
                x={LABEL_WIDTH - 4}
                y={y + BAR_HEIGHT / 2 + 4}
                textAnchor="end"
                className="obs-bar-label"
              >
                {shortName}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={BAR_MAX_WIDTH}
                height={BAR_HEIGHT}
                className="obs-bar-bg"
              />
              {successW > 0 && (
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={successW}
                  height={BAR_HEIGHT}
                  className="obs-bar-success"
                />
              )}
              {errorW > 0 && (
                <rect
                  x={LABEL_WIDTH + successW}
                  y={y}
                  width={errorW}
                  height={BAR_HEIGHT}
                  className="obs-bar-error"
                />
              )}
              <text
                x={LABEL_WIDTH + BAR_MAX_WIDTH + 6}
                y={y + BAR_HEIGHT / 2 + 4}
                className="obs-bar-pct"
              >
                {pct}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="obs-chart-legend">
        <span className="obs-legend-dot obs-legend-dot--success" />
        <span className="obs-legend-label">Success</span>
        <span className="obs-legend-dot obs-legend-dot--error" />
        <span className="obs-legend-label">Error</span>
      </div>
    </div>
  );
};
