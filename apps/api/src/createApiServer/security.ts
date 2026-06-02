import type { IncomingMessage } from "node:http";

import type { PairingService } from "../pairing";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Merges CORS headers into `headers`. When `corsOrigin` is non-null, adds
 * `Access-Control-Allow-Origin` reflecting that specific origin and `Vary: Origin`
 * so intermediate caches don't serve the wrong CORS response to different origins.
 */
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

/**
 * Returns true when the `Origin` header is acceptable in the current access mode.
 * In local-only mode: absent Origin (CLI tools, MCP subprocesses) is allowed;
 * a non-loopback Origin is rejected. Remote access mode accepts all origins.
 */
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

/**
 * Returns true when the `Host` header permits the request.
 * In local-only mode a missing or non-loopback host is rejected, preventing DNS-rebinding
 * attacks where a remote page targets `localhost` without a matching Origin.
 */
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

/**
 * Returns true when the `Host` header resolves to a loopback address, regardless of any
 * remote-access setting. Used for connection-type detection, not request gating.
 */
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

/**
 * Returns the origin to echo in the `Access-Control-Allow-Origin` header, or `null`
 * to suppress the CORS header when the origin is absent or not allowed.
 */
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

/**
 * Returns true when a request is authorized. Loopback requests are ALWAYS
 * authorized (default local mode is unaffected — this short-circuits before any
 * token check). Non-loopback requests must present a valid pairing token, either
 * as a `Bearer` Authorization header or a `?token=` query parameter.
 */
export const isAuthorizedRequest = (
  request: IncomingMessage,
  pairingService: PairingService,
): boolean => {
  const hostHeader = readHeaderValue(request.headers.host);
  if (isLoopbackHostHeader(hostHeader)) {
    return true;
  }

  const authHeader = readHeaderValue(request.headers.authorization);
  const bearer = extractBearerToken(authHeader);
  if (bearer && pairingService.verifyToken(bearer)) {
    return true;
  }

  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const tokenQuery = requestUrl.searchParams.get("token");
    if (tokenQuery && pairingService.verifyToken(tokenQuery)) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
};
