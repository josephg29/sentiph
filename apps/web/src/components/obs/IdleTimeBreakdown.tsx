import type { AgentRunSummary } from "@sentiph/core";

type IdleTimeBreakdownProps = {
  summaries: AgentRunSummary[];
};

const BAR_H = 16;
const BAR_GAP = 10;
const LABEL_W = 130;
const BAR_MAX_W = 200;
const PADDING = 12;

export const IdleTimeBreakdown = ({ summaries }: IdleTimeBreakdownProps) => {
  const items = [...summaries]
    .filter((s) => s.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  if (items.length === 0) {
    return (
      <div className="obs-empty">
        <span>No timing data yet.</span>
      </div>
    );
  }

  const svgH = items.length * (BAR_H + BAR_GAP) + PADDING * 2 - BAR_GAP;

  return (
    <div className="obs-chart-panel">
      <h4 className="obs-chart-title">Time Distribution</h4>
      <svg
        className="obs-chart-svg"
        viewBox={`0 0 ${LABEL_W + BAR_MAX_W + PADDING * 2 + 40} ${svgH}`}
        style={{ width: "100%", height: svgH }}
        aria-label="Agent idle time breakdown chart"
      >
        {items.map((s, i) => {
          const y = PADDING + i * (BAR_H + BAR_GAP);
          const total = Math.max(1, s.durationMs);
          const idleW = (s.idleMs / total) * BAR_MAX_W;
          const procW = (s.processingMs / total) * BAR_MAX_W;
          const otherW = Math.max(0, BAR_MAX_W - idleW - procW);
          const shortName =
            s.tentacleName.length > 16 ? `${s.tentacleName.slice(0, 15)}…` : s.tentacleName;
          const idlePct = Math.round((s.idleMs / total) * 100);

          return (
            <g key={s.terminalId}>
              <text x={LABEL_W - 4} y={y + BAR_H / 2 + 4} textAnchor="end" className="obs-bar-label">
                {shortName}
              </text>
              <rect x={LABEL_W} y={y} width={BAR_MAX_W} height={BAR_H} className="obs-bar-bg" />
              {procW > 0 && (
                <rect x={LABEL_W} y={y} width={procW} height={BAR_H} className="obs-bar-proc" />
              )}
              {idleW > 0 && (
                <rect x={LABEL_W + procW} y={y} width={idleW} height={BAR_H} className="obs-bar-idle" />
              )}
              {otherW > 0 && (
                <rect
                  x={LABEL_W + procW + idleW}
                  y={y}
                  width={otherW}
                  height={BAR_H}
                  className="obs-bar-other"
                />
              )}
              <text x={LABEL_W + BAR_MAX_W + 6} y={y + BAR_H / 2 + 4} className="obs-bar-pct">
                {idlePct}% idle
              </text>
            </g>
          );
        })}
      </svg>
      <div className="obs-chart-legend">
        <span className="obs-legend-dot obs-legend-dot--proc" />
        <span className="obs-legend-label">Processing</span>
        <span className="obs-legend-dot obs-legend-dot--idle" />
        <span className="obs-legend-label">Idle</span>
        <span className="obs-legend-dot obs-legend-dot--other" />
        <span className="obs-legend-label">Other</span>
      </div>
    </div>
  );
};
