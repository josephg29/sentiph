import type { AgentSnapshot } from "../domain/agent";

export interface AgentSnapshotReader {
  listAgentSnapshots(): Promise<AgentSnapshot[]>;
}
