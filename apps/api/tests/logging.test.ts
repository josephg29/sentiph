import { afterEach, describe, expect, it, vi } from "vitest";

import { isVerboseLoggingEnabled, logError, logVerbose, logWarn } from "../src/logging";

describe("logging", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps verbose logs disabled by default", () => {
    vi.stubEnv("SENTIPH_VERBOSE_LOGS", undefined);

    expect(isVerboseLoggingEnabled()).toBe(false);
  });

  it("enables verbose logs when SENTIPH_VERBOSE_LOGS=1", () => {
    vi.stubEnv("SENTIPH_VERBOSE_LOGS", "1");

    expect(isVerboseLoggingEnabled()).toBe(true);
  });

  it("only writes verbose logs when enabled", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logVerbose("hidden");
    vi.stubEnv("SENTIPH_VERBOSE_LOGS", "1");
    logVerbose("shown");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith("shown");
  });

  describe("logError", () => {
    it("always emits a one-line summary for an Error", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      logError("[scope]", new Error("boom"));

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith("[scope]: boom");
    });

    it("stringifies non-Error values", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      logError("[scope]", "plain string");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith("[scope]: plain string");
    });

    it("also logs the stack trace when verbose logging is enabled", () => {
      vi.stubEnv("SENTIPH_VERBOSE_LOGS", "1");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("boom");

      logError("[scope]", error);

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, "[scope]: boom");
      expect(consoleSpy).toHaveBeenNthCalledWith(2, error.stack);
    });
  });

  describe("logWarn", () => {
    it("stays silent when verbose logging is disabled", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      logWarn("hidden");

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("writes when verbose logging is enabled", () => {
      vi.stubEnv("SENTIPH_VERBOSE_LOGS", "1");
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      logWarn("shown");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith("shown");
    });
  });
});
