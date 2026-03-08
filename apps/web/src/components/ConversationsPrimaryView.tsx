import type { ConversationSessionDetail, ConversationSessionSummary } from "../app/types";
import { ActionButton } from "./ui/ActionButton";

type ConversationsPrimaryViewProps = {
  sessions: ConversationSessionSummary[];
  selectedSessionId: string | null;
  selectedSession: ConversationSessionDetail | null;
  isLoadingSessions: boolean;
  isLoadingSelectedSession: boolean;
  isExporting: boolean;
  errorMessage: string | null;
  onSelectSession: (sessionId: string) => void;
  onRefresh: () => void;
  onExport: (format: "json" | "md") => void;
};

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "--";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const ConversationsPrimaryView = ({
  sessions,
  selectedSessionId,
  selectedSession,
  isLoadingSessions,
  isLoadingSelectedSession,
  isExporting,
  errorMessage,
  onSelectSession,
  onRefresh,
  onExport,
}: ConversationsPrimaryViewProps) => (
  <section className="conversations-view" aria-label="Conversations primary view">
    <header className="conversations-header">
      <div className="conversations-header-copy">
        <h2>Conversations</h2>
        <p>Durable coding-agent history from transcript events.</p>
      </div>
      <div className="conversations-header-actions">
        <ActionButton
          aria-label="Refresh conversations"
          className="conversations-refresh"
          disabled={isLoadingSessions}
          onClick={onRefresh}
          size="dense"
          variant="accent"
        >
          {isLoadingSessions ? "Refreshing..." : "Refresh"}
        </ActionButton>
        <ActionButton
          aria-label="Export conversation as JSON"
          className="conversations-export"
          disabled={!selectedSession || isExporting}
          onClick={() => {
            onExport("json");
          }}
          size="dense"
          variant="info"
        >
          {isExporting ? "Exporting..." : "Export JSON"}
        </ActionButton>
        <ActionButton
          aria-label="Export conversation as Markdown"
          className="conversations-export"
          disabled={!selectedSession || isExporting}
          onClick={() => {
            onExport("md");
          }}
          size="dense"
          variant="info"
        >
          {isExporting ? "Exporting..." : "Export Markdown"}
        </ActionButton>
      </div>
    </header>

    {errorMessage ? <p className="conversations-error">{errorMessage}</p> : null}

    <div className="conversations-layout">
      <aside className="conversations-sessions" aria-label="Conversation sessions">
        {sessions.length === 0 ? (
          <p className="conversations-empty">No conversation transcripts yet.</p>
        ) : (
          <ol className="conversations-session-list">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <button
                  aria-current={session.sessionId === selectedSessionId ? "page" : undefined}
                  className="conversations-session-item"
                  data-active={session.sessionId === selectedSessionId ? "true" : "false"}
                  onClick={() => {
                    onSelectSession(session.sessionId);
                  }}
                  type="button"
                >
                  <strong>{session.sessionId}</strong>
                  <span>{`Tentacle ${session.tentacleId ?? "--"}`}</span>
                  <span>{`${session.turnCount} turns`}</span>
                  <span>{`Updated ${formatTimestamp(session.lastEventAt)}`}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <section className="conversations-transcript" aria-label="Conversation transcript pane">
        {isLoadingSelectedSession ? (
          <p className="conversations-empty">Loading conversation...</p>
        ) : selectedSession ? (
          <>
            <header className="conversations-transcript-header">
              <h3>{selectedSession.sessionId}</h3>
              <dl>
                <div>
                  <dt>Started</dt>
                  <dd>{formatTimestamp(selectedSession.startedAt)}</dd>
                </div>
                <div>
                  <dt>Ended</dt>
                  <dd>{formatTimestamp(selectedSession.endedAt)}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{selectedSession.eventCount}</dd>
                </div>
              </dl>
            </header>
            <ol className="conversations-turn-list">
              {selectedSession.turns.map((turn) => (
                <li className="conversations-turn" data-role={turn.role} key={turn.turnId}>
                  <header>
                    <span>{turn.role === "user" ? "User" : "Assistant"}</span>
                    <time dateTime={turn.startedAt}>{formatTimestamp(turn.startedAt)}</time>
                  </header>
                  <pre>{turn.content}</pre>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="conversations-empty">Select a session to view conversation history.</p>
        )}
      </section>
    </div>
  </section>
);
