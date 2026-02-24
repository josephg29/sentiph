import { createServer } from "node:http";
import { resolve } from "node:path";

import { createTerminalRuntime } from "./terminalRuntime";

type CreateApiServerOptions = {
  workspaceCwd?: string;
};

const withCors = (headers: Record<string, string>) => ({
  ...headers,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export const createApiServer = ({ workspaceCwd }: CreateApiServerOptions = {}) => {
  const runtime = createTerminalRuntime({
    workspaceCwd: workspaceCwd ?? resolve(process.cwd(), "../.."),
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "OPTIONS") {
      response.writeHead(204, withCors({}));
      response.end();
      return;
    }

    if (requestUrl.pathname === "/api/agent-snapshots") {
      if (request.method !== "GET") {
        response.writeHead(405, withCors({ "Content-Type": "application/json" }));
        response.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      const payload = runtime.listAgentSnapshots();
      response.writeHead(200, withCors({ "Content-Type": "application/json" }));
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404, withCors({ "Content-Type": "application/json" }));
    response.end(JSON.stringify({ error: "Not found" }));
  });

  server.on("upgrade", (request, socket, head) => {
    if (!runtime.handleUpgrade(request, socket, head)) {
      socket.destroy();
    }
  });

  return {
    server,
    async start(port = 8787, host = "127.0.0.1") {
      await new Promise<void>((resolveStart, rejectStart) => {
        server.listen(port, host, () => resolveStart());
        server.once("error", rejectStart);
      });

      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;

      return { host, port: resolvedPort };
    },
    async stop() {
      runtime.close();
      await new Promise<void>((resolveStop, rejectStop) => {
        server.close((error) => {
          if (error) {
            rejectStop(error);
            return;
          }
          resolveStop();
        });
      });
    },
  };
};
