import {
  CACHE_TTL_MS,
  cacheOkSnapshot,
  getCachedOkSnapshot,
  getCachedSnapshot,
  getRefreshInFlight,
  readPersistedOkSnapshot,
  setCachedSnapshot,
  setRefreshInFlight,
} from "./claudeUsageCache";
import { spawnDefaultCliUsage } from "./claudeUsageCli";
import { readDefaultCredentialsJson, readOauthUsageSnapshot } from "./claudeUsageOauth";
import { type ParsedCliUsage, parseCliUsageOutput, stripAnsiCodes } from "./claudeUsageParsing";
import {
  type ClaudeUsageDependencies,
  type ClaudeUsageSnapshot,
  unavailableSnapshot,
} from "./claudeUsageShared";
import { logVerbose } from "./logging";

export type { ClaudeUsageSnapshot };
export { parseCliUsageOutput, stripAnsiCodes };

/** Exported for testing — resets the snapshot cache. */
export const resetCliSession = (): void => {
  setCachedSnapshot(null);
  setRefreshInFlight(null);
};

/** Clears the cached usage snapshot so the next read triggers a fresh fetch. */
export const invalidateUsageCache = (): void => {
  setCachedSnapshot(null);
  setRefreshInFlight(null);
};

const buildCliSnapshot = (parsed: ParsedCliUsage, now: Date): ClaudeUsageSnapshot => ({
  status: "ok",
  fetchedAt: now.toISOString(),
  source: "cli-pty",
  primaryUsedPercent: parsed.primaryUsedPercent,
  secondaryUsedPercent: parsed.secondaryUsedPercent,
  sonnetUsedPercent: parsed.sonnetUsedPercent,
  primaryResetAt: null,
  secondaryResetAt: null,
  sonnetResetAt: null,
});

const cliHasRealData = (parsed: ParsedCliUsage): boolean =>
  parsed.primaryUsedPercent !== null ||
  parsed.secondaryUsedPercent !== null ||
  parsed.sonnetUsedPercent !== null;

/**
 * Fetches usage directly from the Anthropic OAuth API using the access token stored in
 * `~/.claude/.credentials.json`. Returns an "unavailable" snapshot (with a human-readable
 * message) when credentials are absent, missing the required `user:profile` scope, or
 * when the API request fails. Caches successful responses to disk.
 */
export const readClaudeOauthUsageSnapshot = async (
  dependencies: ClaudeUsageDependencies = {},
): Promise<ClaudeUsageSnapshot> => {
  const now = dependencies.now?.() ?? new Date();
  const readCredentialsJson = dependencies.readCredentialsJson ?? readDefaultCredentialsJson;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const snapshot = await readOauthUsageSnapshot(now, readCredentialsJson, fetchImpl);
  return snapshot.status === "ok"
    ? await cacheOkSnapshot(snapshot, dependencies.projectStateDir)
    : snapshot;
};

/**
 * Captures usage by spawning a PTY session, running the `/usage` command inside it,
 * and parsing the terminal output. This path reflects real Claude Code usage without
 * requiring OAuth API access, but depends on `node-pty` and the `claude` binary being present.
 */
export const readClaudeCliUsageSnapshot = async (
  dependencies: ClaudeUsageDependencies = {},
): Promise<ClaudeUsageSnapshot> => {
  const now = dependencies.now?.() ?? new Date();
  const spawnCliUsage = dependencies.spawnCliUsage ?? spawnDefaultCliUsage;
  try {
    const cliOutput = await spawnCliUsage();
    if (cliOutput) {
      const cleaned = stripAnsiCodes(cliOutput);
      logVerbose(`[claude-usage] CLI PTY captured ${cleaned.length} chars`);
      const parsed = parseCliUsageOutput(cliOutput);
      if (cliHasRealData(parsed)) {
        logVerbose(
          `[claude-usage] CLI PTY parsed: session=${parsed.primaryUsedPercent}% week=${parsed.secondaryUsedPercent}% sonnet=${parsed.sonnetUsedPercent}%`,
        );
        return await cacheOkSnapshot(buildCliSnapshot(parsed, now), dependencies.projectStateDir);
      }
      logVerbose(
        `[claude-usage] CLI PTY output had no parseable usage data. First 500 chars:\n${cleaned.slice(0, 500)}`,
      );
    } else {
      logVerbose("[claude-usage] CLI PTY returned null (binary missing or node-pty unavailable)");
    }
  } catch (error) {
    logVerbose(
      `[claude-usage] CLI PTY error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return unavailableSnapshot(now, "Claude CLI usage unavailable.", "error");
};

const refreshClaudeUsageSnapshot = async (
  dependencies: ClaudeUsageDependencies = {},
): Promise<ClaudeUsageSnapshot> => {
  const now = dependencies.now?.() ?? new Date();

  // Prefer the CLI PTY path when it works, since it reflects Claude Code
  // usage directly and avoids OAuth API rate-limit failures.
  const spawnCliUsage = dependencies.spawnCliUsage ?? spawnDefaultCliUsage;
  try {
    const cliOutput = await spawnCliUsage();
    if (cliOutput) {
      const cleaned = stripAnsiCodes(cliOutput);
      logVerbose(`[claude-usage] CLI PTY captured ${cleaned.length} chars`);
      const parsed = parseCliUsageOutput(cliOutput);
      if (cliHasRealData(parsed)) {
        logVerbose(
          `[claude-usage] CLI PTY parsed: session=${parsed.primaryUsedPercent}% week=${parsed.secondaryUsedPercent}% sonnet=${parsed.sonnetUsedPercent}%`,
        );
        return await cacheOkSnapshot(buildCliSnapshot(parsed, now), dependencies.projectStateDir);
      }
      logVerbose(
        `[claude-usage] CLI PTY output had no parseable usage data. First 500 chars:\n${cleaned.slice(0, 500)}`,
      );
    } else {
      logVerbose("[claude-usage] CLI PTY returned null (binary missing or node-pty unavailable)");
    }
  } catch (error) {
    logVerbose(
      `[claude-usage] CLI PTY error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Fall back to OAuth API when CLI does not yield usable data.
  const readCredentialsJson = dependencies.readCredentialsJson ?? readDefaultCredentialsJson;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const oauthSnapshot = await readOauthUsageSnapshot(now, readCredentialsJson, fetchImpl);

  if (oauthSnapshot.status === "ok") {
    return await cacheOkSnapshot(oauthSnapshot, dependencies.projectStateDir);
  }

  const cachedOkSnapshot = getCachedOkSnapshot();
  const oauthReachedApi =
    oauthSnapshot.source === "none" &&
    oauthSnapshot.message != null &&
    !oauthSnapshot.message.includes("not found") &&
    !oauthSnapshot.message.includes("missing") &&
    !oauthSnapshot.message.includes("Re-run");

  if (oauthReachedApi) {
    logVerbose(`[claude-usage] OAuth API responded with error: ${oauthSnapshot.message}`);
    if (cachedOkSnapshot) {
      return { ...cachedOkSnapshot, fetchedAt: now.toISOString() };
    }
    return oauthSnapshot;
  }

  if (cachedOkSnapshot) {
    logVerbose(
      `[claude-usage] OAuth unavailable (${oauthSnapshot.message}), serving stale cached snapshot`,
    );
    return { ...cachedOkSnapshot, fetchedAt: now.toISOString() };
  }

  return oauthSnapshot;
};

const startBackgroundRefresh = (dependencies: ClaudeUsageDependencies = {}): void => {
  if (getRefreshInFlight()) {
    return;
  }

  setRefreshInFlight(
    refreshClaudeUsageSnapshot(dependencies)
      .catch((error) => {
        logVerbose(
          `[claude-usage] background refresh error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return unavailableSnapshot(
          dependencies.now?.() ?? new Date(),
          "Unable to refresh Claude usage in background.",
          "error",
        );
      })
      .finally(() => {
        setRefreshInFlight(null);
      }),
  );
};

/**
 * Main entry point for reading Claude usage. Strategy:
 * 1. Return cached snapshot if it is fresh enough (prevents rate-limit storms).
 * 2. Try CLI PTY first (most accurate, direct reflection of Claude Code usage).
 * 3. Fall back to the OAuth API when CLI yields no data.
 * 4. Serve a stale cached snapshot when both live sources fail, rather than returning an error.
 */
export const readClaudeUsageSnapshot = async (
  dependencies: ClaudeUsageDependencies = {},
): Promise<ClaudeUsageSnapshot> => {
  const now = dependencies.now?.() ?? new Date();
  const backgroundRefreshOnly = dependencies.backgroundRefreshOnly ?? false;

  // Return cached snapshot if fresh enough (prevents rate-limit storms)
  const cached = getCachedSnapshot();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached.snapshot, fetchedAt: now.toISOString() };
  }

  if (!getCachedSnapshot()) {
    const persistedSnapshot = await readPersistedOkSnapshot(dependencies.projectStateDir);
    if (persistedSnapshot) {
      setCachedSnapshot({ snapshot: persistedSnapshot, fetchedAt: 0 });
    }
  }

  const cachedOkSnapshot = getCachedOkSnapshot();
  if (cachedOkSnapshot) {
    startBackgroundRefresh(dependencies);
    return { ...cachedOkSnapshot, fetchedAt: now.toISOString() };
  }

  if (backgroundRefreshOnly) {
    startBackgroundRefresh(dependencies);
    return unavailableSnapshot(now, "Claude usage refresh in progress.");
  }

  const inFlight = getRefreshInFlight();
  if (inFlight) {
    const snapshot = await inFlight;
    return snapshot.status === "ok" ? { ...snapshot, fetchedAt: now.toISOString() } : snapshot;
  }

  const refresh = refreshClaudeUsageSnapshot(dependencies)
    .catch((error) => {
      logVerbose(
        `[claude-usage] refresh error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return unavailableSnapshot(now, "Unable to refresh Claude usage.", "error");
    })
    .finally(() => {
      setRefreshInFlight(null);
    });
  setRefreshInFlight(refresh);

  const snapshot = await refresh;
  return snapshot.status === "ok" ? { ...snapshot, fetchedAt: now.toISOString() } : snapshot;
};
