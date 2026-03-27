import { useCallback, useEffect, useRef, useState } from "react";

import { buildChannelMessagesUrl, buildTerminalSnapshotsUrl } from "../runtime/runtimeEndpoints";

type ChannelMessage = {
  messageId: string;
  fromTerminalId: string;
  toTerminalId: string;
  content: string;
  timestamp: string;
  delivered: boolean;
};

type TerminalSnapshot = {
  terminalId: string;
  tentacleName: string;
};

const POLL_INTERVAL_MS = 3_000;

export const CommunicationsPrimaryView = () => {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [terminals, setTerminals] = useState<TerminalSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (terminalIds: string[]) => {
    const allMessages: ChannelMessage[] = [];
    for (const id of terminalIds) {
      try {
        const res = await fetch(buildChannelMessagesUrl(id));
        if (res.ok) {
          const data = await res.json();
          const msgs = data.messages ?? [];
          allMessages.push(...msgs);
        }
      } catch {
        // Skip failures for individual terminals.
      }
    }
    allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    setMessages(allMessages);
  }, []);

  const fetchTerminals = useCallback(async () => {
    try {
      const res = await fetch(buildTerminalSnapshotsUrl());
      if (!res.ok) {
        setError("Failed to fetch terminals.");
        return [];
      }
      const data: TerminalSnapshot[] = await res.json();
      setTerminals(data);
      return data.map((t) => t.terminalId);
    } catch {
      setError("Could not reach API server.");
      return [];
    }
  }, []);

  const refresh = useCallback(async () => {
    const ids = await fetchTerminals();
    if (ids.length > 0) {
      await fetchMessages(ids);
    }
  }, [fetchTerminals, fetchMessages]);

  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const terminalLabel = (id: string) => {
    const t = terminals.find((t) => t.terminalId === id);
    return t?.tentacleName ?? id;
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <section className="communications-view" aria-label="Communications channel log">
      <header className="communications-view__header">
        <h2>Communications Channel</h2>
        <span className="communications-view__count">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </header>

      {error && <div className="communications-view__error">{error}</div>}

      <div className="communications-view__log">
        {messages.length === 0 && !error && (
          <div className="communications-view__empty">
            No channel messages yet. Agents can send messages using:
            <code>octogent channel send &lt;terminalId&gt; "message"</code>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.messageId}
            className={`communications-view__message ${m.delivered ? "communications-view__message--delivered" : "communications-view__message--pending"}`}
          >
            <span className="communications-view__time">{formatTimestamp(m.timestamp)}</span>
            <span className="communications-view__from">
              {terminalLabel(m.fromTerminalId) || "external"}
            </span>
            <span className="communications-view__arrow">&rarr;</span>
            <span className="communications-view__to">{terminalLabel(m.toTerminalId)}</span>
            <span className="communications-view__status">
              {m.delivered ? "[delivered]" : "[pending]"}
            </span>
            <span className="communications-view__content">{m.content}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
