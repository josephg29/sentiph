import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTerminalStateReconciliation } from "../src/app/hooks/useTerminalStateReconciliation";
import type { TerminalView } from "../src/app/types";

const columns = [
  {
    terminalId: "a",
    label: "a",
    state: "live",
    tentacleId: "x",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    terminalId: "b",
    label: "b",
    state: "live",
    tentacleId: "x",
    createdAt: "2026-01-01T00:01:00.000Z",
  },
] satisfies TerminalView;

describe("useTerminalStateReconciliation", () => {
  it("reports the active terminal id set and prunes stale minimized ids", () => {
    const setMinimizedTerminalIds = vi.fn();
    const onActiveTerminalIdsChange = vi.fn();

    renderHook(() =>
      useTerminalStateReconciliation({
        columns,
        setMinimizedTerminalIds,
        onActiveTerminalIdsChange,
      }),
    );

    expect(onActiveTerminalIdsChange).toHaveBeenCalledTimes(1);
    const activeSet = onActiveTerminalIdsChange.mock.calls[0]?.[0] as ReadonlySet<string>;
    expect([...activeSet].sort()).toEqual(["a", "b"]);

    // setMinimizedTerminalIds is called with an updater that drops ids no longer active.
    const updater = setMinimizedTerminalIds.mock.calls[0]?.[0] as (current: string[]) => string[];
    expect(updater(["a", "gone"])).toEqual(["a"]);
  });
});
