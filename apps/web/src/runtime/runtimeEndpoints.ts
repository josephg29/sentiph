type LocationLike = Pick<Location, "host" | "protocol">;

const readRuntimeBaseUrl = (): string | null => {
  const value = import.meta.env.VITE_OCTOGENT_API_ORIGIN;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const withTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);

const buildAbsoluteUrl = (baseUrl: string, pathname: string) => {
  const normalizedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return new URL(normalizedPath, withTrailingSlash(baseUrl)).toString();
};

const localWebSocketUrl = (location: LocationLike, tentacleId: string) => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/terminals/${tentacleId}/ws`;
};

const toWebSocketBase = (runtimeBaseUrl: string): string | null => {
  try {
    const url = new URL(runtimeBaseUrl);
    if (url.protocol === "https:") {
      url.protocol = "wss:";
      return url.toString();
    }
    if (url.protocol === "http:") {
      url.protocol = "ws:";
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
};

export const buildAgentSnapshotsUrl = (runtimeBaseUrl = readRuntimeBaseUrl()) => {
  if (!runtimeBaseUrl) {
    return "/api/agent-snapshots";
  }

  return buildAbsoluteUrl(runtimeBaseUrl, "/api/agent-snapshots");
};

export const buildTerminalSocketUrl = (
  tentacleId: string,
  runtimeBaseUrl = readRuntimeBaseUrl(),
  location: LocationLike = window.location,
) => {
  const encodedTentacleId = encodeURIComponent(tentacleId);
  if (!runtimeBaseUrl) {
    return localWebSocketUrl(location, encodedTentacleId);
  }

  const webSocketBase = toWebSocketBase(runtimeBaseUrl);
  if (!webSocketBase) {
    return localWebSocketUrl(location, encodedTentacleId);
  }

  return buildAbsoluteUrl(webSocketBase, `/api/terminals/${encodedTentacleId}/ws`);
};
