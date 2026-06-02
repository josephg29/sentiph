/**
 * In-memory fixed-window rate limiter for the HTTP control plane.
 *
 * Limits are deliberately GENEROUS and env-overridable so legitimate fast
 * multi-agent spawning (e.g. group_leader swarms creating many child terminals
 * in a burst) is never throttled in normal use — the limiter only exists to
 * blunt pathological/abusive request floods.
 *
 * NOTE: this guards only the HTTP endpoints (`POST /api/terminals` and
 * `POST /api/terminals/:id/input`). The WebSocket data path (terminal input sent
 * over the websocket in sessionRuntime) is NOT covered by this limiter.
 */

const readPositiveIntEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Defaults: 120 terminal-creates per 60s and 600 input-writes per 10s per client.
const CREATE_LIMIT = () => readPositiveIntEnv("SENTIPH_RATELIMIT_CREATE_PER_MIN", 120);
const CREATE_WINDOW_MS = 60_000;
const INPUT_LIMIT = () => readPositiveIntEnv("SENTIPH_RATELIMIT_INPUT_PER_10S", 600);
const INPUT_WINDOW_MS = 10_000;

export type RateLimitBucket = "create" | "input";

type WindowState = { count: number; windowStart: number };

// Keyed by `${bucket}:${client}`. A missing/unknown client collapses to a shared
// global bucket so the limiter still applies when no remote address is available.
const windows = new Map<string, WindowState>();

const GLOBAL_CLIENT = "__global__";

const bucketConfig = (bucket: RateLimitBucket): { limit: number; windowMs: number } =>
  bucket === "create"
    ? { limit: CREATE_LIMIT(), windowMs: CREATE_WINDOW_MS }
    : { limit: INPUT_LIMIT(), windowMs: INPUT_WINDOW_MS };

/**
 * Records a request against the given bucket for the given client and returns
 * whether it is allowed. Returns `false` once the per-window limit is exceeded.
 */
export const checkRateLimit = (
  bucket: RateLimitBucket,
  client: string | undefined,
  now: number = Date.now(),
): boolean => {
  const { limit, windowMs } = bucketConfig(bucket);
  const key = `${bucket}:${client && client.length > 0 ? client : GLOBAL_CLIENT}`;

  const state = windows.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    windows.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (state.count >= limit) {
    return false;
  }

  state.count += 1;
  return true;
};

/** Clears all rate-limit state. Exported for test isolation. */
export const resetRateLimits = (): void => {
  windows.clear();
};
