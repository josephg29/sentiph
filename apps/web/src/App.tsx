import { buildTentacleColumns } from "@octogent/core";
import { useEffect, useState } from "react";

import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import { EmptyOctopus } from "./components/EmptyOctopus";
import { TentacleTerminal } from "./components/TentacleTerminal";
import { HttpAgentSnapshotReader } from "./runtime/HttpAgentSnapshotReader";
import { buildAgentSnapshotsUrl } from "./runtime/runtimeEndpoints";

type TentacleView = Awaited<ReturnType<typeof buildTentacleColumns>>;

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAgentsSidebarVisible, setIsAgentsSidebarVisible] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const syncColumns = async () => {
      try {
        setLoadError(null);
        const reader = new HttpAgentSnapshotReader({
          endpoint: buildAgentSnapshotsUrl(),
          signal: controller.signal,
        });
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
        <div className="chrome-actions">
          <button
            aria-label={
              isAgentsSidebarVisible ? "Hide Active Agents sidebar" : "Show Active Agents sidebar"
            }
            className="chrome-sidebar-toggle"
            data-active={isAgentsSidebarVisible ? "true" : "false"}
            onClick={() => {
              setIsAgentsSidebarVisible((current) => !current);
            }}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="chrome-sidebar-toggle-icon"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                fill="none"
                height="12"
                stroke="currentColor"
                strokeWidth="1.5"
                width="12"
                x="2"
                y="2"
              />
              <rect height="12" width="6" x="2" y="2" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`workspace-shell${isAgentsSidebarVisible ? "" : " workspace-shell--full"}`}>
        {isAgentsSidebarVisible && (
          <ActiveAgentsSidebar columns={columns} isLoading={isLoading} loadError={loadError} />
        )}

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
              <TentacleTerminal tentacleId={column.tentacleId} />
            </section>
          ))}
        </main>
      </div>
    </div>
  );
};
