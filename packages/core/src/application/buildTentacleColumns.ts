import type { TentacleColumn } from "../domain/agent";
import type { AgentSnapshotReader } from "../ports/AgentSnapshotReader";

const byCreatedAtAscending = (a: string, b: string): number =>
  new Date(a).getTime() - new Date(b).getTime();

const getEarliestCreatedAt = (createdAtValues: string[]): string =>
  [...createdAtValues].sort(byCreatedAtAscending)[0] ?? "";

export const buildTentacleColumns = async (
  reader: AgentSnapshotReader,
): Promise<TentacleColumn[]> => {
  const snapshots = await reader.listAgentSnapshots();

  const grouped = snapshots.reduce<Map<string, typeof snapshots>>((acc, snapshot) => {
    const current = acc.get(snapshot.tentacleId) ?? [];
    current.push(snapshot);
    acc.set(snapshot.tentacleId, current);
    return acc;
  }, new Map());

  return [...grouped.entries()]
    .sort(([, left], [, right]) =>
      byCreatedAtAscending(
        getEarliestCreatedAt(left.map((agent) => agent.createdAt)),
        getEarliestCreatedAt(right.map((agent) => agent.createdAt)),
      ),
    )
    .map(([tentacleId, agents]) => {
      const tentacleName =
        agents.find(
          (agent) => typeof agent.tentacleName === "string" && agent.tentacleName.length > 0,
        )?.tentacleName ?? tentacleId;
      const orderedAgents = [...agents].sort((left, right) => {
        const leftIsRoot = left.parentAgentId === undefined;
        const rightIsRoot = right.parentAgentId === undefined;

        if (leftIsRoot !== rightIsRoot) {
          return leftIsRoot ? -1 : 1;
        }

        return byCreatedAtAscending(left.createdAt, right.createdAt);
      });

      return {
        tentacleId,
        tentacleName,
        agents: orderedAgents,
      };
    });
};
