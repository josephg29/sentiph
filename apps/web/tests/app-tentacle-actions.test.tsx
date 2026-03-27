import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import {
  MockWebSocket,
  jsonResponse,
  notFoundResponse,
  resetAppTestHarness,
} from "./test-utils/appTestHarness";

describe("App terminal create/rename/delete actions", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("creates a shared-codebase terminal and refreshes columns plus sidebar listings", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        const afterCreate = fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/terminals") &&
            (calledInit?.method ?? "GET") === "POST",
        );

        return jsonResponse(
          afterCreate
            ? [
                {
                  terminalId: "terminal-1",
                  label: "terminal-1",
                  state: "live",
                  tentacleId: "tentacle-1",
                  tentacleName: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  terminalId: "terminal-2",
                  label: "terminal-2",
                  state: "live",
                  tentacleId: "tentacle-2",
                  tentacleName: "tentacle-2",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  terminalId: "terminal-1",
                  label: "terminal-1",
                  state: "live",
                  tentacleId: "tentacle-1",
                  tentacleName: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/terminals") && method === "POST") {
        return jsonResponse(
          {
            terminalId: "terminal-2",
            label: "terminal-2",
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

    await screen.findByLabelText("terminal-1");
    fireEvent.click(screen.getByRole("button", { name: "Create tentacle in main codebase" }));

    const terminalTwoColumn = await screen.findByLabelText("terminal-2");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");

    expect(terminalTwoColumn).toBeInTheDocument();
    expect(within(sidebar).getByLabelText("Terminal terminal-1")).toBeInTheDocument();
    expect(within(sidebar).getByLabelText("Terminal terminal-2")).toBeInTheDocument();
    await waitFor(() => {
      expect(MockWebSocket.instances.some((socket) => socket.url.includes("/terminal-2/ws"))).toBe(
        true,
      );
    });
  });

  it("creates an isolated-worktree terminal and starts inline editing immediately", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        const afterCreate = fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/terminals") &&
            (calledInit?.method ?? "GET") === "POST",
        );

        return jsonResponse(
          afterCreate
            ? [
                {
                  terminalId: "terminal-1",
                  label: "terminal-1",
                  state: "live",
                  tentacleId: "tentacle-1",
                  tentacleName: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  terminalId: "terminal-2",
                  label: "terminal-2",
                  state: "live",
                  tentacleId: "tentacle-2",
                  tentacleName: "tentacle-2",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  terminalId: "terminal-1",
                  label: "terminal-1",
                  state: "live",
                  tentacleId: "tentacle-1",
                  tentacleName: "tentacle-1",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/terminals") && method === "POST") {
        return jsonResponse(
          {
            terminalId: "terminal-2",
            label: "terminal-2",
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

    await screen.findByLabelText("terminal-1");
    fireEvent.click(screen.getByRole("button", { name: "Create tentacle with isolated worktree" }));

    const nameEditor = await screen.findByLabelText("Terminal name for terminal-2");
    expect(nameEditor).toHaveValue("tentacle-2");
    expect(document.activeElement).toBe(nameEditor);
    expect((nameEditor as HTMLInputElement).selectionStart).toBe(0);
    expect((nameEditor as HTMLInputElement).selectionEnd).toBe("tentacle-2".length);
  });

  it("renames an existing terminal inline from the column header", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    let tentacleName = "tentacle-a";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse([
          {
            terminalId: "terminal-a",
            label: "core-planner",
            state: "live",
            tentacleId: "tentacle-a",
            tentacleName,
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]);
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/terminals/terminal-a") && method === "PATCH") {
        expect(init?.body).toBe(JSON.stringify({ name: "research" }));
        tentacleName = "research";
        return jsonResponse({
          terminalId: "terminal-a",
          label: "core-planner",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName,
          createdAt: "2026-02-24T10:00:00.000Z",
        });
      }

      return notFoundResponse();
    });

    render(<App />);
    const terminalColumn = await screen.findByLabelText("terminal-a");
    fireEvent.click(screen.getByRole("button", { name: "Rename terminal terminal-a" }));
    const nameEditor = await within(terminalColumn).findByLabelText("Terminal name for terminal-a");
    fireEvent.change(nameEditor, { target: { value: "research" } });
    fireEvent.keyDown(nameEditor, { key: "Enter" });

    await waitFor(() => {
      expect(within(terminalColumn).getByRole("button", { name: "research" })).toBeInTheDocument();
    });
  });

  it("deletes a terminal from the header action and refreshes board and sidebar", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    let includeTerminalB = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse(
          includeTerminalB
            ? [
                {
                  terminalId: "terminal-a",
                  label: "terminal-a",
                  state: "live",
                  tentacleId: "tentacle-a",
                  tentacleName: "tentacle-a",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  terminalId: "terminal-b",
                  label: "terminal-b",
                  state: "live",
                  tentacleId: "tentacle-b",
                  tentacleName: "tentacle-b",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  terminalId: "terminal-a",
                  label: "terminal-a",
                  state: "live",
                  tentacleId: "tentacle-a",
                  tentacleName: "tentacle-a",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/terminals/terminal-b") && method === "DELETE") {
        includeTerminalB = false;
        return new Response(null, { status: 204 });
      }

      return notFoundResponse();
    });

    render(<App />);

    const terminalBColumn = await screen.findByLabelText("terminal-b");
    const sidebar = await screen.findByLabelText("Active Agents sidebar");
    expect(within(sidebar).getByLabelText("Terminal terminal-b")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete terminal terminal-b" }));
    const deletePanel = within(sidebar).getByLabelText("Delete confirmation for terminal-b");
    expect(deletePanel).toBeInTheDocument();
    expect(within(deletePanel).getByText("This action cannot be undone.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Delete confirmation for terminal-b" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete terminal-b" }));

    await waitFor(() => {
      expect(terminalBColumn).not.toBeInTheDocument();
      expect(within(sidebar).queryByLabelText("Terminal terminal-b")).toBeNull();
    });
  });

  it("closes the delete confirmation panel with Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/ui-state")) {
        return jsonResponse({ activePrimaryNav: 9 });
      }
      return jsonResponse([
        {
          terminalId: "terminal-a",
          label: "terminal-a",
          state: "live",
          tentacleId: "tentacle-a",
          tentacleName: "tentacle-a",
          createdAt: "2026-02-24T10:00:00.000Z",
        },
      ]);
    });

    render(<App />);
    await screen.findByLabelText("terminal-a");
    const sidebar = screen.getByLabelText("Active Agents sidebar");

    fireEvent.click(screen.getByRole("button", { name: "Delete terminal terminal-a" }));
    const deletePanel = within(sidebar).getByLabelText("Delete confirmation for terminal-a");
    expect(deletePanel).toBeInTheDocument();
    expect(
      within(deletePanel).getByRole("button", { name: "Close sidebar action panel" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(deletePanel, { key: "Escape" });
    expect(screen.queryByLabelText("Delete confirmation for terminal-a")).toBeNull();
  });

  it("shows git actions for worktree terminals and commits with user message", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse([
          {
            terminalId: "terminal-a",
            label: "terminal-a",
            state: "live",
            tentacleId: "tentacle-a",
            tentacleName: "tentacle-a",
            workspaceMode: "shared",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
          {
            terminalId: "terminal-b",
            label: "terminal-b",
            state: "live",
            tentacleId: "tentacle-b",
            tentacleName: "tentacle-b",
            workspaceMode: "worktree",
            createdAt: "2026-02-24T10:05:00.000Z",
          },
        ]);
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/tentacles/tentacle-b/git/status") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-b",
          workspaceMode: "worktree",
          branchName: "octogent/tentacle-b",
          upstreamBranchName: "origin/octogent/tentacle-b",
          isDirty: true,
          aheadCount: 1,
          behindCount: 0,
          hasConflicts: false,
          changedFiles: ["apps/web/src/App.tsx"],
          defaultBaseBranchName: "main",
        });
      }

      if (url.endsWith("/api/tentacles/tentacle-b/git/commit") && method === "POST") {
        expect(init?.body).toBe(JSON.stringify({ message: "feat: ship worktree git menu" }));
        return jsonResponse({
          tentacleId: "tentacle-b",
          workspaceMode: "worktree",
          branchName: "octogent/tentacle-b",
          upstreamBranchName: "origin/octogent/tentacle-b",
          isDirty: false,
          aheadCount: 2,
          behindCount: 0,
          hasConflicts: false,
          changedFiles: [],
          defaultBaseBranchName: "main",
        });
      }

      return notFoundResponse();
    });

    render(<App />);

    await screen.findByLabelText("terminal-b");
    const sidebar = screen.getByLabelText("Active Agents sidebar");
    expect(screen.queryByRole("button", { name: "Open git actions for terminal-a" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open git actions for terminal-b" }));

    const gitPanel = await within(sidebar).findByLabelText("Git actions for tentacle-b");
    expect(screen.queryByRole("dialog", { name: "Git actions for tentacle-b" })).toBeNull();
    expect(
      within(gitPanel).getByRole("button", { name: "Close sidebar action panel" }),
    ).toBeInTheDocument();
    expect(within(gitPanel).getByText("octogent/tentacle-b")).toBeInTheDocument();
    const commitInput = within(gitPanel).getByLabelText("Commit message for tentacle-b");
    fireEvent.change(commitInput, { target: { value: "feat: ship worktree git menu" } });
    fireEvent.click(within(gitPanel).getByRole("button", { name: "Commit changes" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/tentacles/tentacle-b/git/commit") &&
            (calledInit?.method ?? "GET") === "POST",
        ),
      ).toBe(true);
    });
  });

  it("merges existing pull requests from worktree git actions dialog", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse([
          {
            terminalId: "terminal-pr",
            label: "terminal-pr",
            state: "live",
            tentacleId: "tentacle-pr",
            tentacleName: "tentacle-pr",
            workspaceMode: "worktree",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]);
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/tentacles/tentacle-pr/git/status") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-pr",
          workspaceMode: "worktree",
          branchName: "octogent/tentacle-pr",
          upstreamBranchName: "origin/octogent/tentacle-pr",
          isDirty: false,
          aheadCount: 1,
          behindCount: 0,
          hasConflicts: false,
          changedFiles: [],
          defaultBaseBranchName: "main",
        });
      }

      if (url.endsWith("/api/tentacles/tentacle-pr/git/pr") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-pr",
          workspaceMode: "worktree",
          status: "open",
          number: 215,
          url: "https://github.com/hesamsheikh/octogent/pull/215",
          title: "feat: add PR lifecycle actions",
          baseRef: "main",
          headRef: "octogent/tentacle-pr",
          isDraft: false,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        });
      }

      if (url.endsWith("/api/tentacles/tentacle-pr/git/pr/merge") && method === "POST") {
        return jsonResponse({
          tentacleId: "tentacle-pr",
          workspaceMode: "worktree",
          status: "merged",
          number: 215,
          url: "https://github.com/hesamsheikh/octogent/pull/215",
          title: "feat: add PR lifecycle actions",
          baseRef: "main",
          headRef: "octogent/tentacle-pr",
          isDraft: false,
          mergeable: "UNKNOWN",
          mergeStateStatus: "MERGED",
        });
      }

      return notFoundResponse();
    });

    render(<App />);

    const terminalColumn = await screen.findByLabelText("terminal-pr");
    const sidebar = screen.getByLabelText("Active Agents sidebar");
    fireEvent.click(screen.getByRole("button", { name: "Open git actions for terminal-pr" }));

    const gitPanel = await within(sidebar).findByLabelText("Git actions for tentacle-pr");
    expect(
      within(gitPanel).getByRole("button", { name: "Open pull request in GitHub" }),
    ).toBeEnabled();

    fireEvent.click(within(gitPanel).getByRole("button", { name: "Merge pull request" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([calledUrl, calledInit]) =>
            String(calledUrl).endsWith("/api/tentacles/tentacle-pr/git/pr/merge") &&
            (calledInit?.method ?? "GET") === "POST",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(within(terminalColumn).getByText("PR MERGED #215")).toBeInTheDocument();
    });
  });

  it("shows explicit disable reasons for blocked git actions", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse([
          {
            terminalId: "terminal-blocked",
            label: "terminal-blocked",
            state: "live",
            tentacleId: "tentacle-blocked",
            tentacleName: "tentacle-blocked",
            workspaceMode: "worktree",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
        ]);
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/tentacles/tentacle-blocked/git/status") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-blocked",
          workspaceMode: "worktree",
          branchName: "octogent/tentacle-blocked",
          upstreamBranchName: "origin/octogent/tentacle-blocked",
          isDirty: true,
          aheadCount: 0,
          behindCount: 0,
          hasConflicts: false,
          changedFiles: ["apps/web/src/App.tsx"],
          defaultBaseBranchName: "main",
        });
      }

      if (url.endsWith("/api/tentacles/tentacle-blocked/git/pr") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-blocked",
          workspaceMode: "worktree",
          status: "open",
          number: 219,
          url: "https://github.com/hesamsheikh/octogent/pull/219",
          title: "feat: blocked lifecycle",
          baseRef: "main",
          headRef: "octogent/tentacle-blocked",
          isDraft: false,
          mergeable: "CONFLICTING",
          mergeStateStatus: "DIRTY",
        });
      }

      return notFoundResponse();
    });

    render(<App />);

    await screen.findByLabelText("terminal-blocked");
    const sidebar = screen.getByLabelText("Active Agents sidebar");
    fireEvent.click(screen.getByRole("button", { name: "Open git actions for terminal-blocked" }));

    const gitPanel = await within(sidebar).findByLabelText("Git actions for tentacle-blocked");
    fireEvent.click(within(gitPanel).getByRole("button", { name: "Open commit options" }));
    expect(within(gitPanel).getByRole("button", { name: "Commit changes" })).toBeDisabled();
    expect(within(gitPanel).getByRole("menuitem", { name: "Sync with Base" })).toBeDisabled();
    expect(within(gitPanel).getByRole("button", { name: "Merge pull request" })).toBeDisabled();

    expect(
      within(gitPanel).getByText("Commit blocked: enter a commit message."),
    ).toBeInTheDocument();
    expect(
      within(gitPanel).getByText("Sync blocked: worktree has uncommitted changes."),
    ).toBeInTheDocument();
    expect(
      within(gitPanel).getByText("Merge blocked: pull request has merge conflicts."),
    ).toBeInTheDocument();
  });

  it("requires explicit confirmation before cleanup of a worktree terminal", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    let includeWorktreeTerminal = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/terminal-snapshots") && method === "GET") {
        return jsonResponse(
          includeWorktreeTerminal
            ? [
                {
                  terminalId: "terminal-main",
                  label: "terminal-main",
                  state: "live",
                  tentacleId: "tentacle-main",
                  tentacleName: "tentacle-main",
                  workspaceMode: "shared",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
                {
                  terminalId: "terminal-wt",
                  label: "terminal-wt",
                  state: "live",
                  tentacleId: "tentacle-wt",
                  tentacleName: "tentacle-wt",
                  workspaceMode: "worktree",
                  createdAt: "2026-02-24T10:05:00.000Z",
                },
              ]
            : [
                {
                  terminalId: "terminal-main",
                  label: "terminal-main",
                  state: "live",
                  tentacleId: "tentacle-main",
                  tentacleName: "tentacle-main",
                  workspaceMode: "shared",
                  createdAt: "2026-02-24T10:00:00.000Z",
                },
              ],
        );
      }

      if (url.endsWith("/api/ui-state") && method === "GET") {
        return jsonResponse({ activePrimaryNav: 9 });
      }

      if (url.endsWith("/api/tentacles/tentacle-wt/git/status") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-wt",
          workspaceMode: "worktree",
          branchName: "octogent/tentacle-wt",
          upstreamBranchName: "origin/octogent/tentacle-wt",
          isDirty: false,
          aheadCount: 0,
          behindCount: 0,
          hasConflicts: false,
          changedFiles: [],
          defaultBaseBranchName: "main",
        });
      }

      if (url.endsWith("/api/tentacles/tentacle-wt/git/pr") && method === "GET") {
        return jsonResponse({
          tentacleId: "tentacle-wt",
          workspaceMode: "worktree",
          status: "none",
          number: null,
          url: null,
          title: null,
          baseRef: null,
          headRef: null,
          isDraft: null,
          mergeable: null,
          mergeStateStatus: null,
        });
      }

      if (url.endsWith("/api/terminals/terminal-wt") && method === "DELETE") {
        includeWorktreeTerminal = false;
        return new Response(null, { status: 204 });
      }

      return notFoundResponse();
    });

    render(<App />);

    await screen.findByLabelText("terminal-wt");
    const sidebar = screen.getByLabelText("Active Agents sidebar");
    fireEvent.click(screen.getByRole("button", { name: "Open git actions for terminal-wt" }));

    const gitPanel = await within(sidebar).findByLabelText("Git actions for tentacle-wt");
    fireEvent.click(within(gitPanel).getByRole("button", { name: "Cleanup worktree" }));

    const deleteDialog = await within(sidebar).findByLabelText(
      "Delete confirmation for terminal-wt",
    );
    expect(
      within(deleteDialog).getByText(
        "This action removes the worktree directory and local branch.",
      ),
    ).toBeInTheDocument();

    const confirmButton = within(deleteDialog).getByRole("button", {
      name: "Confirm delete terminal-wt",
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(within(deleteDialog).getByLabelText("Type tentacle ID to confirm cleanup"), {
      target: { value: "terminal-wt" },
    });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.queryByLabelText("terminal-wt")).toBeNull();
    });
  });
});
