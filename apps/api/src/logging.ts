const isEnabled = (value: string | undefined): boolean => value === "1";

export const isVerboseLoggingEnabled = (): boolean => isEnabled(process.env.SENTIPH_VERBOSE_LOGS);

export const logVerbose = (...args: Parameters<typeof console.log>): void => {
  if (isVerboseLoggingEnabled()) {
    console.log(...args);
  }
};

const summarizeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Always emits a one-line error summary to `console.error`. The full stack trace
 * (when available) is only logged when verbose logging is enabled, keeping normal
 * operation quiet while still surfacing that something failed.
 */
export const logError = (prefix: string, error: unknown): void => {
  console.error(`${prefix}: ${summarizeError(error)}`);
  if (isVerboseLoggingEnabled() && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
};

/** Emits a one-line warning to `console.warn` only when verbose logging is enabled. */
export const logWarn = (...args: Parameters<typeof console.warn>): void => {
  if (isVerboseLoggingEnabled()) {
    console.warn(...args);
  }
};
