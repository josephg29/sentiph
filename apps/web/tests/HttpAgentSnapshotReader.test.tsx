import { describe, expect, it } from "vitest";

import { HttpAgentSnapshotReader } from "../src/runtime/HttpAgentSnapshotReader";

describe("HttpAgentSnapshotReader", () => {
  it("loads snapshots and filters out malformed payload entries", async () => {
    const reader = new HttpAgentSnapshotReader({
      endpoint: "https://runtime.example.com/api/agent-snapshots",
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            agentId: "agent-1",
            label: "root-a",
            state: "live",
            tentacleId: "tentacle-a",
            tentacleName: "planner",
            createdAt: "2026-02-24T10:00:00.000Z",
          },
          {
            label: "invalid-entry",
          },
        ],
      }),
    });

    await expect(reader.listAgentSnapshots()).resolves.toEqual([
      {
        agentId: "agent-1",
        label: "root-a",
        state: "live",
        tentacleId: "tentacle-a",
        tentacleName: "planner",
        createdAt: "2026-02-24T10:00:00.000Z",
      },
    ]);
  });

  it("throws when API response is not ok", async () => {
    const reader = new HttpAgentSnapshotReader({
      endpoint: "https://runtime.example.com/api/agent-snapshots",
      fetcher: async () => ({
        ok: false,
        status: 503,
        json: async () => [],
      }),
    });

    await expect(reader.listAgentSnapshots()).rejects.toThrow(
      "Unable to load agent snapshots (503)",
    );
  });
});
