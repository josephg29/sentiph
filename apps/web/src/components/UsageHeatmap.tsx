import { useMemo, useState } from "react";

import type { UsageHeatmapDay } from "../app/hooks/useUsageHeatmapPolling";
import { ActionButton } from "./ui/ActionButton";

type UsageHeatmapProps = {
  days: UsageHeatmapDay[];
  scope: "all" | "project";
  isLoading: boolean;
  onScopeChange: (scope: "all" | "project") => void;
  onRefresh: () => void;
};

const CELL_SIZE = 13;
const CELL_GAP = 3;
const CELL_RADIUS = 2;
const WEEKS_TO_SHOW = 52;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const INTENSITY_COLORS = [
  "#161b22", // empty
  "#0e4429", // low
  "#006d32", // medium-low
  "#26a641", // medium
  "#39d353", // high
];

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
};

type HeatmapCell = {
  date: string;
  week: number;
  dayOfWeek: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  sessions: number;
  intensity: number;
};

const buildHeatmapGrid = (days: UsageHeatmapDay[]): HeatmapCell[] => {
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const today = new Date();
  const todayDow = today.getUTCDay();

  // End of grid is this Saturday (end of current week)
  const endDate = new Date(today);
  endDate.setUTCDate(today.getUTCDate() + (6 - todayDow));

  // Start is 52 weeks before end
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - WEEKS_TO_SHOW * 7 + 1);

  // Collect all token values for quantile thresholds
  const tokenValues = days.map((d) => d.totalTokens).filter((v) => v > 0);
  tokenValues.sort((a, b) => a - b);

  const getIntensity = (tokens: number): number => {
    if (tokens === 0 || tokenValues.length === 0) return 0;
    const index = tokenValues.findIndex((v) => v >= tokens);
    const position = index === -1 ? tokenValues.length : index;
    const ratio = position / tokenValues.length;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const cells: HeatmapCell[] = [];
  const cursor = new Date(startDate);
  let week = 0;

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getUTCDay();
    const dayData = dayMap.get(dateStr);

    cells.push({
      date: dateStr,
      week,
      dayOfWeek,
      totalTokens: dayData?.totalTokens ?? 0,
      inputTokens: dayData?.inputTokens ?? 0,
      outputTokens: dayData?.outputTokens ?? 0,
      cacheReadTokens: dayData?.cacheReadTokens ?? 0,
      cacheCreationTokens: dayData?.cacheCreationTokens ?? 0,
      sessions: dayData?.sessions ?? 0,
      intensity: getIntensity(dayData?.totalTokens ?? 0),
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() === 0) {
      week++;
    }
  }

  return cells;
};

const buildMonthLabels = (cells: HeatmapCell[]): { label: string; week: number }[] => {
  const labels: { label: string; week: number }[] = [];
  let lastMonth = -1;

  for (const cell of cells) {
    if (cell.dayOfWeek !== 0) continue;
    const month = new Date(cell.date).getUTCMonth();
    if (month !== lastMonth) {
      labels.push({ label: MONTH_LABELS[month]!, week: cell.week });
      lastMonth = month;
    }
  }

  return labels;
};

export const UsageHeatmap = ({
  days,
  scope,
  isLoading,
  onScopeChange,
  onRefresh,
}: UsageHeatmapProps) => {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const cells = useMemo(() => buildHeatmapGrid(days), [days]);
  const monthLabels = useMemo(() => buildMonthLabels(cells), [cells]);

  const totalTokens = useMemo(() => days.reduce((sum, d) => sum + d.totalTokens, 0), [days]);
  const totalSessions = useMemo(() => days.reduce((sum, d) => sum + d.sessions, 0), [days]);
  const activeDays = useMemo(() => days.filter((d) => d.totalTokens > 0).length, [days]);

  const dayLabelWidth = 32;
  const monthLabelHeight = 16;
  const gridWidth = WEEKS_TO_SHOW * (CELL_SIZE + CELL_GAP);
  const gridHeight = 7 * (CELL_SIZE + CELL_GAP);
  const svgWidth = dayLabelWidth + gridWidth + 8;
  const svgHeight = monthLabelHeight + gridHeight + 8;

  return (
    <section className="usage-heatmap" aria-label="Claude token usage heatmap">
      <header className="usage-heatmap-header">
        <div className="usage-heatmap-header-left">
          <h3>Claude Token Usage</h3>
          <span className="usage-heatmap-summary">
            {formatTokenCount(totalTokens)} tokens across {activeDays} days, {totalSessions}{" "}
            sessions
          </span>
        </div>
        <div className="usage-heatmap-header-actions">
          <div className="usage-heatmap-scope-toggle">
            <button
              type="button"
              className={`usage-heatmap-scope-btn${scope === "project" ? " is-active" : ""}`}
              onClick={() => onScopeChange("project")}
            >
              This project
            </button>
            <button
              type="button"
              className={`usage-heatmap-scope-btn${scope === "all" ? " is-active" : ""}`}
              onClick={() => onScopeChange("all")}
            >
              All projects
            </button>
          </div>
          <ActionButton
            aria-label="Refresh usage heatmap data"
            className="usage-heatmap-refresh"
            disabled={isLoading}
            onClick={onRefresh}
            size="dense"
            variant="accent"
          >
            {isLoading ? "Scanning..." : "Refresh"}
          </ActionButton>
        </div>
      </header>

      <div className="usage-heatmap-grid-container">
        <svg
          className="usage-heatmap-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label="Token usage heatmap grid"
        >
          {monthLabels.map(({ label, week }) => (
            <text
              key={`month-${week}`}
              x={dayLabelWidth + week * (CELL_SIZE + CELL_GAP)}
              y={monthLabelHeight - 4}
              className="usage-heatmap-month-label"
            >
              {label}
            </text>
          ))}

          {DAY_LABELS.map((label, dayIndex) =>
            label ? (
              <text
                key={`day-${dayIndex}`}
                x={dayLabelWidth - 6}
                y={monthLabelHeight + dayIndex * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2}
                className="usage-heatmap-day-label"
              >
                {label}
              </text>
            ) : null,
          )}

          {cells.map((cell) => (
            <rect
              key={cell.date}
              x={dayLabelWidth + cell.week * (CELL_SIZE + CELL_GAP)}
              y={monthLabelHeight + cell.dayOfWeek * (CELL_SIZE + CELL_GAP)}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={CELL_RADIUS}
              fill={INTENSITY_COLORS[cell.intensity]!}
              className="usage-heatmap-cell"
              onMouseEnter={() => setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
            >
              <title>
                {cell.date}: {formatTokenCount(cell.totalTokens)} tokens, {cell.sessions} sessions
              </title>
            </rect>
          ))}
        </svg>

        {hoveredCell && hoveredCell.totalTokens > 0 && (
          <div className="usage-heatmap-tooltip" aria-live="polite">
            <p className="usage-heatmap-tooltip-date">{hoveredCell.date}</p>
            <dl className="usage-heatmap-tooltip-stats">
              <div>
                <dt>Total</dt>
                <dd>{formatTokenCount(hoveredCell.totalTokens)}</dd>
              </div>
              <div>
                <dt>Input</dt>
                <dd>{formatTokenCount(hoveredCell.inputTokens)}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{formatTokenCount(hoveredCell.outputTokens)}</dd>
              </div>
              <div>
                <dt>Cache read</dt>
                <dd>{formatTokenCount(hoveredCell.cacheReadTokens)}</dd>
              </div>
              <div>
                <dt>Cache write</dt>
                <dd>{formatTokenCount(hoveredCell.cacheCreationTokens)}</dd>
              </div>
              <div>
                <dt>Sessions</dt>
                <dd>{hoveredCell.sessions}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="usage-heatmap-legend">
          <span>Less</span>
          {INTENSITY_COLORS.map((color, i) => (
            <span
              key={i}
              className="usage-heatmap-legend-cell"
              style={{ backgroundColor: color }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  );
};
