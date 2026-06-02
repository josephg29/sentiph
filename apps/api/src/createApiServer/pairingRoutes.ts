import type { PairingService } from "../pairing";
import type { ApiRouteHandler } from "./routeHelpers";
import { writeJson, writeMethodNotAllowed } from "./routeHelpers";
import { isAuthorizedRequest, isLoopbackHostHeader, readHeaderValue } from "./security";

const PAIRING_PATH = "/api/pairing";

/**
 * Exposes a single GET `/api/pairing` endpoint reporting whether auth is required
 * (remote mode) and whether the current request is authenticated. The pairing
 * token itself is returned ONLY to loopback callers, so a local operator can read
 * it to configure a remote client; a non-loopback request never receives the token.
 */
export const createPairingRoutes = (
  pairingService: PairingService,
  allowRemoteAccess: boolean,
): ApiRouteHandler[] => {
  const handlePairingRoute: ApiRouteHandler = async ({
    request,
    response,
    requestUrl,
    corsOrigin,
  }) => {
    if (requestUrl.pathname !== PAIRING_PATH) {
      return false;
    }

    if (request.method !== "GET") {
      writeMethodNotAllowed(response, corsOrigin);
      return true;
    }

    const hostHeader = readHeaderValue(request.headers.host);
    const isLoopback = isLoopbackHostHeader(hostHeader);
    const authenticated = isAuthorizedRequest(request, pairingService);

    const body: {
      requiresAuth: boolean;
      authenticated: boolean;
      token?: string;
    } = {
      requiresAuth: allowRemoteAccess,
      authenticated,
    };

    // Surface the token only to loopback callers (local operator configuring a
    // remote client). Never leak it to a non-loopback request.
    if (isLoopback) {
      const token = pairingService.getToken();
      if (token) {
        body.token = token;
      }
    }

    writeJson(response, 200, body, corsOrigin);
    return true;
  };

  return [handlePairingRoute];
};
