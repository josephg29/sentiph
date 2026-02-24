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
import {
  buildAgentSnapshotsUrl,
  buildTentacleRenameUrl,
  buildTentaclesUrl,
} from "./runtime/runtimeEndpoints";

type TentacleView = Awaited<ReturnType<typeof buildTentacleColumns>>;

export const App = () => {
  const [columns, setColumns] = useState<TentacleView>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAgentsSidebarVisible, setIsAgentsSidebarVisible] = useState(true);
  const [isCreatingTentacle, setIsCreatingTentacle] = useState(false);
  const [isDeletingTentacleId, setIsDeletingTentacleId] = useState<string | null>(null);
  const [editingTentacleId, setEditingTentacleId] = useState<string | null>(null);
  const [tentacleNameDraft, setTentacleNameDraft] = useState("");
  const [tentacleWidths, setTentacleWidths] = useState<Record<string, number>>({});
  const [tentacleViewportWidth, setTentacleViewportWidth] = useState<number | null>(null);
  const tentaclesRef = useRef<HTMLElement | null>(null);
  const tentacleNameInputRef = useRef<HTMLInputElement | null>(null);
  const cancelTentacleNameSubmitRef = useRef(false);

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
      tentacleViewportWidth === null
        ? null
        : Math.max(0, tentacleViewportWidth - dividerTotalWidth);
    setTentacleWidths((currentWidths) =>
      reconcileTentacleWidths(currentWidths, tentacleIds, paneViewportWidth),
    );
  }, [columns, tentacleViewportWidth]);

  useEffect(() => {
    if (!editingTentacleId) {
      return;
    }

    if (!columns.some((column) => column.tentacleId === editingTentacleId)) {
      setEditingTentacleId(null);
      return;
    }

    const input = tentacleNameInputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, [columns, editingTentacleId]);

  const beginTentacleNameEdit = (tentacleId: string, currentTentacleName: string) => {
    setLoadError(null);
    setEditingTentacleId(tentacleId);
    setTentacleNameDraft(currentTentacleName);
  };

  const submitTentacleRename = async (tentacleId: string, currentTentacleName: string) => {
    if (cancelTentacleNameSubmitRef.current) {
      cancelTentacleNameSubmitRef.current = false;
      return;
    }

    const trimmedName = tentacleNameDraft.trim();
    if (trimmedName.length === 0) {
      setLoadError("Tentacle name cannot be empty.");
      return;
    }

    if (trimmedName === currentTentacleName) {
      setEditingTentacleId(null);
      return;
    }

    try {
      setLoadError(null);
      const response = await fetch(buildTentacleRenameUrl(tentacleId), {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        throw new Error(`Unable to rename tentacle (${response.status})`);
      }

      const nextColumns = await readColumns();
      setColumns(nextColumns);
      setEditingTentacleId(null);
    } catch {
      setLoadError("Unable to rename tentacle.");
    }
  };

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

      const createdSnapshot = (await response.json()) as {
        tentacleId?: unknown;
        tentacleName?: unknown;
      };
      const nextColumns = await readColumns();
      setColumns(nextColumns);

      const createdTentacleId =
        typeof createdSnapshot.tentacleId === "string" ? createdSnapshot.tentacleId : null;
      if (!createdTentacleId) {
        return;
      }

      const createdColumn = nextColumns.find((column) => column.tentacleId === createdTentacleId);
      const createdTentacleName =
        createdColumn?.tentacleName ??
        (typeof createdSnapshot.tentacleName === "string"
          ? createdSnapshot.tentacleName
          : createdTentacleId);
      beginTentacleNameEdit(createdTentacleId, createdTentacleName);
    } catch {
      setLoadError("Unable to create a new tentacle.");
    } finally {
      setIsCreatingTentacle(false);
    }
  };

  const handleDeleteTentacle = async (tentacleId: string, tentacleName: string) => {
    const shouldDelete = window.confirm(`Delete tentacle "${tentacleName}"?`);
    if (!shouldDelete) {
      return;
    }

    try {
      setLoadError(null);
      setIsDeletingTentacleId(tentacleId);
      const response = await fetch(buildTentacleRenameUrl(tentacleId), {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to delete tentacle (${response.status})`);
      }

      if (editingTentacleId === tentacleId) {
        setEditingTentacleId(null);
        setTentacleNameDraft("");
      }

      const nextColumns = await readColumns();
      setColumns(nextColumns);
    } catch {
      setLoadError("Unable to delete tentacle.");
    } finally {
      setIsDeletingTentacleId(null);
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
                  <div className="tentacle-column-header">
                    {editingTentacleId === column.tentacleId ? (
                      <input
                        ref={tentacleNameInputRef}
                        aria-label={`Tentacle name for ${column.tentacleId}`}
                        className="tentacle-name-editor"
                        onBlur={() => {
                          void submitTentacleRename(column.tentacleId, column.tentacleName);
                        }}
                        onChange={(event) => {
                          setTentacleNameDraft(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void submitTentacleRename(column.tentacleId, column.tentacleName);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelTentacleNameSubmitRef.current = true;
                            setEditingTentacleId(null);
                            setTentacleNameDraft("");
                          }
                        }}
                        type="text"
                        value={tentacleNameDraft}
                      />
                    ) : (
                      <h2>
                        <button
                          className="tentacle-name-display"
                          onClick={() => {
                            beginTentacleNameEdit(column.tentacleId, column.tentacleName);
                          }}
                          type="button"
                        >
                          {column.tentacleName}
                        </button>
                      </h2>
                    )}
                    {editingTentacleId !== column.tentacleId && (
                      <div className="tentacle-header-actions">
                        <button
                          aria-label={`Rename tentacle ${column.tentacleId}`}
                          className="tentacle-rename"
                          onClick={() => {
                            beginTentacleNameEdit(column.tentacleId, column.tentacleName);
                          }}
                          type="button"
                        >
                          Rename
                        </button>
                        <button
                          aria-label={`Delete tentacle ${column.tentacleId}`}
                          className="tentacle-delete"
                          disabled={isDeletingTentacleId === column.tentacleId}
                          onClick={() => {
                            void handleDeleteTentacle(column.tentacleId, column.tentacleName);
                          }}
                          type="button"
                        >
                          {isDeletingTentacleId === column.tentacleId ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
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
