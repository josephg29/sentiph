import { useEffect, useMemo, useState } from "react";

import type { MonitorConfigSnapshot, MonitorFeedSnapshot } from "../app/types";
import { ActionButton } from "./ui/ActionButton";

type MonitorPrimaryViewProps = {
  monitorConfig: MonitorConfigSnapshot | null;
  monitorFeed: MonitorFeedSnapshot | null;
  monitorError: string | null;
  isRefreshingMonitorFeed: boolean;
  isSavingMonitorConfig: boolean;
  onRefresh: () => void;
  onPatchConfig: (patch: {
    providerId: "x";
    queryTerms: string[];
    credentials?: {
      bearerToken?: string;
      apiKey?: string;
      apiSecret?: string;
      accessToken?: string;
      accessTokenSecret?: string;
    };
    validateCredentials: boolean;
  }) => Promise<boolean>;
};

const normalizeTermDraft = (draft: string): string[] => {
  const split = draft
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  return [...new Set(split)];
};

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "--";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const MonitorPrimaryView = ({
  monitorConfig,
  monitorFeed,
  monitorError,
  isRefreshingMonitorFeed,
  isSavingMonitorConfig,
  onRefresh,
  onPatchConfig,
}: MonitorPrimaryViewProps) => {
  const [queryTermsDraft, setQueryTermsDraft] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenSecret, setAccessTokenSecret] = useState("");

  useEffect(() => {
    if (!monitorConfig) {
      return;
    }

    setQueryTermsDraft(monitorConfig.queryTerms.join("\n"));
  }, [monitorConfig]);

  const usageCapLabel = useMemo(() => {
    if (!monitorFeed?.usage?.cap && monitorFeed?.usage?.cap !== 0) {
      return "--";
    }

    return Math.round(monitorFeed.usage.cap).toLocaleString("en-US");
  }, [monitorFeed]);

  const usageUsedLabel = useMemo(() => {
    if (!monitorFeed?.usage?.used && monitorFeed?.usage?.used !== 0) {
      return "--";
    }

    return Math.round(monitorFeed.usage.used).toLocaleString("en-US");
  }, [monitorFeed]);

  const usageRemainingLabel = useMemo(() => {
    if (!monitorFeed?.usage?.remaining && monitorFeed?.usage?.remaining !== 0) {
      return "--";
    }

    return Math.round(monitorFeed.usage.remaining).toLocaleString("en-US");
  }, [monitorFeed]);

  const credentialsSummary = monitorConfig?.providers.x.credentials;

  return (
    <section className="monitor-view" aria-label="Monitor primary view">
      <header className="monitor-header">
        <h2>X Monitor</h2>
        <div className="monitor-header-actions">
          <span className="console-status-pill" data-state={monitorFeed?.isStale ? "stale" : "fresh"}>
            {monitorFeed?.isStale ? "STALE" : "FRESH"}
          </span>
          <ActionButton
            aria-label="Refresh monitor feed"
            className="monitor-refresh"
            disabled={isRefreshingMonitorFeed}
            onClick={onRefresh}
            size="dense"
            variant="accent"
          >
            {isRefreshingMonitorFeed ? "Refreshing..." : "Refresh"}
          </ActionButton>
        </div>
      </header>

      <section className="monitor-panel-grid" aria-label="Monitor controls and status">
        <section className="monitor-panel monitor-panel--connection" aria-label="X connection settings">
          <h3>X Connection</h3>
          <label htmlFor="monitor-x-bearer-token">X bearer token</label>
          <input
            id="monitor-x-bearer-token"
            autoComplete="off"
            className="monitor-input"
            onChange={(event) => {
              setBearerToken(event.target.value);
            }}
            placeholder={credentialsSummary?.isConfigured ? "Saved token is redacted" : "Paste X bearer token"}
            type="password"
            value={bearerToken}
          />

          <div className="monitor-optional-grid">
            <div>
              <label htmlFor="monitor-x-api-key">X API key</label>
              <input
                id="monitor-x-api-key"
                autoComplete="off"
                className="monitor-input"
                onChange={(event) => {
                  setApiKey(event.target.value);
                }}
                placeholder="Optional"
                type="text"
                value={apiKey}
              />
            </div>
            <div>
              <label htmlFor="monitor-x-api-secret">X API secret</label>
              <input
                id="monitor-x-api-secret"
                autoComplete="off"
                className="monitor-input"
                onChange={(event) => {
                  setApiSecret(event.target.value);
                }}
                placeholder="Optional"
                type="password"
                value={apiSecret}
              />
            </div>
            <div>
              <label htmlFor="monitor-x-access-token">X access token</label>
              <input
                id="monitor-x-access-token"
                autoComplete="off"
                className="monitor-input"
                onChange={(event) => {
                  setAccessToken(event.target.value);
                }}
                placeholder="Optional"
                type="text"
                value={accessToken}
              />
            </div>
            <div>
              <label htmlFor="monitor-x-access-token-secret">X access token secret</label>
              <input
                id="monitor-x-access-token-secret"
                autoComplete="off"
                className="monitor-input"
                onChange={(event) => {
                  setAccessTokenSecret(event.target.value);
                }}
                placeholder="Optional"
                type="password"
                value={accessTokenSecret}
              />
            </div>
          </div>

          <ActionButton
            aria-label="Save X credentials"
            className="monitor-save"
            disabled={isSavingMonitorConfig}
            onClick={() => {
              const nextTerms = normalizeTermDraft(queryTermsDraft);
              const patchCredentials: {
                bearerToken?: string;
                apiKey?: string;
                apiSecret?: string;
                accessToken?: string;
                accessTokenSecret?: string;
              } = {};
              if (bearerToken.trim().length > 0) {
                patchCredentials.bearerToken = bearerToken.trim();
              }
              if (apiKey.trim().length > 0) {
                patchCredentials.apiKey = apiKey.trim();
              }
              if (apiSecret.trim().length > 0) {
                patchCredentials.apiSecret = apiSecret.trim();
              }
              if (accessToken.trim().length > 0) {
                patchCredentials.accessToken = accessToken.trim();
              }
              if (accessTokenSecret.trim().length > 0) {
                patchCredentials.accessTokenSecret = accessTokenSecret.trim();
              }
              const hasCredentialPatch = Object.keys(patchCredentials).length > 0;
              const patchPayload = {
                providerId: "x" as const,
                queryTerms: nextTerms,
                validateCredentials: true,
                ...(hasCredentialPatch ? { credentials: patchCredentials } : {}),
              };

              void onPatchConfig(patchPayload).then((saved) => {
                if (!saved) {
                  return;
                }

                setBearerToken("");
                setApiKey("");
                setApiSecret("");
                setAccessToken("");
                setAccessTokenSecret("");
              });
            }}
            size="dense"
            variant="primary"
          >
            {isSavingMonitorConfig ? "Saving..." : "Save X credentials"}
          </ActionButton>

          {credentialsSummary && (
            <p className="monitor-credentials-meta">
              {credentialsSummary.isConfigured
                ? `Saved · token ${credentialsSummary.bearerTokenHint ?? "(redacted)"}`
                : "Not configured"}
            </p>
          )}
        </section>

        <section className="monitor-panel monitor-panel--query" aria-label="Monitor query settings">
          <h3>Target terms</h3>
          <textarea
            aria-label="Monitor query terms"
            className="monitor-textarea"
            onChange={(event) => {
              setQueryTermsDraft(event.target.value);
            }}
            rows={6}
            value={queryTermsDraft}
          />
          <p>One per line or comma-separated. Recent search window is limited to the last 7 days.</p>
        </section>

        <section className="monitor-panel monitor-panel--status" aria-label="Monitor status metrics">
          <h3>Status</h3>
          <dl>
            <div>
              <dt>Last sync</dt>
              <dd>{formatTimestamp(monitorFeed?.lastFetchedAt ?? null)}</dd>
            </div>
            <div>
              <dt>Stale after</dt>
              <dd>{formatTimestamp(monitorFeed?.staleAfter ?? null)}</dd>
            </div>
            <div>
              <dt>Usage cap</dt>
              <dd>{usageCapLabel}</dd>
            </div>
            <div>
              <dt>Used</dt>
              <dd>{usageUsedLabel}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{usageRemainingLabel}</dd>
            </div>
            <div>
              <dt>Resets</dt>
              <dd>{formatTimestamp(monitorFeed?.usage?.resetAt ?? null)}</dd>
            </div>
          </dl>
        </section>
      </section>

      <section className="monitor-feed" aria-label="Monitor feed results">
        <header>
          <h3>Top posts by likes</h3>
          <span>{`${monitorFeed?.posts.length ?? 0} / 30`}</span>
        </header>
        {monitorError ? <p className="monitor-error">{monitorError}</p> : null}
        {monitorFeed?.lastError ? <p className="monitor-error">{monitorFeed.lastError}</p> : null}
        {monitorFeed && monitorFeed.posts.length === 0 ? (
          <p className="monitor-empty">No posts available yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Likes</th>
                <th scope="col">Author</th>
                <th scope="col">Post</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {(monitorFeed?.posts ?? []).map((post) => (
                <tr key={`${post.source}:${post.id}`}>
                  <td>{Math.round(post.likeCount).toLocaleString("en-US")}</td>
                  <td>@{post.author}</td>
                  <td>
                    <a href={post.permalink} rel="noreferrer" target="_blank">
                      {post.text}
                    </a>
                  </td>
                  <td>{formatTimestamp(post.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
};
