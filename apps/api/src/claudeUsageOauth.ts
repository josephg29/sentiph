import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { asNumber, asRecord } from "@sentiph/core";
import {
  type ClaudeUsageSnapshot,
  asTrimmedString,
  unavailableSnapshot,
} from "./claudeUsageShared";
import { toResetIso } from "./usageUtils";

const CLAUDE_CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";
const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_USAGE_BETA_HEADER = "oauth-2025-04-20";

type ClaudeOauthCredentials = {
  accessToken: string;
  scopes: string[];
  rateLimitTier: string | null;
};

const normalizeScopes = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => asTrimmedString(item))
      .filter((item): item is string => item !== null);
  }

  const scopeString = asTrimmedString(value);
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

  const accessToken = asTrimmedString(oauth.accessToken ?? oauth.access_token);
  if (!accessToken) {
    return null;
  }

  const scopes = normalizeScopes(oauth.scopes ?? oauth.scope);
  const rateLimitTier = asTrimmedString(oauth.rateLimitTier ?? oauth.rate_limit_tier);

  return {
    accessToken,
    scopes,
    rateLimitTier,
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

const readErrorMessage = (value: unknown): string | null => {
  const payload = asRecord(value);
  if (!payload) {
    return null;
  }

  const directMessage = asTrimmedString(payload.message);
  if (directMessage) {
    return directMessage;
  }

  const errorPayload = asRecord(payload.error);
  return asTrimmedString(errorPayload?.message);
};

const readUsageErrorMessage = async (response: Response): Promise<string | null> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  try {
    if (contentType.includes("application/json")) {
      return readErrorMessage((await response.json()) as unknown);
    }
    return asTrimmedString(await response.text());
  } catch {
    return null;
  }
};

const readWindowPercent = (window: Record<string, unknown> | null): number | null =>
  asNumber(window?.used_percent ?? window?.usedPercent ?? window?.utilization);

const readWindowResetAt = (window: Record<string, unknown> | null): string | null =>
  toResetIso(window?.reset_at ?? window?.resetAt ?? window?.resets_at);

const inferPlanType = (rateLimitTier: string | null): string | null => {
  const tier = rateLimitTier?.toLowerCase() ?? "";
  if (tier.includes("max")) return "Claude Max";
  if (tier.includes("pro")) return "Claude Pro";
  if (tier.includes("team")) return "Claude Team";
  if (tier.includes("enterprise")) return "Claude Enterprise";
  return null;
};

const mapUsageSnapshot = (
  usageJson: unknown,
  now: Date,
  rateLimitTier: string | null,
): ClaudeUsageSnapshot => {
  const usagePayload = asRecord(usageJson);
  if (!usagePayload) {
    throw new Error("invalid_usage_payload");
  }

  const primaryWindow = resolveUsageWindow(usagePayload, "five_hour");
  const weeklyWindow =
    resolveUsageWindow(usagePayload, "seven_day") ??
    resolveUsageWindow(usagePayload, "seven_day_opus");
  const sonnetWindow = resolveUsageWindow(usagePayload, "seven_day_sonnet");

  const extraUsage = asRecord(usagePayload.extra_usage ?? usagePayload.extraUsage);
  let extraUsageCostUsed: number | null = null;
  let extraUsageCostLimit: number | null = null;
  if (extraUsage?.is_enabled === true || extraUsage?.isEnabled === true) {
    const rawUsed = asNumber(extraUsage.used_credits ?? extraUsage.usedCredits);
    const rawLimit = asNumber(extraUsage.monthly_limit ?? extraUsage.monthlyLimit);
    if (rawUsed !== null && rawLimit !== null) {
      extraUsageCostUsed = rawUsed / 100;
      extraUsageCostLimit = rawLimit / 100;
    }
  }

  return {
    status: "ok",
    fetchedAt: now.toISOString(),
    source: "oauth-api",
    planType:
      asTrimmedString(usagePayload.plan_type ?? usagePayload.planType) ??
      inferPlanType(rateLimitTier),
    primaryUsedPercent: readWindowPercent(primaryWindow),
    primaryResetAt: readWindowResetAt(primaryWindow),
    secondaryUsedPercent: readWindowPercent(weeklyWindow),
    secondaryResetAt: readWindowResetAt(weeklyWindow),
    sonnetUsedPercent: readWindowPercent(sonnetWindow),
    sonnetResetAt: readWindowResetAt(sonnetWindow),
    extraUsageCostUsed,
    extraUsageCostLimit,
  };
};

const readKeychainCredentials = (): Promise<string | null> =>
  new Promise((resolve) => {
    if (process.platform !== "darwin") {
      resolve(null);
      return;
    }

    execFile(
      "security",
      ["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE, "-w"],
      { timeout: 5_000 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });

export const readDefaultCredentialsJson = async (): Promise<unknown> => {
  const keychainText = await readKeychainCredentials();
  if (keychainText) {
    try {
      return JSON.parse(keychainText) as unknown;
    } catch {
      // keychain data is not valid JSON, fall through to file
    }
  }

  const fileText = await readFile(CLAUDE_CREDENTIALS_PATH, "utf8");
  return JSON.parse(fileText) as unknown;
};

export const readOauthUsageSnapshot = async (
  now: Date,
  readCredentialsJson: () => Promise<unknown>,
  fetchImpl: typeof fetch,
): Promise<ClaudeUsageSnapshot> => {
  let credentialsJson: unknown;
  try {
    credentialsJson = await readCredentialsJson();
  } catch (error) {
    const errorCode =
      typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (errorCode === "ENOENT") {
      return unavailableSnapshot(now, "Claude credentials not found. Run `claude login`.");
    }
    return unavailableSnapshot(now, "Unable to read Claude credentials.", "error");
  }

  const oauthCredentials = readClaudeOauthCredentials(credentialsJson);
  if (!oauthCredentials) {
    return unavailableSnapshot(now, "Claude OAuth access token is missing. Re-run `claude login`.");
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
      const usageErrorMessage = await readUsageErrorMessage(usageResponse);
      if (usageResponse.status === 429) {
        const retryAfterSeconds = asTrimmedString(usageResponse.headers.get("retry-after"));
        const retrySuffix =
          retryAfterSeconds && retryAfterSeconds.length > 0
            ? ` Retry after ${retryAfterSeconds}s.`
            : "";
        return unavailableSnapshot(
          now,
          usageErrorMessage ?? `Claude OAuth usage API is rate limited.${retrySuffix}`,
        );
      }

      return unavailableSnapshot(
        now,
        usageErrorMessage
          ? `${usageErrorMessage} (HTTP ${usageResponse.status}).`
          : `Claude OAuth usage request failed (HTTP ${usageResponse.status}).`,
        "error",
      );
    }

    const usageJson = (await usageResponse.json()) as unknown;
    return mapUsageSnapshot(usageJson, now, oauthCredentials.rateLimitTier);
  } catch {
    return unavailableSnapshot(now, "Unable to read Claude usage from OAuth API.", "error");
  }
};
