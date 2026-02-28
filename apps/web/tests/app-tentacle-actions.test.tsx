import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import {
  MockWebSocket,
  jsonResponse,
  notFoundResponse,
  resetAppTestHarness,
} from "./test-utils/appTestHarness";

describe("App tentacle create/rename/delete actions", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("creates a shared-codebase tentacle and refreshes columns plus sidebar listings", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/agent-snapshots") && method === "GET") {
        const afterCreate = fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/tentacles") &&
            (calledInit?.method ?? "GET") === "POST",
        );

        return jsonResponse(
          afterCreate
            ? [
                {
                  agentId: "tentacle-1-root",
                  label: "tentacle-1-root",
                  state: "live",
                  tentacleId: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  agentId: "tentacle-2-root",
                  label: "tentacle-2-root",
                  state: "live",
                  tentacleId: "tentacle-2",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  agentId: "tentacle-1-root",
                  label: "tentacle-1-root",
                  state: "live",
                  tentacleId: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/tentacles") && method === "POST") {
        expect(init?.body).toBe(JSON.stringify({ workspaceMode: "shared" }));
        return jsonResponse(
          {
            agentId: "tentacle-2-root",
            label: "tentacle-2-root",
            state: "live",
            tentacleId: "tentacle-2",
            createdAt: "2026-02-24T10:05:00.000Z",
          },
          201,
        );
      }

      return notFoundResponse();
    });

    render(<App />);

    await screen.findByLabelText("tentacle-1");
    fireEvent.click(screen.getByRole("button", { name: "Create tentacle in main codebase" }));

    const tentacleTwoColumn = await screen.findByLabelText("tentacle-2");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");

    expect(tentacleTwoColumn).toBeInTheDocument();
    expect(within(sidebar).getByLabelText("Active agents in tentacle-1")).toBeInTheDocument();
    expect(within(sidebar).getByLabelText("Active agents in tentacle-2")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockWebSocket.instances.some((socket) => socket.url.includes("/tentacle-2/ws"))).toBe(
        true,
      );
    });
  });

  it("creates an isolated-worktree tentacle and starts inline editing immediately", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/agent-snapshots") && method === "GET") {
        const afterCreate = fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/tentacles") &&
            (calledInit?.method ?? "GET") === "POST",
        );

        return jsonResponse(
          afterCreate
            ? [
                {
                  agentId: "tentacle-1-root",
                  label: "tentacle-1-root",
                  state: "live",
                  tentacleId: "tentacle-1",
                  tentacleName: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  agentId: "tentacle-2-root",
                  label: "tentacle-2-root",
                  state: "live",
                  tentacleId: "tentacle-2",
                  tentacleName: "tentacle-2",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  agentId: "tentacle-1-root",
                  label: "tentacle-1-root",
                  state: "live",
                  tentacleId: "tentacle-1",
                  tentacleName: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/tentacles") && method === "POST") {
        expect(init?.body).toBe(JSON.stringify({ workspaceMode: "worktree" }));
        return jsonResponse(
          {
            agentId: "tentacle-2-root",
            label: "tentacle-2-root",
            state: "live",
            tentacleId: "tentacle-2",
            tentacleName: "tentacle-2",
            createdAt: "2026-02-24T10:05:00.000Z",
          },
          201,
        );
      }

      return notFoundResponse();
    });

    render(<App />);

    await screen.findByLabelText("tentacle-1");
    fireEvent.click(screen.getByRole("button", { name: "Create tentacle with isolated worktree" }));

    const nameEditor = await screen.findByLabelText("Tentacle name for tentacle-2");
    expect(nameEditor).toHaveValue("tentacle-2");
    expect(document.activeElement).toBe(nameEditor);
    expect((nameEditor as HTMLInputElement).selectionStart).toBe(0);
    expect((nameEditor as HTMLInputElement).selectionEnd).toBe("tentacle-2".length);
  });

  it("renames an existing tentacle inline from the column header", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    let tentacleName = "tentacle-a";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/agent-snapshots") && method === "GET") {
        return jsonResponse([
          {
            agentId: "agent-1",
            label: "core-planner",
            state: "live",
            tentacleId: "tentacle-a",
            tentacleName,
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]);
      }

      if (url.endsWith("/api/tentacles/tentacle-a") && method === "PATCH") {
        expect(init?.body).toBe(JSON.stringify({ name: "research" }));
        tentacleName = "research";
        return jsonResponse({
          agentId: "tentacle-a-root",
          label: "tentacle-a-root",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName,
          createdAt: "2026-02-24T10:00:00.000Z",
        });
      }

      return notFoundResponse();
    });

    render(<App />);
    const tentacleColumn = await screen.findByLabelText("tentacle-a");
    fireEvent.click(screen.getByRole("button", { name: "Rename tentacle tentacle-a" }));
    const nameEditor = await within(tentacleColumn).findByLabelText("Tentacle name for tentacle-a");
    fireEvent.change(nameEditor, { target: { value: "research" } });
    fireEvent.keyDown(nameEditor, { key: "Enter" });

    await waitFor(() => {
      expect(within(tentacleColumn).getByRole("button", { name: "research" })).toBeInTheDocument();
    });
  });

  it("deletes a tentacle from the header action and refreshes board and sidebar", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    let includeTentacleB = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/agent-snapshots") && method === "GET") {
        return jsonResponse(
          includeTentacleB
            ? [
                {
                  agentId: "tentacle-a-root",
                  label: "tentacle-a-root",
                  state: "live",
                  tentacleId: "tentacle-a",
                  tentacleName: "tentacle-a",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  agentId: "tentacle-b-root",
                  label: "tentacle-b-root",
                  state: "live",
                  tentacleId: "tentacle-b",
                  tentacleName: "tentacle-b",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  agentId: "tentacle-a-root",
                  label: "tentacle-a-root",
                  state: "live",
                  tentacleId: "tentacle-a",
                  tentacleName: "tentacle-a",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/tentacles/tentacle-b") && method === "DELETE") {
        includeTentacleB = false;
        return new Response(null, { status: 204 });
      }

      return notFoundResponse();
    });

    render(<App />);

    const tentacleBColumn = await screen.findByLabelText("tentacle-b");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    expect(within(sidebar).getByLabelText("Active agents in tentacle-b")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete tentacle tentacle-b" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete confirmation for tentacle-b" });
    expect(deleteDialog).toBeInTheDocument();
    expect(within(deleteDialog).getByText("This action cannot be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete tentacle-b" }));

    await waitFor(() => {
      expect(tentacleBColumn).not.toBeInTheDocument();
      expect(within(sidebar).queryByLabelText("Active agents in tentacle-b")).toBeNull();
    });
  });

  it("closes the delete confirmation dialog with Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          agentId: "tentacle-a-root",
          label: "tentacle-a-root",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]),
    );

    render(<App />);
    await screen.findByLabelText("tentacle-a");

    fireEvent.click(screen.getByRole("button", { name: "Delete tentacle tentacle-a" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete confirmation for tentacle-a" });
    expect(deleteDialog).toBeInTheDocument();

    fireEvent.keyDown(deleteDialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Delete confirmation for tentacle-a" })).toBeNull();
  });
});
