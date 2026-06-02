import { useMemo, useRef, useState } from "react";

import type { UsageChartData } from "../app/hooks/useUsageHeatmapPolling";
import {
  buildBars,
  buildColorMap,
  formatDateLabel,
  formatTokenCount,
} from "./UsageHeatmap.helpers";
import type { BarData, BarSegmentMode } from "./UsageHeatmap.types";
import { BarChartView, ChartTooltip } from "./UsageHeatmapBarChart";
import { HeatmapView, usePanelSize } from "./UsageHeatmapHeatmapView";
import { ActionButton } from "./ui/ActionButton";

type UsageChartSectionProps = {
  data: UsageChartData | null;
  isLoading: boolean;
  onRefresh: () => void;
};

export const UsageBarChart = ({ data, isLoading, onRefresh }: UsageChartSectionProps) => {
  const [segmentMode, setSegmentMode] = useState<BarSegmentMode>("project");
  const [hoveredBar, setHoveredBar] = useState<BarData | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const splitRef = useRef<HTMLDivElement>(null);
  const barPanel = usePanelSize();
  const heatmapPanel = usePanelSize();

  const days = data?.days ?? [];
  const projects = data?.projects ?? [];
  const models = data?.models ?? [];

  const segmentKeys = segmentMode === "model" ? models : projects;

  const maxTokens = useMemo(() => {
    let max = 0;
    for (const d of days) {
      if (d.totalTokens > max) max = d.totalTokens;
    }
    return max;
  }, [days]);

  const totalTokens = useMemo(() => days.reduce((s, d) => s + d.totalTokens, 0), [days]);
  const totalSessions = useMemo(() => days.reduce((s, d) => s + d.sessions, 0), [days]);
  const activeDays = useMemo(() => days.filter((d) => d.totalTokens > 0).length, [days]);
  const hasUsage = days.length > 0 && totalTokens > 0;

  const bars = useMemo(
    () => buildBars(days, segmentKeys, segmentMode),
    [days, segmentKeys, segmentMode],
  );
  const heatmapBars = useMemo(() => buildBars(days, projects, "project"), [days, projects]);
  const colorMap = useMemo(() => buildColorMap(segmentKeys), [segmentKeys]);

  const stats = useMemo(() => {
    const [firstDay] = days;
    if (!firstDay) return null;
    const peakDay = days.reduce(
      (best, d) => (d.totalTokens > best.totalTokens ? d : best),
      firstDay,
    );
    const avgPerSession = totalSessions > 0 ? Math.round(totalTokens / totalSessions) : 0;
    const topModel = models[0] ?? "—";
    const topProject = projects[0] ?? "—";

    let streak = 0;
    let maxStreak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i];
      if (!day) continue;
      if (day.totalTokens > 0) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 0;
      }
    }

    return { peakDay, avgPerSession, topModel, topProject, maxStreak };
  }, [days, totalTokens, totalSessions, models, projects]);

  if (!isLoading && !hasUsage) {
    return (
      <section className="usage-heatmap" aria-label="Claude token usage chart">
        <header className="usage-heatmap-header">
          <div className="usage-heatmap-header-left">
            <h3>Claude Token Usage</h3>
            <span className="usage-heatmap-summary">No usage recorded yet</span>
          </div>
          <div className="usage-heatmap-header-actions">
            <ActionButton
              aria-label="Refresh usage chart data"
              className="usage-heatmap-refresh"
              disabled={isLoading}
              onClick={onRefresh}
              size="dense"
              variant="accent"
            >
              Refresh
            </ActionButton>
          </div>
        </header>
        <div className="usage-chart-split">
          <p className="usage-chart-empty">
            No Claude usage recorded yet — run Claude Code and refresh to populate this chart.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="usage-heatmap" aria-label="Claude token usage chart">
      <header className="usage-heatmap-header">
        <div className="usage-heatmap-header-left">
          <h3>Claude Token Usage</h3>
          <span className="usage-heatmap-summary">
            {formatTokenCount(totalTokens)} tokens across {activeDays} days, {totalSessions}{" "}
            sessions
          </span>
        </div>
        <div className="usage-heatmap-header-actions">
          <ActionButton
            aria-label="Refresh usage chart data"
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

      <div
        className="usage-chart-split"
        ref={splitRef}
        onMouseMove={(e) => {
          const rect = splitRef.current?.getBoundingClientRect();
          if (rect) {
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }
        }}
      >
        <div className="usage-chart-bar-segment-toggle">
          <button
            type="button"
            className={`usage-chart-bar-segment-btn${segmentMode === "project" ? " is-active" : ""}`}
            onClick={() => setSegmentMode("project")}
          >
            Project
          </button>
          <button
            type="button"
            className={`usage-chart-bar-segment-btn${segmentMode === "model" ? " is-active" : ""}`}
            onClick={() => setSegmentMode("model")}
          >
            Model
          </button>
        </div>
        <div className="usage-chart-left-stack">
          <div className="usage-chart-panel" ref={barPanel.ref}>
            <BarChartView
              bars={bars}
              maxTokens={maxTokens}
              containerWidth={barPanel.width}
              containerHeight={barPanel.height}
              hoveredBar={hoveredBar}
              setHoveredBar={setHoveredBar}
            />
          </div>
          {segmentKeys.length > 1 && (
            <div className="usage-chart-legend">
              {segmentKeys.map((key) => (
                <span key={key} className="usage-chart-legend-item">
                  <span
                    className="usage-chart-legend-dot"
                    style={{ backgroundColor: colorMap.get(key) }}
                  />
                  {key}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="usage-chart-right-stack">
          <div className="usage-chart-panel" ref={heatmapPanel.ref}>
            <HeatmapView
              bars={heatmapBars}
              containerWidth={heatmapPanel.width}
              containerHeight={heatmapPanel.height}
              hoveredBar={hoveredBar}
              setHoveredBar={setHoveredBar}
            />
          </div>
          {stats && (
            <dl className="usage-chart-stats">
              <div className="usage-chart-stat">
                <dt>Peak Day</dt>
                <dd>
                  {formatDateLabel(stats.peakDay.date)}
                  <span className="usage-chart-stat-sub">
                    {formatTokenCount(stats.peakDay.totalTokens)}
                  </span>
                </dd>
              </div>
              <div className="usage-chart-stat">
                <dt>Avg / Session</dt>
                <dd>{formatTokenCount(stats.avgPerSession)}</dd>
              </div>
              <div className="usage-chart-stat">
                <dt>Top Model</dt>
                <dd>{stats.topModel}</dd>
              </div>
              <div className="usage-chart-stat">
                <dt>Top Project</dt>
                <dd>{stats.topProject}</dd>
              </div>
              <div className="usage-chart-stat">
                <dt>Best Streak</dt>
                <dd>{stats.maxStreak}d</dd>
              </div>
            </dl>
          )}
        </div>

        {hoveredBar && hoveredBar.totalTokens > 0 && (
          <ChartTooltip
            bar={hoveredBar}
            x={mousePos.x}
            y={mousePos.y}
            containerWidth={splitRef.current?.clientWidth ?? 800}
          />
        )}
      </div>
    </section>
  );
};
