import type { AgentMetricsEvent } from "@octogent/core";

type AgentAuditTrailProps = {
  terminalId: string | null;
  tentacleName: string;
  events: AgentMetricsEvent[];
  isLoading: boolean;
};

const EVENT_ICONS: Record<string, string> = {
  state_change: "→",
  token_usage: "$",
  tool_invocation: "⚙",
  error_detected: "✕",
};

const EVENT_CSS: Record<string, string> = {
  state_change: "obs-trail-state",
  token_usage: "obs-trail-token",
  tool_invocation: "obs-trail-tool",
  error_detected: "obs-trail-error",
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const formatPayload = (eventType: string, payload: Record<string, unknown>): string => {
  switch (eventType) {
    case "state_change":
      return `${String(payload.from)} → ${String(payload.to)}`;
    case "token_usage":
      return `$${Number(payload.costUsd).toFixed(4)}`;
    case "tool_invocation":
      return String(payload.tool ?? "");
    case "error_detected":
      return String(payload.snippet ?? "").slice(0, 80);
    default:
      return "";
  }
};

export const AgentAuditTrail = ({
  terminalId,
  tentacleName,
  events,
  isLoading,
}: AgentAuditTrailProps) => {
  if (!terminalId) {
    return (
      <div className="obs-trail-panel">
        <h4 className="obs-chart-title">Audit Trail</h4>
        <div className="obs-empty">
          <span>Select an agent row above to view its audit trail.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="obs-trail-panel">
      <h4 className="obs-chart-title">
        Audit Trail — <span className="obs-trail-agent-name">{tentacleName}</span>
      </h4>
      {isLoading ? (
        <div className="obs-empty">
          <span>Loading…</span>
        </div>
      ) : events.length === 0 ? (
        <div className="obs-empty">
          <span>No events recorded for this agent.</span>
        </div>
      ) : (
        <ol className="obs-trail-list" reversed>
          {[...events].reverse().map((ev) => (
            <li key={ev.eventId} className={`obs-trail-item ${EVENT_CSS[ev.eventType] ?? ""}`}>
              <span className="obs-trail-icon">{EVENT_ICONS[ev.eventType] ?? "·"}</span>
              <span className="obs-trail-time">{formatTime(ev.timestamp)}</span>
              <span className="obs-trail-type">{ev.eventType.replace(/_/g, " ")}</span>
              <span className="obs-trail-detail">{formatPayload(ev.eventType, ev.payload)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
