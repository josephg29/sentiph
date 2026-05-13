import { useState } from "react";

import type { AgentMetricsHeatmapBucket } from "@octogent/core";

type ErrorHeatmapProps = {
  buckets: AgentMetricsHeatmapBucket[];
};

const CELL_SIZE = 14;
const CELL_GAP = 2;
const CELLS_PER_ROW = 24;
const LABEL_HEIGHT = 20;

const toHourLabel = (iso: string): string => {
  const d = new Date(iso);
  const h = d.getUTCHours().toString().padStart(2, "0");
  return `${h}:00`;
};

const toDayLabel = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

const intensityToFill = (errorCount: number, maxErrors: number): string => {
  if (errorCount === 0) return "#e8e8e8";
  if (maxErrors === 0) return "#e8e8e8";
  const t = Math.min(1, errorCount / maxErrors);
  if (t < 0.25) return "#ffd6d6";
  if (t < 0.5) return "#ff9999";
  if (t < 0.75) return "#e03030";
  return "#880f1e";
};

type TooltipState = {
  x: number;
  y: number;
  bucket: AgentMetricsHeatmapBucket;
} | null;

export const ErrorHeatmap = ({ buckets }: ErrorHeatmapProps) => {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  if (buckets.length === 0) {
    return (
      <div className="obs-heatmap-panel">
        <h4 className="obs-chart-title">Error Heatmap (7d)</h4>
        <div className="obs-empty">
          <span>No activity recorded yet.</span>
        </div>
      </div>
    );
  }

  const maxErrors = Math.max(...buckets.map((b) => b.errorCount), 1);
  const rows: AgentMetricsHeatmapBucket[][] = [];
  for (let i = 0; i < buckets.length; i += CELLS_PER_ROW) {
    rows.push(buckets.slice(i, i + CELLS_PER_ROW));
  }

  const svgW = CELLS_PER_ROW * (CELL_SIZE + CELL_GAP) + 60;
  const svgH = rows.length * (CELL_SIZE + CELL_GAP) + LABEL_HEIGHT + 10;

  return (
    <div className="obs-heatmap-panel">
      <h4 className="obs-chart-title">Error Heatmap (7d, hourly)</h4>
      <div className="obs-heatmap-scroll" style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ width: Math.min(svgW, 680), height: svgH }}
          aria-label="Error heatmap"
        >
          {Array.from({ length: Math.min(CELLS_PER_ROW, 24) }).map((_, hi) => (
            <text
              key={hi}
              x={hi * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2}
              y={LABEL_HEIGHT - 4}
              className="obs-heatmap-x-label"
              textAnchor="middle"
            >
              {hi % 6 === 0 ? `${hi.toString().padStart(2, "0")}h` : ""}
            </text>
          ))}
          {rows.map((row, ri) => {
            const dayLabel = row[0] ? toDayLabel(row[0].timestamp) : "";
            return (
              <g key={ri}>
                <text
                  x={svgW - 4}
                  y={LABEL_HEIGHT + ri * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2 + 4}
                  className="obs-heatmap-y-label"
                  textAnchor="end"
                >
                  {ri % 1 === 0 ? dayLabel : ""}
                </text>
                {row.map((bucket, ci) => {
                  const x = ci * (CELL_SIZE + CELL_GAP);
                  const y = LABEL_HEIGHT + ri * (CELL_SIZE + CELL_GAP);
                  return (
                    <rect
                      key={bucket.timestamp}
                      x={x}
                      y={y}
                      width={CELL_SIZE}
                      height={CELL_SIZE}
                      fill={intensityToFill(bucket.errorCount, maxErrors)}
                      stroke="#ddd"
                      strokeWidth={0.5}
                      style={{ cursor: "crosshair" }}
                      onMouseEnter={(e) =>
                        setTooltip({ x: e.clientX, y: e.clientY, bucket })
                      }
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {tooltip && (
          <div
            className="obs-heatmap-tooltip"
            style={{ top: tooltip.y - 60, left: tooltip.x + 12 }}
          >
            <div className="obs-tooltip-time">{toHourLabel(tooltip.bucket.timestamp)}</div>
            <div className="obs-tooltip-row">
              <span>Errors</span>
              <strong>{tooltip.bucket.errorCount}</strong>
            </div>
            <div className="obs-tooltip-row">
              <span>Runs</span>
              <strong>{tooltip.bucket.runCount}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
