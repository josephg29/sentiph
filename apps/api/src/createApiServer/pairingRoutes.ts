import type { PairingService } from "../pairing";
import type { ApiRouteHandler } from "./routeHelpers";

export const createPairingRoutes = (
  _pairingService: PairingService,
  _allowRemoteAccess: boolean,
): ApiRouteHandler[] => {
  return [];
};
