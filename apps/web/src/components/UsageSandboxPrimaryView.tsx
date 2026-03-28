import { useCallback, useState } from "react";

import { buildClaudeUsageUrl } from "../runtime/runtimeEndpoints";
import { ActionButton } from "./ui/ActionButton";

type FetchResult = {
  id: number;
  timestamp: string;
  durationMs: number;
  httpStatus: number | null;
  error: string | null;
  rawBody: string | null;
  parsed: Record<string, unknown> | null;
};

let nextId = 1;

export const UsageSandboxPrimaryView = () => {
  const [results, setResults] = useState<FetchResult[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const doFetch = useCallback(async () => {
    setIsFetching(true);
    const start = performance.now();
    const entry: FetchResult = {
      id: nextId++,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      httpStatus: null,
      error: null,
      rawBody: null,
      parsed: null,
    };

    try {
      const response = await fetch(buildClaudeUsageUrl(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      entry.durationMs = Math.round(performance.now() - start);
      entry.httpStatus = response.status;
      const text = await response.text();
      entry.rawBody = text;
      try {
        entry.parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        entry.error = "Response is not valid JSON";
      }
    } catch (err) {
      entry.durationMs = Math.round(performance.now() - start);
      entry.error = err instanceof Error ? err.message : String(err);
    }

    setResults((prev) => [entry, ...prev]);
    setIsFetching(false);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  return (
    <section className="usage-sandbox-view" aria-label="Usage Sandbox">
      <div className="usage-sandbox-toolbar">
        <ActionButton
          onClick={() => {
            void doFetch();
          }}
          disabled={isFetching}
          size="compact"
          variant="info"
        >
          {isFetching ? "Fetching..." : "Fetch /api/claude/usage"}
        </ActionButton>
        {results.length > 0 && (
          <ActionButton onClick={clearResults} size="compact" variant="danger">
            Clear
          </ActionButton>
        )}
        <span className="usage-sandbox-endpoint">
          GET {buildClaudeUsageUrl()}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="usage-sandbox-empty">
          Click fetch to call the usage endpoint and inspect the response.
        </div>
      ) : (
        <div className="usage-sandbox-results">
          {results.map((r) => (
            <div key={r.id} className="usage-sandbox-entry">
              <div className="usage-sandbox-entry-header">
                <span className="usage-sandbox-entry-id">#{r.id}</span>
                <span className="usage-sandbox-entry-time">{r.timestamp}</span>
                <span
                  className="usage-sandbox-entry-status"
                  data-ok={r.httpStatus !== null && r.httpStatus >= 200 && r.httpStatus < 300 ? "true" : "false"}
                >
                  {r.httpStatus !== null ? `HTTP ${r.httpStatus}` : "NETWORK ERROR"}
                </span>
                <span className="usage-sandbox-entry-duration">{r.durationMs}ms</span>
              </div>

              {r.error && (
                <div className="usage-sandbox-entry-error">{r.error}</div>
              )}

              {r.parsed && (
                <div className="usage-sandbox-entry-fields">
                  <table className="usage-sandbox-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(r.parsed).map(([key, value]) => (
                        <tr key={key}>
                          <td className="usage-sandbox-field-key">{key}</td>
                          <td className="usage-sandbox-field-value">
                            {typeof value === "object" && value !== null
                              ? JSON.stringify(value, null, 2)
                              : String(value ?? "null")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <details className="usage-sandbox-raw">
                <summary>Raw response</summary>
                <pre>{r.rawBody ?? "(empty)"}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
