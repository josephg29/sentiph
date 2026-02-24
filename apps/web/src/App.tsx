import { buildTentacleColumns } from "@octogent/core";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import { ActiveAgentsSidebar } from "./components/ActiveAgentsSidebar";
import { EmptyOctopus, OctopusGlyph } from "./components/EmptyOctopus";
import { TentacleTerminal } from "./components/TentacleTerminal";
import {
  TENTACLE_DIVIDER_WIDTH,
  TENTACLE_MIN_WIDTH,
  TENTACLE_RESIZE_STEP,
  reconcileTentacleWidths,
  resizeTentaclePair,
} from "./layout/tentaclePaneSizing";
import { HttpAgentSnapshotReader } from "./runtime/HttpAgentSnapshotReader";
import { buildAgentSnapshotsUrl, buildTentaclesUrl } from "./runtime/runtimeEndpoints";

type TentacleView = Awaited<ReturnType<typeof buildTentacleColumns>>;

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAgentsSidebarVisible, setIsAgentsSidebarVisible] = useState(true);
  const [isCreatingTentacle, setIsCreatingTentacle] = useState(false);
  const [tentacleWidths, setTentacleWidths] = useState<Record<string, number>>({});
  const [tentacleViewportWidth, setTentacleViewportWidth] = useState<number | null>(null);
  const tentaclesRef = useRef<HTMLElement | null>(null);

  const readColumns = useCallback(async (signal?: AbortSignal) => {
    const readerOptions: { endpoint: string; signal?: AbortSignal } = {
      endpoint: buildAgentSnapshotsUrl(),
    };
    if (signal) {
      readerOptions.signal = signal;
    }
    const reader = new HttpAgentSnapshotReader(readerOptions);
    return buildTentacleColumns(reader);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const syncColumns = async () => {
      try {
        setLoadError(null);
        const nextColumns = await readColumns(controller.signal);
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
  }, [readColumns]);

  useEffect(() => {
    if (!tentaclesRef.current) {
      return;
    }

    const measure = () => {
      const width = Math.floor(tentaclesRef.current?.getBoundingClientRect().width ?? 0);
      setTentacleViewportWidth(width > 0 ? width : null);
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(tentaclesRef.current);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const tentacleIds = columns.map((column) => column.tentacleId);
    const dividerTotalWidth = Math.max(0, tentacleIds.length - 1) * TENTACLE_DIVIDER_WIDTH;
    const paneViewportWidth =
      tentacleViewportWidth === null ? null : Math.max(0, tentacleViewportWidth - dividerTotalWidth);
    setTentacleWidths((currentWidths) =>
      reconcileTentacleWidths(currentWidths, tentacleIds, paneViewportWidth),
    );
  }, [columns, tentacleViewportWidth]);

  const handleCreateTentacle = async () => {
    try {
      setIsCreatingTentacle(true);
      setLoadError(null);

      const response = await fetch(buildTentaclesUrl(), {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to create tentacle (${response.status})`);
      }

      const nextColumns = await readColumns();
      setColumns(nextColumns);
    } catch {
      setLoadError("Unable to create a new tentacle.");
    } finally {
      setIsCreatingTentacle(false);
    }
  };

  const handleTentacleDividerPointerDown = (leftTentacleId: string, rightTentacleId: string) => {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startLeftWidth = tentacleWidths[leftTentacleId] ?? TENTACLE_MIN_WIDTH;
      const startRightWidth = tentacleWidths[rightTentacleId] ?? TENTACLE_MIN_WIDTH;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const resizedPair = resizeTentaclePair(
          {
            [leftTentacleId]: startLeftWidth,
            [rightTentacleId]: startRightWidth,
          },
          leftTentacleId,
          rightTentacleId,
          delta,
        );

        setTentacleWidths((current) => {
          const nextLeft = resizedPair[leftTentacleId] ?? startLeftWidth;
          const nextRight = resizedPair[rightTentacleId] ?? startRightWidth;
          if (current[leftTentacleId] === nextLeft && current[rightTentacleId] === nextRight) {
            return current;
          }

          return {
            ...current,
            [leftTentacleId]: nextLeft,
            [rightTentacleId]: nextRight,
          };
        });
      };

      const stopResize = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    };
  };

  const handleTentacleDividerKeyDown = (leftTentacleId: string, rightTentacleId: string) => {
    return (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      const delta = event.key === "ArrowRight" ? TENTACLE_RESIZE_STEP : -TENTACLE_RESIZE_STEP;
      setTentacleWidths((currentWidths) =>
        resizeTentaclePair(currentWidths, leftTentacleId, rightTentacleId, delta),
      );
    };
  };

  return (
    <div className="page">
      <header className="chrome">
        <div className="chrome-left">
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

        <div className="chrome-brand" aria-label="Octogent brand">
          <OctopusGlyph className="chrome-octopus" />
          <h1>Octogent</h1>
        </div>

        <div className="chrome-right">
          <button
            aria-label="New tentacle"
            className="chrome-create-tentacle"
            disabled={isCreatingTentacle}
            onClick={() => {
              void handleCreateTentacle();
            }}
            type="button"
          >
            {isCreatingTentacle ? "Creating..." : "New tentacle"}
          </button>
        </div>
      </header>

      <div className={`workspace-shell${isAgentsSidebarVisible ? "" : " workspace-shell--full"}`}>
        {isAgentsSidebarVisible && (
          <ActiveAgentsSidebar columns={columns} isLoading={isLoading} loadError={loadError} />
        )}

        <main ref={tentaclesRef} className="tentacles" aria-label="Tentacle board">
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

          {columns.map((column, index) => {
            const rightNeighbor = columns[index + 1];
            return (
              <Fragment key={column.tentacleId}>
                <section
                  className="tentacle-column"
                  aria-label={column.tentacleId}
                  style={{
                    width: `${tentacleWidths[column.tentacleId] ?? TENTACLE_MIN_WIDTH}px`,
                  }}
                >
                  <h2>{column.tentacleId}</h2>
                  <TentacleTerminal tentacleId={column.tentacleId} />
                </section>

                {rightNeighbor && (
                  <div
                    aria-label={`Resize between ${column.tentacleId} and ${rightNeighbor.tentacleId}`}
                    aria-orientation="vertical"
                    className="tentacle-divider"
                    onKeyDown={handleTentacleDividerKeyDown(
                      column.tentacleId,
                      rightNeighbor.tentacleId,
                    )}
                    onPointerDown={handleTentacleDividerPointerDown(
                      column.tentacleId,
                      rightNeighbor.tentacleId,
                    )}
                    role="separator"
                    tabIndex={0}
                  />
                )}
              </Fragment>
            );
          })}
        </main>
      </div>
    </div>
  );
};
