import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_USAGE_BETA_HEADER = "oauth-2025-04-20";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toResetIso = (value: unknown): string | null => {
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  const numberValue = asNumber(value);
  if (numberValue === null) {
    return null;
  }

  const milliseconds = numberValue >= 1_000_000_000_000 ? numberValue : numberValue * 1000;
  return new Date(milliseconds).toISOString();
};

type ClaudeUsageStatus = "ok" | "unavailable" | "error";

export type ClaudeUsageSnapshot = {
  status: ClaudeUsageStatus;
  fetchedAt: string;
  source: "oauth-api" | "none";
  message?: string;
  planType?: string | null;
  primaryUsedPercent?: number | null;
  primaryResetAt?: string | null;
  secondaryUsedPercent?: number | null;
  secondaryResetAt?: string | null;
  sonnetUsedPercent?: number | null;
  sonnetResetAt?: string | null;
};

type ClaudeOauthCredentials = {
  accessToken: string;
  scopes: string[];
};

export type ClaudeUsageDependencies = {
  now?: () => Date;
  readFileText?: (path: string) => Promise<string>;
  fetchImpl?: typeof fetch;
};

const unavailableSnapshot = (
  now: Date,
  message: string,
  status: ClaudeUsageStatus = "unavailable",
): ClaudeUsageSnapshot => ({
  status,
  fetchedAt: now.toISOString(),
  source: "none",
  message,
});

const normalizeScopes = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => item !== null);
  }

  const scopeString = asString(value);
  if (!scopeString) {
    return [];
  }

  return scopeString
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const readClaudeOauthCredentials = (credentialsJson: unknown): ClaudeOauthCredentials | null => {
  const record = asRecord(credentialsJson);
  if (!record) {
    return null;
  }

  const oauth = asRecord(record.claudeAiOauth ?? record.claude_ai_oauth);
  if (!oauth) {
    return null;
  }

  const accessToken = asString(oauth.accessToken ?? oauth.access_token);
  if (!accessToken) {
    return null;
  }

  const scopes = normalizeScopes(oauth.scopes ?? oauth.scope);

  return {
    accessToken,
    scopes,
  };
};

const resolveUsageWindow = (
  usagePayload: Record<string, unknown>,
  key: "five_hour" | "seven_day" | "seven_day_sonnet" | "seven_day_opus",
): Record<string, unknown> | null => {
  const directWindow = asRecord(usagePayload[key]);
  if (directWindow) {
    return directWindow;
  }

  const rateLimits = asRecord(usagePayload.rate_limits ?? usagePayload.rateLimits);
  return asRecord(rateLimits?.[key]);
};

const mapUsageSnapshot = (usageJson: unknown, now: Date): ClaudeUsageSnapshot => {
  const usagePayload = asRecord(usageJson);
  if (!usagePayload) {
    throw new Error("invalid_usage_payload");
  }

  const primaryWindow = resolveUsageWindow(usagePayload, "five_hour");
  const weeklyWindow =
    resolveUsageWindow(usagePayload, "seven_day") ??
    resolveUsageWindow(usagePayload, "seven_day_opus");
  const sonnetWindow = resolveUsageWindow(usagePayload, "seven_day_sonnet");

  return {
    status: "ok",
    fetchedAt: now.toISOString(),
    source: "oauth-api",
    planType: asString(usagePayload.plan_type ?? usagePayload.planType),
    primaryUsedPercent: asNumber(primaryWindow?.used_percent ?? primaryWindow?.usedPercent),
    primaryResetAt: toResetIso(
      primaryWindow?.reset_at ?? primaryWindow?.resetAt ?? primaryWindow?.resets_at,
    ),
    secondaryUsedPercent: asNumber(weeklyWindow?.used_percent ?? weeklyWindow?.usedPercent),
    secondaryResetAt: toResetIso(
      weeklyWindow?.reset_at ?? weeklyWindow?.resetAt ?? weeklyWindow?.resets_at,
    ),
    sonnetUsedPercent: asNumber(sonnetWindow?.used_percent ?? sonnetWindow?.usedPercent),
    sonnetResetAt: toResetIso(
      sonnetWindow?.reset_at ?? sonnetWindow?.resetAt ?? sonnetWindow?.resets_at,
    ),
  };
};

export const readClaudeUsageSnapshot = async (
  dependencies: ClaudeUsageDependencies = {},
): Promise<ClaudeUsageSnapshot> => {
  const now = dependencies.now?.() ?? new Date();
  const readFileText = dependencies.readFileText ?? ((path: string) => readFile(path, "utf8"));
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  let credentialsText: string;
  try {
    credentialsText = await readFileText(CLAUDE_CREDENTIALS_PATH);
  } catch (error) {
    const errorCode =
      typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (errorCode === "ENOENT") {
      return unavailableSnapshot(
        now,
        "Claude credentials not found at ~/.claude/.credentials.json. Run `claude login`.",
      );
    }
    return unavailableSnapshot(now, "Unable to read Claude credentials file.", "error");
  }

  let credentialsJson: unknown;
  try {
    credentialsJson = JSON.parse(credentialsText) as unknown;
  } catch {
    return unavailableSnapshot(now, "Claude credentials file is not valid JSON.", "error");
  }

  const oauthCredentials = readClaudeOauthCredentials(credentialsJson);
  if (!oauthCredentials) {
    return unavailableSnapshot(
      now,
      "Claude OAuth access token is missing in ~/.claude/.credentials.json. Re-run `claude login`.",
    );
  }

  if (!oauthCredentials.scopes.includes("user:profile")) {
    return unavailableSnapshot(
      now,
      "Claude OAuth credentials are missing the required `user:profile` scope. Re-run `claude login`.",
    );
  }

  try {
    const usageResponse = await fetchImpl(CLAUDE_OAUTH_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${oauthCredentials.accessToken}`,
        "anthropic-beta": CLAUDE_OAUTH_USAGE_BETA_HEADER,
      },
    });

    if (usageResponse.status === 401 || usageResponse.status === 403) {
      return unavailableSnapshot(
        now,
        "Claude OAuth token is expired or unauthorized. Re-run `claude login`.",
      );
    }

    if (!usageResponse.ok) {
      return unavailableSnapshot(
        now,
        `Claude OAuth usage request failed (HTTP ${usageResponse.status}).`,
        "error",
      );
    }

    const usageJson = (await usageResponse.json()) as unknown;
    return mapUsageSnapshot(usageJson, now);
  } catch {
    return unavailableSnapshot(now, "Unable to read Claude usage from OAuth API.", "error");
  }
};
