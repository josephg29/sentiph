import type { AgentSnapshot, AgentSnapshotReader, AgentState } from "@octogent/core";

type HttpResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type HttpRequestInit = {
  method: "GET";
  headers: Record<string, string>;
  signal?: AbortSignal | null;
};

type HttpFetcher = (input: string, init: HttpRequestInit) => Promise<HttpResponse>;

type HttpAgentSnapshotReaderOptions = {
  endpoint: string;
  fetcher?: HttpFetcher;
  signal?: AbortSignal;
};

const isAgentState = (value: unknown): value is AgentState =>
  value === "live" || value === "idle" || value === "queued" || value === "blocked";

const isAgentSnapshot = (value: unknown): value is AgentSnapshot => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;

  return (
    typeof snapshot.agentId === "string" &&
    typeof snapshot.label === "string" &&
    isAgentState(snapshot.state) &&
    typeof snapshot.tentacleId === "string" &&
    typeof snapshot.createdAt === "string" &&
    (snapshot.parentAgentId === undefined || typeof snapshot.parentAgentId === "string")
  );
};

export class HttpAgentSnapshotReader implements AgentSnapshotReader {
  private readonly endpoint: string;
  private readonly fetcher: HttpFetcher;
  private readonly signal: AbortSignal | undefined;

  constructor({ endpoint, fetcher, signal }: HttpAgentSnapshotReaderOptions) {
    this.endpoint = endpoint;
    this.fetcher =
      fetcher ??
      ((input, init) =>
        fetch(input, {
          ...init,
          signal: init.signal ?? null,
        }));
    this.signal = signal;
  }

  async listAgentSnapshots(): Promise<AgentSnapshot[]> {
    const requestInit: HttpRequestInit = {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    };
    if (this.signal) {
      requestInit.signal = this.signal;
    }

    const response = await this.fetcher(this.endpoint, requestInit);

    if (!response.ok) {
      throw new Error(`Unable to load agent snapshots (${response.status})`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.filter(isAgentSnapshot);
  }
}
