/**
 * Centralized query-string parameter validation. Each helper returns the
 * project-wide `{ value, error }` convention: `error` is a user-facing message
 * (non-null on failure) and `value` is the parsed result (null/default on failure).
 * No external validation library — Node + hand-rolled checks only.
 */

export type ParseResult<T> = {
  value: T;
  error: string | null;
};

/**
 * Reads a required, non-empty (after trim) string param. Returns `missingMessage`
 * when the param is absent or blank.
 */
export const parseRequiredString = (
  params: URLSearchParams,
  key: string,
  missingMessage: string,
): ParseResult<string | null> => {
  const raw = params.get(key) ?? "";
  if (raw.trim().length === 0) {
    return { value: null, error: missingMessage };
  }
  return { value: raw, error: null };
};

type ParseEnumOptions<T extends string> = {
  default?: T;
  invalidMessage?: string;
};

/**
 * Reads a param constrained to `allowed`. When the param is absent it falls back
 * to `options.default` (with no error). When present-but-invalid it returns
 * `options.invalidMessage` if supplied, otherwise falls back to the default.
 */
export const parseEnum = <T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  options: ParseEnumOptions<T> = {},
): ParseResult<T | null> => {
  const raw = params.get(key);
  if (raw === null) {
    return { value: options.default ?? null, error: null };
  }
  if ((allowed as readonly string[]).includes(raw)) {
    return { value: raw as T, error: null };
  }
  if (options.invalidMessage !== undefined) {
    return { value: null, error: options.invalidMessage };
  }
  return { value: options.default ?? null, error: null };
};

type ParseBoundedIntOptions = {
  min: number;
  max: number;
  default: number;
};

/**
 * Reads an integer param clamped to `[min, max]`. Mirrors the existing
 * `Number.parseInt(raw, 10) || default` semantics: an absent param OR a NaN parse
 * falls back to `default` BEFORE clamping. Always succeeds (error is always null).
 */
export const parseBoundedInt = (
  params: URLSearchParams,
  key: string,
  options: ParseBoundedIntOptions,
): ParseResult<number> => {
  const raw = params.get(key);
  if (raw === null) {
    return { value: options.default, error: null };
  }
  const parsed = Number.parseInt(raw, 10) || options.default;
  const clamped = Math.max(options.min, Math.min(options.max, parsed));
  return { value: clamped, error: null };
};
