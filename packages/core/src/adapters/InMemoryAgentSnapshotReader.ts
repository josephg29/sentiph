import type { AgentSnapshot } from "../domain/agent";
import type { AgentSnapshotReader } from "../ports/AgentSnapshotReader";

export class InMemoryAgentSnapshotReader implements AgentSnapshotReader {
  constructor(private readonly snapshots: AgentSnapshot[]) {}

  async listAgentSnapshots(): Promise<AgentSnapshot[]> {
    return this.snapshots;
  }
}
