import type { ConversationSessionSummary } from "../app/types";

type SidebarConversationsListProps = {
  sessions: ConversationSessionSummary[];
  selectedSessionId: string | null;
  isLoadingSessions: boolean;
  onSelectSession: (sessionId: string) => void;
  onRefresh: () => void;
  onClearAll: () => void;
};

export const SidebarConversationsList = ({
  sessions,
  selectedSessionId,
  isLoadingSessions,
  onSelectSession,
  onRefresh,
  onClearAll,
}: SidebarConversationsListProps) => (
  <section className="active-agents-section" aria-label="Sidebar section Conversations">
    <div className="sidebar-conversations-toolbar">
      <button
        aria-label="Refresh conversations"
        className="sidebar-conversations-icon-btn"
        disabled={isLoadingSessions}
        onClick={onRefresh}
        type="button"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 8a5.5 5.5 0 0 1 9.3-3.95L13.5 5.5" />
          <path d="M13.5 2.5v3h-3" />
          <path d="M13.5 8a5.5 5.5 0 0 1-9.3 3.95L2.5 10.5" />
          <path d="M2.5 13.5v-3h3" />
        </svg>
      </button>
      <button
        aria-label="Clear all conversations"
        className="sidebar-conversations-icon-btn sidebar-conversations-icon-btn--danger"
        disabled={sessions.length === 0}
        onClick={onClearAll}
        type="button"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4h10" />
          <path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
          <path d="M4.5 4l.5 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-9" />
          <path d="M6.5 7v4" />
          <path d="M9.5 7v4" />
        </svg>
      </button>
    </div>
    <div className="active-agents-section-panel">
      {sessions.length === 0 ? (
        <p className="active-agents-status">No conversations yet.</p>
      ) : (
        <ol className="sidebar-conversations-list">
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <button
                aria-current={session.sessionId === selectedSessionId ? "page" : undefined}
                className="sidebar-conversation-item"
                data-active={session.sessionId === selectedSessionId ? "true" : "false"}
                onClick={() => {
                  onSelectSession(session.sessionId);
                }}
                type="button"
              >
                <strong>{session.sessionId}</strong>
                <span>{`Tentacle ${session.tentacleId ?? "--"}`}</span>
                <span>{`${session.turnCount} turns`}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  </section>
);
