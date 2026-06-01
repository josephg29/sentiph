import { describe, expect, it } from "vitest";

import { InMemoryTerminalSnapshotReader } from "../src/adapters/InMemoryTerminalSnapshotReader";
import type { TerminalSnapshot } from "../src/domain/terminal";

const makeSnapshot = (
  overrides: Partial<TerminalSnapshot> & Pick<TerminalSnapshot, "terminalId">,
): TerminalSnapshot => ({
  terminalId: overrides.terminalId,
  label: overrides.label ?? overrides.terminalId,
  state: overrides.state ?? "live",
  tentacleId: overrides.tentacleId ?? "default",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("InMemoryTerminalSnapshotReader", () => {
  describe("listTerminalSnapshots", () => {
    it("returns an empty array when constructed with no snapshots", async () => {
      const reader = new InMemoryTerminalSnapshotReader([]);
      const result = await reader.listTerminalSnapshots();
      expect(result).toEqual([]);
    });

    it("returns a single snapshot", async () => {
      const snapshot = makeSnapshot({ terminalId: "t-1" });
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(snapshot);
    });

    it("returns multiple snapshots in insertion order", async () => {
      const snapshots = [
        makeSnapshot({ terminalId: "t-1" }),
        makeSnapshot({ terminalId: "t-2" }),
        makeSnapshot({ terminalId: "t-3" }),
      ];
      const reader = new InMemoryTerminalSnapshotReader(snapshots);
      const result = await reader.listTerminalSnapshots();
      expect(result).toHaveLength(3);
      expect(result.map((s) => s.terminalId)).toEqual(["t-1", "t-2", "t-3"]);
    });

    it("preserves all fields on a fully-populated snapshot", async () => {
      const snapshot: TerminalSnapshot = {
        terminalId: "t-full",
        label: "Full Terminal",
        state: "live",
        tentacleId: "backend",
        tentacleName: "Backend Agent",
        color: "#ff0000",
        workspaceMode: "worktree",
        createdAt: "2026-01-15T12:00:00.000Z",
        hasUserPrompt: true,
        parentTerminalId: "t-parent",
        agentRuntimeState: "processing",
        agentStateChangedAt: "2026-01-15T12:01:00.000Z",
        lifecycleState: "running",
        lifecycleReason: "started",
        lifecycleUpdatedAt: "2026-01-15T12:00:30.000Z",
        processId: 12345,
        startedAt: "2026-01-15T12:00:05.000Z",
        endedAt: undefined,
        exitCode: undefined,
        exitSignal: undefined,
      };
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result[0]).toEqual(snapshot);
    });

    it("returns the same array reference each call (idempotent reads)", async () => {
      const snapshots = [makeSnapshot({ terminalId: "t-1" })];
      const reader = new InMemoryTerminalSnapshotReader(snapshots);
      const first = await reader.listTerminalSnapshots();
      const second = await reader.listTerminalSnapshots();
      expect(first).toEqual(second);
    });

    it("returns snapshot with 'blocked' state", async () => {
      const snapshot = makeSnapshot({ terminalId: "t-blocked", state: "blocked" });
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result[0]?.state).toBe("blocked");
    });

    it("returns snapshot with 'stopped' state", async () => {
      const snapshot = makeSnapshot({ terminalId: "t-stopped", state: "stopped" });
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result[0]?.state).toBe("stopped");
    });

    it("returns snapshot with 'exited' state and exit code", async () => {
      const snapshot = makeSnapshot({ terminalId: "t-exited", state: "exited", exitCode: 1 });
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result[0]?.state).toBe("exited");
      expect(result[0]?.exitCode).toBe(1);
    });

    it("returns snapshot with 'shared' workspaceMode", async () => {
      const snapshot = makeSnapshot({ terminalId: "t-shared", workspaceMode: "shared" });
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result[0]?.workspaceMode).toBe("shared");
    });

    it("returns snapshot where optional fields are undefined when not provided", async () => {
      const snapshot = makeSnapshot({ terminalId: "t-minimal" });
      const reader = new InMemoryTerminalSnapshotReader([snapshot]);
      const result = await reader.listTerminalSnapshots();
      expect(result[0]?.tentacleName).toBeUndefined();
      expect(result[0]?.workspaceMode).toBeUndefined();
      expect(result[0]?.color).toBeUndefined();
      expect(result[0]?.parentTerminalId).toBeUndefined();
    });

    it("handles large numbers of snapshots", async () => {
      const count = 1000;
      const snapshots = Array.from({ length: count }, (_, i) =>
        makeSnapshot({ terminalId: `t-${i}` }),
      );
      const reader = new InMemoryTerminalSnapshotReader(snapshots);
      const result = await reader.listTerminalSnapshots();
      expect(result).toHaveLength(count);
      expect(result[0]?.terminalId).toBe("t-0");
      expect(result[count - 1]?.terminalId).toBe(`t-${count - 1}`);
    });
  });
});
