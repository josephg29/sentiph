import { type AgentState, InMemoryAgentSnapshotReader, buildTentacleColumns } from "@octogent/core";
import { useEffect, useState } from "react";

import { EmptyOctopus } from "./components/EmptyOctopus";

const stateClass: Record<AgentState, string> = {
  live: "live",
  idle: "idle",
  queued: "queued",
  blocked: "blocked",
};

type TentacleView = Awaited<ReturnType<typeof buildTentacleColumns>>;
type AgentSnapshotPayload = ConstructorParameters<typeof InMemoryAgentSnapshotReader>[0][number];

const isAgentState = (value: unknown): value is AgentState =>
  value === "live" || value === "idle" || value === "queued" || value === "blocked";

const isAgentSnapshotPayload = (value: unknown): value is AgentSnapshotPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;

  return (
    typeof snapshot.agentId === "string" &&
    typeof snapshot.label === "string" &&
    isAgentState(snapshot.state) &&
    typeof snapshot.tentacleId === "string" &&
    typeof snapshot.createdAt === "string" &&
    (snapshot.parentAgentId === undefined || typeof snapshot.parentAgentId === "string")
  );
};

const loadAgentSnapshots = async (signal: AbortSignal): Promise<AgentSnapshotPayload[]> => {
  const response = await fetch("/api/agent-snapshots", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to load agent snapshots (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(isAgentSnapshotPayload);
};

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const syncColumns = async () => {
      try {
        setLoadError(null);
        const snapshots = await loadAgentSnapshots(controller.signal);
        const reader = new InMemoryAgentSnapshotReader(snapshots);
        const nextColumns = await buildTentacleColumns(reader);
        setColumns(nextColumns);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setColumns([]);
          setLoadError("Agent data is currently unavailable.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void syncColumns();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="page">
      <header className="chrome">
        <h1>Octogent</h1>
      </header>

      <main className="tentacles" aria-label="Tentacle board">
        {isLoading && (
          <section className="empty-state" aria-label="Loading">
            <h2>Loading tentacles...</h2>
          </section>
        )}

        {!isLoading && columns.length === 0 && (
          <section className="empty-state" aria-label="Empty state">
            <EmptyOctopus />
            <h2>No active tentacles</h2>
            <p>When agents start, tentacles will appear here.</p>
            {loadError && <p className="empty-state-subtle">{loadError}</p>}
          </section>
        )}

        {columns.map((column) => (
          <section
            key={column.tentacleId}
            className="tentacle-column"
            aria-label={column.tentacleId}
          >
            <h2>{column.tentacleId}</h2>
            <ul>
              {column.agents.map((agent) => (
                <li key={agent.agentId} className="agent-card">
                  <span>{agent.label}</span>
                  <span className={`pill ${stateClass[agent.state]}`}>{agent.state}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
};
