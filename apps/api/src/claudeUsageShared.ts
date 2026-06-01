import { type ClaudeUsageSnapshot, asString } from "@sentiph/core";

export type { ClaudeUsageSnapshot };

export type ClaudeUsageStatus = ClaudeUsageSnapshot["status"];

export type ClaudeUsageDependencies = {
  now?: () => Date;
  readCredentialsJson?: () => Promise<unknown>;
  fetchImpl?: typeof fetch;
  spawnCliUsage?: () => Promise<string | null>;
  projectStateDir?: string;
  backgroundRefreshOnly?: boolean;
};

/** Like core's `asString`, but trims whitespace and rejects empty strings. */
export const asTrimmedString = (value: unknown): string | null => {
  const raw = asString(value);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const unavailableSnapshot = (
  now: Date,
  message: string,
  status: ClaudeUsageStatus = "unavailable",
): ClaudeUsageSnapshot => ({
  status,
  fetchedAt: now.toISOString(),
  source: "none",
  message,
});
