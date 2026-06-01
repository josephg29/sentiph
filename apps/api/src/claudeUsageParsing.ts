const ANSI_ESCAPE = String.fromCharCode(0x1b);
const ANSI_CSI_RE = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, "gu");

export const stripAnsiCodes = (text: string): string => text.replace(ANSI_CSI_RE, "");

const PERCENT_RE = /(\d{1,3}(?:\.\d+)?)\s*%/u;

const USED_KEYWORDS = ["used", "spent", "consumed"];
const REMAINING_KEYWORDS = ["left", "remaining", "available"];
const CLI_USAGE_LABEL_GROUPS = [
  ["current session"],
  ["current week (all models)", "current week (opus)"],
  ["current week (sonnet only)", "current week (sonnet)"],
] as const;

export type ParsedCliUsage = {
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
  sonnetUsedPercent: number | null;
};

const percentFromLine = (line: string): number | null => {
  const match = PERCENT_RE.exec(line);
  if (!match) return null;

  const percentText = match[1];
  if (!percentText) return null;

  const raw = Number.parseFloat(percentText);
  const clamped = Math.max(0, Math.min(100, raw));
  const lower = line.toLowerCase();
  const contextStart = Math.max(0, match.index - 16);
  const contextEnd = Math.min(lower.length, match.index + match[0].length + 24);
  const context = lower.slice(contextStart, contextEnd);

  // "2% used" → store as 2 (already represents usage)
  if (USED_KEYWORDS.some((kw) => context.includes(kw))) {
    return Math.round(clamped * 10) / 10;
  }

  // "98% remaining" → convert to used: 100 - 98 = 2
  if (REMAINING_KEYWORDS.some((kw) => context.includes(kw))) {
    return Math.round((100 - clamped) * 10) / 10;
  }

  // Default: assume it's "used" (Claude CLI convention per screenshot)
  return Math.round(clamped * 10) / 10;
};

const normalizeCliText = (text: string): string => text.toLowerCase().replace(/\s+/gu, " ");

const findLabelMatch = (
  normalizedText: string,
  labelSubstrings: readonly string[],
): { index: number; label: string } | null => {
  let bestMatch: { index: number; label: string } | null = null;

  for (const label of labelSubstrings) {
    const index = normalizedText.indexOf(label);
    if (index === -1) continue;
    if (bestMatch === null || index < bestMatch.index) {
      bestMatch = { index, label };
    }
  }

  return bestMatch;
};

const extractLabeledPercent = (
  cleanOutput: string,
  labelSubstrings: readonly string[],
): number | null => {
  const normalizedText = normalizeCliText(cleanOutput);
  const match = findLabelMatch(normalizedText, labelSubstrings);
  if (!match) {
    return null;
  }

  const start = match.index + match.label.length;
  let end = normalizedText.length;

  for (const labels of CLI_USAGE_LABEL_GROUPS) {
    const nextMatch = findLabelMatch(normalizedText.slice(start), labels);
    if (!nextMatch) continue;
    end = Math.min(end, start + nextMatch.index);
  }

  return percentFromLine(normalizedText.slice(start, end));
};

/**
 * Parses the raw terminal output of Claude CLI's `/usage` command into structured percentages.
 * Handles two label conventions: "X% used" (stored as-is) and "X% remaining" (inverted to `100 - X`).
 * Looks for three labeled sections: "current session", "current week (all models / opus)",
 * "current week (sonnet only / sonnet)".
 * @param rawOutput raw PTY output including ANSI escape codes
 */
export const parseCliUsageOutput = (rawOutput: string): ParsedCliUsage => {
  const clean = stripAnsiCodes(rawOutput);
  const primaryUsedPercent = extractLabeledPercent(clean, ["current session"]);
  const secondaryUsedPercent = extractLabeledPercent(clean, [
    "current week (all models)",
    "current week (opus)",
  ]);
  const sonnetUsedPercent = extractLabeledPercent(clean, [
    "current week (sonnet only)",
    "current week (sonnet)",
  ]);

  return { primaryUsedPercent, secondaryUsedPercent, sonnetUsedPercent };
};
