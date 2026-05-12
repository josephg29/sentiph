const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const withCors = (headers: Record<string, string>, corsOrigin: string | null) => {
  const nextHeaders: Record<string, string> = {
    ...headers,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (corsOrigin) {
    nextHeaders["Access-Control-Allow-Origin"] = corsOrigin;
    nextHeaders.Vary = "Origin";
  }

  return nextHeaders;
};

const isLoopbackHostname = (hostname: string) => LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());

const parseHostname = (value: string, withScheme: boolean): string | null => {
  try {
    const url = new URL(withScheme ? value : `http://${value}`);
    return url.hostname;
  } catch {
    return null;
  }
};

export const isAllowedOriginHeader = (origin: string | undefined, allowRemoteAccess: boolean) => {
  if (allowRemoteAccess) {
    return true;
  }

  // Non-browser clients (curl, CLI tools, MCP subprocess) omit Origin entirely.
  // In loopback-only mode the Host header check already gates network access,
  // so we allow no-Origin requests but never accept a non-loopback Origin.
  if (origin === undefined) {
    return true;
  }

  const hostname = parseHostname(origin, true);
  return hostname !== null && isLoopbackHostname(hostname);
};

export const isAllowedHostHeader = (host: string | undefined, allowRemoteAccess: boolean) => {
  if (allowRemoteAccess) {
    return true;
  }

  if (!host) {
    return false;
  }

  const hostname = parseHostname(host, false);
  return hostname !== null && isLoopbackHostname(hostname);
};

export const isLoopbackHostHeader = (host: string | undefined): boolean => {
  if (!host) {
    return false;
  }
  const hostname = parseHostname(host, false);
  return hostname !== null && isLoopbackHostname(hostname);
};

export const readHeaderValue = (header: string | string[] | undefined): string | undefined => {
  if (typeof header !== "string") {
    return undefined;
  }

  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const getRequestCorsOrigin = (origin: string | undefined, allowRemoteAccess: boolean) => {
  if (!origin) {
    return null;
  }

  if (!allowRemoteAccess && !isAllowedOriginHeader(origin, allowRemoteAccess)) {
    return null;
  }

  return origin;
};

const BEARER_PREFIX = "Bearer ";

export const extractBearerToken = (authHeader: string | undefined): string | undefined => {
  if (!authHeader) {
    return undefined;
  }
  if (!authHeader.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  const value = authHeader.slice(BEARER_PREFIX.length).trim();
  return value.length > 0 ? value : undefined;
};
