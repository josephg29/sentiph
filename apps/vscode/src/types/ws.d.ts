declare module "ws" {
  export class WebSocket {
    constructor(url: string);
    readonly readyState: number;
    send(data: string): void;
    close(): void;
    addEventListener(event: string, listener: (...args: unknown[]) => void): void;
    removeEventListener(event: string, listener: (...args: unknown[]) => void): void;
  }

  export class WebSocketServer {
    constructor(options: { noServer?: boolean; port?: number });
    handleUpgrade(
      request: import("node:http").IncomingMessage,
      socket: import("node:stream").Duplex,
      head: Buffer,
      callback: (ws: WebSocket) => void,
    ): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    close(): void;
  }
}
