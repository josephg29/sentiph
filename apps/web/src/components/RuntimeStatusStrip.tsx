import { useMemo } from "react";

import { GITHUB_SPARKLINE_HEIGHT, GITHUB_SPARKLINE_WIDTH } from "../app/constants";
import type { ClaudeUsageSnapshot } from "../app/types";
import type { UsageChartData } from "../app/hooks/useUsageHeatmapPolling";
import { OctopusGlyph } from "./EmptyOctopus";

type RuntimeStatusStripProps = {
  sparklinePoints: string;
  usageData: UsageChartData | null;
  claudeUsage: ClaudeUsageSnapshot | null;
  onRefreshClaudeUsage?: () => void;
};

const MINI_USAGE_WIDTH = 160;
const MINI_USAGE_HEIGHT = 28;
const MINI_BAR_GAP = 1;

type MiniBar = { x: number; y: number; width: number; height: number };

const buildUsageBars = (data: UsageChartData): MiniBar[] => {
  const days = data.days.slice(-30);
  if (days.length === 0) return [];

  const max = Math.max(...days.map((d) => d.totalTokens), 1);
  const barSlot = MINI_USAGE_WIDTH / days.length;
  const barWidth = Math.max(1, barSlot - MINI_BAR_GAP);

  return days.map((d, i) => {
    const h = Math.max(0.5, (d.totalTokens / max) * (MINI_USAGE_HEIGHT - 2));
    return {
      x: i * barSlot,
      y: MINI_USAGE_HEIGHT - h,
      width: barWidth,
      height: h,
    };
  });
};

const pct = (value: number | null | undefined, loading?: boolean): string => {
  if (loading) return "···";
  return value == null ? "--" : `${Math.round(value)}%`;
};

const UsageRail = ({
  label,
  percent,
  loading,
}: { label: string; percent: number | null | undefined; loading?: boolean }) => (
  <div className="console-status-usage-row">
    <span className="console-status-usage-row-meta">
      <span className="console-status-usage-row-label">{label}</span>
      <span className="console-status-usage-row-value">{pct(percent, loading)}</span>
    </span>
    <span className="console-status-usage-rail">
      <span
        className="console-status-usage-rail-fill"
        style={{ width: `${Math.min(100, percent ?? 0)}%` }}
      />
    </span>
  </div>
);

export const RuntimeStatusStrip = ({
  sparklinePoints,
  usageData,
  claudeUsage,
  onRefreshClaudeUsage,
}: RuntimeStatusStripProps) => {
  const usageBars = useMemo(
    () => (usageData ? buildUsageBars(usageData) : []),
    [usageData],
  );

  return (
    <section className="console-status-strip" aria-label="Runtime status strip">
      <div className="console-status-main">
        <OctopusGlyph
          className="console-status-octopus-icon"
          animation="sway"
          expression="normal"
          scale={2}
        />
        <span className="console-status-brand">OCTOGENT</span>
      </div>
      <div className="console-status-charts">
        <div className="console-status-sparkline" aria-label="Commits per day over last 30 days">
          <div className="console-status-sparkline-chart">
            <svg
              viewBox={`0 0 ${GITHUB_SPARKLINE_WIDTH} ${GITHUB_SPARKLINE_HEIGHT}`}
              role="presentation"
            >
              <polyline points={sparklinePoints} />
            </svg>
          </div>
          <span className="console-status-sparkline-label">COMMITS/DAY · LAST 30 DAYS</span>
        </div>
        <div className="console-status-usage-mini" aria-label="Claude token usage last 30 days">
          {usageBars.length > 0 ? (
            <>
              <div className="console-status-usage-mini-chart">
                <svg
                  viewBox={`0 0 ${MINI_USAGE_WIDTH} ${MINI_USAGE_HEIGHT}`}
                  role="presentation"
                >
                  {usageBars.map((bar, i) => (
                    <rect
                      key={i}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={0.5}
                    />
                  ))}
                </svg>
              </div>
              <span className="console-status-sparkline-label">CLAUDE TOKENS/DAY · LAST 30 DAYS</span>
            </>
          ) : (
            <span className="console-status-sparkline-label">CLAUDE USAGE —</span>
          )}
        </div>
      </div>
      <div className="console-status-claude-usage" aria-label="Claude usage limits">
        {onRefreshClaudeUsage && (
          <button
            type="button"
            className="console-status-claude-usage-refresh"
            onClick={onRefreshClaudeUsage}
            aria-label="Refresh Claude usage"
            title="Refresh Claude usage"
          >
            ↻
          </button>
        )}
        <span className="console-status-claude-usage-title">
          CLAUDE<br />USAGE
        </span>
        <div className="console-status-claude-usage-bars">
          {claudeUsage?.status === "ok" ? (
            <>
              <UsageRail label="Session" percent={claudeUsage.primaryUsedPercent} />
              <UsageRail label="Week (all)" percent={claudeUsage.secondaryUsedPercent} />
            </>
          ) : (
            <>
              <UsageRail label="Session" percent={0} loading />
              <UsageRail label="Week (all)" percent={0} loading />
            </>
          )}
        </div>
      </div>
    </section>
  );
};
