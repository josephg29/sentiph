import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CELL_GAP,
  CELL_RADIUS,
  DAY_LABELS,
  INTENSITY_COLORS,
  WEEKS_TO_SHOW,
  buildHeatmapGrid,
  buildMonthLabels,
} from "./UsageHeatmap.helpers";
import type { BarData } from "./UsageHeatmap.types";

/* ── Panel size hook ─────────────────────────────────── */

type PanelSize = {
  ref: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
};

export const usePanelSize = (): PanelSize => {
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(200);
  const ref = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    if (ref.current) {
      setWidth(ref.current.clientWidth);
      setHeight(ref.current.clientHeight);
    }
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [measure]);

  return { ref, width, height };
};

/* ── Heatmap view ───────────────────────────────────── */

type HeatmapViewProps = {
  bars: BarData[];
  containerWidth: number;
  containerHeight: number;
  hoveredBar: BarData | null;
  setHoveredBar: (bar: BarData | null) => void;
};

export const HeatmapView = ({
  bars,
  containerWidth,
  containerHeight,
  hoveredBar,
  setHoveredBar,
}: HeatmapViewProps) => {
  const cells = useMemo(() => buildHeatmapGrid(bars), [bars]);
  const monthLabels = useMemo(() => buildMonthLabels(cells), [cells]);

  const dayLabelWidth = 32;
  const monthLabelHeight = 16;
  const availableHeight = containerHeight - monthLabelHeight - 8;
  const availableWidth = containerWidth - dayLabelWidth - 8;
  const cellSize = Math.max(
    8,
    Math.min(
      Math.floor((availableHeight - 6 * CELL_GAP) / 7),
      Math.floor((availableWidth - (WEEKS_TO_SHOW - 1) * CELL_GAP) / WEEKS_TO_SHOW),
    ),
  );
  const gridWidth = WEEKS_TO_SHOW * (cellSize + CELL_GAP);
  const gridHeight = 7 * (cellSize + CELL_GAP);
  const svgWidth = dayLabelWidth + gridWidth + 8;
  const svgHeight = monthLabelHeight + gridHeight + 8;

  return (
    <svg
      className="usage-chart-svg usage-chart-svg--heatmap"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width={svgWidth}
      height={svgHeight}
      role="img"
      aria-label="Token usage heatmap"
    >
      {monthLabels.map(({ label, week }) => (
        <text
          key={`month-${week}`}
          x={dayLabelWidth + week * (cellSize + CELL_GAP)}
          y={monthLabelHeight - 4}
          className="usage-heatmap-month-label"
        >
          {label}
        </text>
      ))}

      {DAY_LABELS.map((label, dayIndex) =>
        label ? (
          <text
            key={label}
            x={dayLabelWidth - 6}
            y={monthLabelHeight + dayIndex * (cellSize + CELL_GAP) + cellSize - 2}
            className="usage-heatmap-day-label"
          >
            {label}
          </text>
        ) : null,
      )}

      {cells.map((cell) => (
        <rect
          key={cell.date}
          x={dayLabelWidth + cell.week * (cellSize + CELL_GAP)}
          y={monthLabelHeight + cell.dayOfWeek * (cellSize + CELL_GAP)}
          width={cellSize}
          height={cellSize}
          rx={CELL_RADIUS}
          fill={INTENSITY_COLORS[cell.intensity] ?? INTENSITY_COLORS[0] ?? "transparent"}
          className="usage-heatmap-cell"
          onMouseEnter={() => {
            if (cell.bar) setHoveredBar(cell.bar);
          }}
          onMouseLeave={() => setHoveredBar(null)}
        />
      ))}
    </svg>
  );
};
