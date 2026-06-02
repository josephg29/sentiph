import type { UsageDayEntry } from "../app/hooks/useUsageHeatmapPolling";
import type { BarData, BarSegmentMode, HeatmapCell } from "./UsageHeatmap.types";

/* ── Bar chart layout constants ─────────────────────── */
export const Y_AXIS_WIDTH = 52;
export const X_LABEL_HEIGHT = 18;
export const TOP_PAD = 6;
export const BAR_GAP_RATIO = 0.3;

/* ── Heatmap layout constants ───────────────────────── */
export const CELL_GAP = 3;
export const CELL_RADIUS = 2;

const SEGMENT_COLORS = [
  "#ff5722",
  "#ffa726",
  "#ffffff",
  "#ffcc02",
  "#e64a19",
  "#ffb74d",
  "#f5f5f5",
  "#ff8a65",
  "#ffd54f",
  "#ff7043",
  "#ffe082",
  "#ffab91",
];

export const INTENSITY_COLORS = ["transparent", "#3d2008", "#6b3a0e", "#b5611a", "#d7a622"];

export const WEEKS_TO_SHOW = 26;

export const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

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

export const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
};

export const formatDateLabel = (date: string): string => {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const buildColorMap = (keys: string[]): Map<string, string> =>
  new Map(
    keys.map((k, i) => [
      k,
      SEGMENT_COLORS[i % SEGMENT_COLORS.length] ?? SEGMENT_COLORS[0] ?? "#ffffff",
    ]),
  );

export const buildBars = (
  days: UsageDayEntry[],
  keys: string[],
  mode: BarSegmentMode,
): BarData[] => {
  const colorMap = buildColorMap(keys);
  return days.map((day) => {
    const slices = mode === "model" ? day.models : day.projects;
    return {
      date: day.date,
      totalTokens: day.totalTokens,
      sessions: day.sessions,
      segments: slices.map((s) => ({
        label: s.key,
        tokens: s.tokens,
        color: colorMap.get(s.key) ?? "#555",
      })),
    };
  });
};

export const buildYTicks = (maxTokens: number): { value: number; label: string }[] => {
  if (maxTokens === 0) return [];
  const ticks: { value: number; label: string }[] = [];
  const step = maxTokens / 4;
  for (let i = 0; i <= 4; i++) {
    const value = step * i;
    ticks.push({ value, label: formatTokenCount(Math.round(value)) });
  }
  return ticks;
};

export const buildTrendPath = (
  bars: BarData[],
  maxTokens: number,
  chartHeight: number,
  yAxisWidth: number,
  topPad: number,
  barSlotWidth: number,
): string => {
  if (bars.length < 2 || maxTokens === 0) return "";

  const LIFT = 8;
  const points = bars.map((bar, i) => ({
    x: yAxisWidth + i * barSlotWidth + barSlotWidth / 2,
    y: Math.max(topPad, topPad + chartHeight - (bar.totalTokens / maxTokens) * chartHeight - LIFT),
  }));

  if (points.length === 2) {
    const [firstPoint, secondPoint] = points;
    if (!firstPoint || !secondPoint) return "";
    return `M${firstPoint.x},${firstPoint.y}L${secondPoint.x},${secondPoint.y}`;
  }

  const [firstPoint] = points;
  if (!firstPoint) return "";

  let d = `M${firstPoint.x},${firstPoint.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    if (!p0 || !p1 || !p2 || !p3) continue;

    const cp1x = p1.x + (p2.x - p0.x) / 10;
    const cp1y = Math.max(topPad, p1.y + (p2.y - p0.y) / 10);
    const cp2x = p2.x - (p3.x - p1.x) / 10;
    const cp2y = Math.max(topPad, p2.y - (p3.y - p1.y) / 10);

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
};

export const buildHeatmapGrid = (bars: BarData[]): HeatmapCell[] => {
  const barMap = new Map(bars.map((b) => [b.date, b]));
  const tokenValues = bars.map((b) => b.totalTokens).filter((v) => v > 0);
  tokenValues.sort((a, b) => a - b);

  const getIntensity = (tokens: number): number => {
    if (tokens === 0 || tokenValues.length === 0) return 0;
    const idx = tokenValues.findIndex((v) => v >= tokens);
    const pos = idx === -1 ? tokenValues.length : idx;
    const ratio = pos / tokenValues.length;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const today = new Date();
  const todayDow = today.getUTCDay();
  const endDate = new Date(today);
  endDate.setUTCDate(today.getUTCDate() + (6 - todayDow));
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - WEEKS_TO_SHOW * 7 + 1);

  const cells: HeatmapCell[] = [];
  const cursor = new Date(startDate);
  let week = 0;

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = cursor.getUTCDay();
    const bar = barMap.get(dateStr) ?? null;
    cells.push({
      date: dateStr,
      week,
      dayOfWeek,
      totalTokens: bar?.totalTokens ?? 0,
      sessions: bar?.sessions ?? 0,
      intensity: getIntensity(bar?.totalTokens ?? 0),
      bar,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() === 0) week++;
  }

  return cells;
};

export const buildMonthLabels = (cells: HeatmapCell[]): { label: string; week: number }[] => {
  const labels: { label: string; week: number }[] = [];
  let lastMonth = -1;
  for (const cell of cells) {
    if (cell.dayOfWeek !== 0) continue;
    const month = new Date(cell.date).getUTCMonth();
    if (month !== lastMonth) {
      const label = MONTH_LABELS[month];
      if (!label) continue;
      labels.push({ label, week: cell.week });
      lastMonth = month;
    }
  }
  return labels;
};
