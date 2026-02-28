export type MonitorProviderId = "x";

export type MonitorPost = {
  source: MonitorProviderId;
  id: string;
  text: string;
  author: string;
  createdAt: string;
  likeCount: number;
  permalink: string;
};

export type MonitorUsageSnapshot = {
  status: "ok" | "unavailable" | "error";
  source: "x-api" | "none";
  fetchedAt: string;
  message?: string | null;
  cap?: number | null;
  used?: number | null;
  remaining?: number | null;
  resetAt?: string | null;
};

export type MonitorCredentialSummary = {
  isConfigured: boolean;
  bearerTokenHint: string | null;
  apiKeyHint: string | null;
  hasApiSecret: boolean;
  hasAccessToken: boolean;
  hasAccessTokenSecret: boolean;
  updatedAt: string | null;
};

export type XMonitorCredentials = {
  bearerToken: string;
  apiKey: string | null;
  apiSecret: string | null;
  accessToken: string | null;
  accessTokenSecret: string | null;
  updatedAt: string;
};

export type MonitorRefreshPolicy = {
  maxCacheAgeMs: number;
};

export type PersistedMonitorConfig = {
  version: 1;
  providerId: MonitorProviderId;
  queryTerms: string[];
  refreshPolicy: MonitorRefreshPolicy;
  providers: {
    x: {
      credentials: XMonitorCredentials | null;
    };
  };
};

export type PersistedMonitorCache = {
  version: 1;
  providerId: MonitorProviderId;
  queryTerms: string[];
  fetchedAt: string | null;
  lastError: string | null;
  posts: MonitorPost[];
  usage: MonitorUsageSnapshot | null;
};

export type SanitizedMonitorConfig = {
  providerId: MonitorProviderId;
  queryTerms: string[];
  refreshPolicy: MonitorRefreshPolicy;
  providers: {
    x: {
      credentials: MonitorCredentialSummary;
    };
  };
};

export type MonitorFeedSnapshot = {
  providerId: MonitorProviderId;
  queryTerms: string[];
  refreshPolicy: MonitorRefreshPolicy;
  lastFetchedAt: string | null;
  staleAfter: string | null;
  isStale: boolean;
  lastError: string | null;
  posts: MonitorPost[];
  usage: MonitorUsageSnapshot | null;
};

export type MonitorConfigPatchInput = {
  providerId?: MonitorProviderId;
  queryTerms?: string[];
  refreshPolicy?: {
    maxCacheAgeMs?: number;
  };
  credentials?: unknown;
  validateCredentials?: boolean;
};

export type MonitorReadFeedOptions = {
  forceRefresh?: boolean;
  refreshIfStale?: boolean;
};

export type MonitorCredentialsSaveResult = {
  credentials: unknown;
  summary: MonitorCredentialSummary;
};

export type MonitorProviderValidationResult = {
  ok: boolean;
  error?: string;
};

export type MonitorProviderAdapter = {
  providerId: MonitorProviderId;
  saveCredentials: (input: unknown, now: Date) => MonitorCredentialsSaveResult;
  summarizeCredentials: (credentials: unknown) => MonitorCredentialSummary;
  validateCredentials: (credentials: unknown) => Promise<MonitorProviderValidationResult>;
  fetchRecentPosts: (args: {
    credentials: unknown;
    queryTerms: string[];
    now: Date;
  }) => Promise<MonitorPost[]>;
  fetchUsage: (args: { credentials: unknown; now: Date }) => Promise<MonitorUsageSnapshot>;
};

export type MonitorRepository = {
  readConfig: () => PersistedMonitorConfig;
  writeConfig: (config: PersistedMonitorConfig) => void;
  readCache: () => PersistedMonitorCache;
  writeCache: (cache: PersistedMonitorCache) => void;
};

export type MonitorService = {
  readConfig: () => Promise<SanitizedMonitorConfig>;
  patchConfig: (patch: MonitorConfigPatchInput) => Promise<SanitizedMonitorConfig>;
  readFeed: (options?: MonitorReadFeedOptions) => Promise<MonitorFeedSnapshot>;
};
