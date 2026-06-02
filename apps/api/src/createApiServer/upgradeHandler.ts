import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import { logError, logVerbose } from "../logging";
import { isAllowedHostHeader, isAllowedOriginHeader, readHeaderValue } from "./security";

type TerminalRuntime = ReturnType<typeof import("../terminalRuntime").createTerminalRuntime>;

type CreateUpgradeHandlerOptions = {
  runtime: TerminalRuntime;
  allowRemoteAccess: boolean;
};

export const createUpgradeHandler = ({
  runtime,
  allowRemoteAccess,
}: CreateUpgradeHandlerOptions) => {
  return (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const originHeader = readHeaderValue(request.headers.origin);
    const hostHeader = readHeaderValue(request.headers.host);
    if (!isAllowedHostHeader(hostHeader, allowRemoteAccess)) {
      logVerbose(`[WS] Upgrade rejected: host not allowed (${hostHeader ?? "<none>"})`);
      socket.destroy();
      return;
    }

    if (!isAllowedOriginHeader(originHeader, allowRemoteAccess)) {
      logVerbose(`[WS] Upgrade rejected: origin not allowed (${originHeader ?? "<none>"})`);
      socket.destroy();
      return;
    }

    try {
      if (!runtime.handleUpgrade(request, socket, head)) {
        logVerbose(`[WS] Upgrade declined by runtime for ${request.url ?? "/"}`);
        socket.destroy();
      }
    } catch (error) {
      // Clean destroy (no HTTP handshake response) so misbehaving clients can't
      // probe internals; the failure reason is surfaced only via logError.
      logError(`[WS] Upgrade failed for ${request.url ?? "/"}`, error);
      socket.destroy();
    }
  };
};
