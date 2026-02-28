import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildMonitorConfigUrl,
  buildMonitorFeedUrl,
  buildMonitorRefreshUrl,
} from "../../runtime/runtimeEndpoints";
import { MONITOR_SCAN_INTERVAL_MS } from "../constants";
import { normalizeMonitorConfigSnapshot, normalizeMonitorFeedSnapshot } from "../normalizers";
import type { MonitorConfigSnapshot, MonitorFeedSnapshot } from "../types";

type MonitorConfigPatchRequest = {
  providerId?: "x";
  queryTerms?: string[];
  refreshPolicy?: {
    maxCacheAgeMs?: number;
  };
  credentials?: {
    bearerToken?: string;
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    accessTokenSecret?: string;
  };
  validateCredentials?: boolean;
};

type UseMonitorRuntimeResult = {
  monitorConfig: MonitorConfigSnapshot | null;
  monitorFeed: MonitorFeedSnapshot | null;
  isRefreshingMonitorFeed: boolean;
  isSavingMonitorConfig: boolean;
  monitorError: string | null;
  refreshMonitorFeed: (manual?: boolean) => Promise<void>;
  patchMonitorConfig: (patch: MonitorConfigPatchRequest) => Promise<boolean>;
};

const buildMonitorErrorMessage = (fallback: string, error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
};

export const useMonitorRuntime = (): UseMonitorRuntimeResult => {
  const [monitorConfig, setMonitorConfig] = useState<MonitorConfigSnapshot | null>(null);
  const [monitorFeed, setMonitorFeed] = useState<MonitorFeedSnapshot | null>(null);
  const [isRefreshingMonitorFeed, setIsRefreshingMonitorFeed] = useState(false);
  const [isSavingMonitorConfig, setIsSavingMonitorConfig] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const inFlightFeedRef = useRef(false);

  const loadMonitorConfig = useCallback(async () => {
    const response = await fetch(buildMonitorConfigUrl(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Unable to read monitor config (${response.status})`);
    }

    const parsed = normalizeMonitorConfigSnapshot(await response.json());
    if (!parsed) {
      throw new Error("Monitor config payload is invalid.");
    }

    setMonitorConfig(parsed);
  }, []);

  const refreshMonitorFeed = useCallback(async (manual = false) => {
    if (inFlightFeedRef.current) {
      return;
    }

    inFlightFeedRef.current = true;
    setIsRefreshingMonitorFeed(true);

    try {
      const url = manual ? buildMonitorRefreshUrl() : buildMonitorFeedUrl();
      const method = manual ? "POST" : "GET";
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to read monitor feed (${response.status})`);
      }

      const parsed = normalizeMonitorFeedSnapshot(await response.json());
      if (!parsed) {
        throw new Error("Monitor feed payload is invalid.");
      }

      setMonitorFeed(parsed);
      setMonitorError(null);
    } catch (error) {
      setMonitorError(buildMonitorErrorMessage("Unable to read monitor feed.", error));
    } finally {
      inFlightFeedRef.current = false;
      setIsRefreshingMonitorFeed(false);
    }
  }, []);

  const patchMonitorConfig = useCallback(
    async (patch: MonitorConfigPatchRequest) => {
      setIsSavingMonitorConfig(true);
      try {
        const response = await fetch(buildMonitorConfigUrl(), {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `Unable to save monitor config (${response.status})`);
        }

        const parsed = normalizeMonitorConfigSnapshot(await response.json());
        if (!parsed) {
          throw new Error("Monitor config response is invalid.");
        }

        setMonitorConfig(parsed);
        setMonitorError(null);
        return true;
      } catch (error) {
        setMonitorError(buildMonitorErrorMessage("Unable to save monitor config.", error));
        return false;
      } finally {
        setIsSavingMonitorConfig(false);
      }
    },
    [],
  );

  useEffect(() => {
    let isDisposed = false;

    const hydrateMonitor = async () => {
      try {
        await loadMonitorConfig();
        if (!isDisposed) {
          await refreshMonitorFeed(false);
        }
      } catch (error) {
        if (!isDisposed) {
          setMonitorError(buildMonitorErrorMessage("Unable to initialize monitor runtime.", error));
        }
      }
    };

    void hydrateMonitor();

    const timerId = window.setInterval(() => {
      void refreshMonitorFeed(false);
    }, MONITOR_SCAN_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(timerId);
    };
  }, [loadMonitorConfig, refreshMonitorFeed]);

  return {
    monitorConfig,
    monitorFeed,
    isRefreshingMonitorFeed,
    isSavingMonitorConfig,
    monitorError,
    refreshMonitorFeed,
    patchMonitorConfig,
  };
};
