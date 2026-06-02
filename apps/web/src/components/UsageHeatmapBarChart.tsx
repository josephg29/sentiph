import { useMemo } from "react";

import {
  BAR_GAP_RATIO,
  TOP_PAD,
  X_LABEL_HEIGHT,
  Y_AXIS_WIDTH,
  buildTrendPath,
  buildYTicks,
  formatDateLabel,
  formatTokenCount,
} from "./UsageHeatmap.helpers";
import type { BarData } from "./UsageHeatmap.types";

/* ── Tooltip ─────────────────────────────────────────── */

type ChartTooltipProps = {
  bar: BarData;
  x: number;
  y: number;
  containerWidth: number;
};

export const ChartTooltip = ({ bar, x, y, containerWidth }: ChartTooltipProps) => {
  const isRightHalf = x > containerWidth / 2;
  return (
    <div
      className="usage-heatmap-tooltip"
      aria-live="polite"
      style={
        isRightHalf
          ? { right: `${containerWidth - x + 12}px`, top: `${y + 12}px` }
          : { left: `${x + 12}px`, top: `${y + 12}px` }
      }
    >
      <p className="usage-heatmap-tooltip-date">{formatDateLabel(bar.date)}</p>
      <dl className="usage-heatmap-tooltip-stats">
        <div>
          <dt>Total</dt>
          <dd>{formatTokenCount(bar.totalTokens)}</dd>
        </div>
        {bar.segments.map((seg) => (
          <div key={seg.label}>
            <dt>
              <span className="usage-chart-legend-dot" style={{ backgroundColor: seg.color }} />
              {seg.label}
            </dt>
            <dd>{formatTokenCount(seg.tokens)}</dd>
          </div>
        ))}
        <div>
          <dt>Sessions</dt>
          <dd>{bar.sessions}</dd>
        </div>
      </dl>
    </div>
  );
};

/* ── Bar chart view ─────────────────────────────────── */

type BarChartViewProps = {
  bars: BarData[];
  maxTokens: number;
  containerWidth: number;
  containerHeight: number;
  hoveredBar: BarData | null;
  setHoveredBar: (bar: BarData | null) => void;
};

export const BarChartView = ({
  bars,
  maxTokens,
  containerWidth,
  containerHeight,
  hoveredBar,
  setHoveredBar,
}: BarChartViewProps) => {
  const chartAreaWidth = containerWidth - Y_AXIS_WIDTH;
  const barCount = bars.length || 1;
  const barSlotWidth = chartAreaWidth / barCount;
  const barWidth = barSlotWidth * (1 - BAR_GAP_RATIO);
  const barGap = barSlotWidth * BAR_GAP_RATIO;
  const chartHeight = Math.max(60, containerHeight - X_LABEL_HEIGHT - TOP_PAD);
  const svgHeight = TOP_PAD + chartHeight + X_LABEL_HEIGHT;

  const yTicks = useMemo(() => buildYTicks(maxTokens), [maxTokens]);
  const xLabelStep = Math.max(1, Math.ceil(barCount / Math.floor(chartAreaWidth / 60)));

  const trendPath = useMemo(
    () => buildTrendPath(bars, maxTokens, chartHeight, Y_AXIS_WIDTH, TOP_PAD, barSlotWidth),
    [bars, maxTokens, chartHeight, barSlotWidth],
  );

  return (
    <svg
      className="usage-chart-svg"
      viewBox={`0 0 ${containerWidth} ${svgHeight}`}
      role="img"
      aria-label="Token usage bar chart"
    >
      {yTicks.map((tick) => {
        const y =
          TOP_PAD + chartHeight - (maxTokens > 0 ? (tick.value / maxTokens) * chartHeight : 0);
        return (
          <g key={tick.value}>
            <line
              x1={Y_AXIS_WIDTH}
              y1={y}
              x2={containerWidth}
              y2={y}
              className="usage-chart-grid-line"
            />
            <text x={Y_AXIS_WIDTH - 6} y={y + 3.5} className="usage-chart-y-label">
              {tick.label}
            </text>
          </g>
        );
      })}

      {bars.map((bar, i) => {
        const x = Y_AXIS_WIDTH + i * barSlotWidth + barGap / 2;
        let yOffset = TOP_PAD + chartHeight;

        return (
          <g
            key={bar.date}
            onMouseEnter={() => setHoveredBar(bar)}
            onMouseLeave={() => setHoveredBar(null)}
            className="usage-chart-bar-group"
          >
            <rect
              x={x}
              y={TOP_PAD}
              width={barWidth}
              height={chartHeight}
              fill="transparent"
              className="usage-chart-bar-hit"
            />
            {bar.segments.map((seg) => {
              const segHeight = maxTokens > 0 ? (seg.tokens / maxTokens) * chartHeight : 0;
              yOffset -= segHeight;
              return (
                <rect
                  key={seg.label}
                  x={x}
                  y={yOffset}
                  width={barWidth}
                  height={Math.max(0.5, segHeight)}
                  fill={seg.color}
                  rx={1}
                />
              );
            })}
          </g>
        );
      })}

      {bars.map((bar, i) => {
        if (i % xLabelStep !== 0) return null;
        const x = Y_AXIS_WIDTH + i * barSlotWidth + barSlotWidth / 2;
        return (
          <text
            key={`label-${bar.date}`}
            x={x}
            y={TOP_PAD + chartHeight + X_LABEL_HEIGHT - 2}
            className="usage-chart-x-label"
          >
            {formatDateLabel(bar.date)}
          </text>
        );
      })}

      {trendPath && (
        <path
          d={trendPath}
          className="usage-chart-trend-line"
          fill="none"
          stroke="rgba(215, 166, 34, 0.55)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
};
