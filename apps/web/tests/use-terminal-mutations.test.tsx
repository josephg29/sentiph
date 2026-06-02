import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTerminalMutations } from "../src/app/hooks/useTerminalMutations";
import type { TerminalView } from "../src/app/types";
import { jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

const makeDeps = () => ({
  readColumns: vi.fn(async (): Promise<TerminalView> => []),
  setColumns: vi.fn(),
  setLoadError: vi.fn(),
  setMinimizedTerminalIds: vi.fn(),
});

afterEach(() => {
  resetAppTestHarness();
});

describe("useTerminalMutations", () => {
  it("creates a terminal via POST /api/terminals and refreshes columns", async () => {
    const deps = makeDeps();
    const created = {
      terminalId: "t-new",
      label: "t-new",
      state: "live",
      tentacleId: "x",
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies TerminalView[number];
    deps.readColumns.mockResolvedValue([created]);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ terminalId: "t-new", tentacleName: "t-new" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTerminalMutations(deps));
    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.createTerminal("shared", undefined, "x");
    });

    expect(returned).toBe("t-new");
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe("/api/terminals");
    expect(firstCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(firstCall?.[1]?.body))).toMatchObject({
      workspaceMode: "shared",
      tentacleId: "x",
    });
    expect(deps.setColumns).toHaveBeenCalledWith([created]);
  });

  it("PATCHes a rename and surfaces the empty-name error", async () => {
    const deps = makeDeps();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTerminalMutations(deps));

    act(() => {
      result.current.setTerminalNameDraft("   ");
    });
    await act(async () => {
      await result.current.submitTerminalRename("t1", "old");
    });
    expect(deps.setLoadError).toHaveBeenCalledWith("Terminal name cannot be empty.");
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      result.current.setTerminalNameDraft("new-name");
    });
    await act(async () => {
      await result.current.submitTerminalRename("t1", "old");
    });
    const patchCall = fetchMock.mock.calls[0];
    expect(patchCall?.[0]).toBe("/api/terminals/t1");
    expect(patchCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ name: "new-name" });
  });

  it("queues a pending delete then DELETEs on confirm", async () => {
    const deps = makeDeps();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTerminalMutations(deps));
    act(() => {
      result.current.requestDeleteTerminal("t9", "Agent 9", { intent: "delete-terminal" });
    });
    expect(result.current.pendingDeleteTerminal).toMatchObject({
      terminalId: "t9",
      tentacleName: "Agent 9",
    });

    await act(async () => {
      await result.current.confirmDeleteTerminal();
    });
    const deleteCall = fetchMock.mock.calls[0];
    expect(deleteCall?.[0]).toBe("/api/terminals/t9");
    expect(deleteCall?.[1]?.method).toBe("DELETE");
    expect(result.current.pendingDeleteTerminal).toBeNull();
  });

  it("sets loadError when terminal creation fails", async () => {
    const deps = makeDeps();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "nope" }, 500)),
    );

    const { result } = renderHook(() => useTerminalMutations(deps));
    await act(async () => {
      await result.current.createTerminal("shared");
    });
    expect(deps.setLoadError).toHaveBeenCalledWith("Unable to create a new terminal.");
  });
});
