import { describe, expect, it } from "vitest";

import { InMemoryAgentSnapshotReader } from "../src/adapters/InMemoryAgentSnapshotReader";
import { buildTentacleColumns } from "../src/application/buildTentacleColumns";

describe("buildTentacleColumns", () => {
  it("groups root and spawned agents by tentacle and keeps root first", async () => {
    const reader = new InMemoryAgentSnapshotReader([
      {
        agentId: "agent-2",
        label: "spawned-b",
        state: "live",
        tentacleId: "tentacle-a",
        createdAt: "2026-02-24T11:00:00.000Z",
        parentAgentId: "agent-1",
      },
      {
        agentId: "agent-1",
        label: "root-a",
        state: "live",
        tentacleId: "tentacle-a",
        tentacleName: "planner",
        createdAt: "2026-02-24T10:00:00.000Z",
      },
      {
        agentId: "agent-3",
        label: "root-b",
        state: "blocked",
        tentacleId: "tentacle-b",
        createdAt: "2026-02-24T10:05:00.000Z",
      },
    ]);

    const result = await buildTentacleColumns(reader);

    expect(result).toHaveLength(2);
    expect(result[0]?.tentacleId).toBe("tentacle-a");
    expect(result[0]?.tentacleName).toBe("planner");
    expect(result[0]?.agents.map((agent) => agent.agentId)).toEqual(["agent-1", "agent-2"]);
    expect(result[1]?.tentacleId).toBe("tentacle-b");
    expect(result[1]?.tentacleName).toBe("tentacle-b");
    expect(result[1]?.agents.map((agent) => agent.agentId)).toEqual(["agent-3"]);
  });
});
