/**
 * Narrows `value` to a plain object record, explicitly rejecting `null` and arrays
 * (both pass `typeof value === "object"` without this guard).
 */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/**
 * Returns `value` as a finite number, or null. Coerces numeric strings (e.g. `"42"`).
 * Rejects `Infinity`, `-Infinity`, and `NaN`.
 */
export const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};
