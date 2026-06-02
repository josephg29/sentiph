import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";

import { createUpgradeHandler } from "../src/createApiServer/upgradeHandler";

type RuntimeLike = {
  handleUpgrade: (request: IncomingMessage, socket: Socket, head: Buffer) => boolean;
};

describe("createUpgradeHandler", () => {
  it("destroys socket when runtime upgrade handling throws", () => {
    const runtime: RuntimeLike = {
      handleUpgrade: () => {
        throw new Error("boom");
      },
    };
    const handler = createUpgradeHandler({
      runtime: runtime as never,
      allowRemoteAccess: true,
    });
    const socket = {
      destroy: vi.fn(),
    } as unknown as Socket;

    expect(() =>
      handler(
        {
          headers: {
            host: "127.0.0.1:8787",
            origin: "http://127.0.0.1:5173",
          },
        } as IncomingMessage,
        socket,
        Buffer.alloc(0),
      ),
    ).not.toThrow();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys socket and does not call runtime when host is not allowed (local mode)", () => {
    const handleUpgrade = vi.fn(() => true);
    const handler = createUpgradeHandler({
      runtime: { handleUpgrade } as never,
      allowRemoteAccess: false,
    });
    const socket = { destroy: vi.fn() } as unknown as Socket;

    handler(
      { url: "/api/ws", headers: { host: "evil.example:8787" } } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(handleUpgrade).not.toHaveBeenCalled();
  });

  it("destroys socket when origin is not allowed (local mode)", () => {
    const handleUpgrade = vi.fn(() => true);
    const handler = createUpgradeHandler({
      runtime: { handleUpgrade } as never,
      allowRemoteAccess: false,
    });
    const socket = { destroy: vi.fn() } as unknown as Socket;

    handler(
      {
        url: "/api/ws",
        headers: { host: "127.0.0.1:8787", origin: "https://attacker.example" },
      } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(handleUpgrade).not.toHaveBeenCalled();
  });

  it("destroys socket when the runtime declines the upgrade (returns false)", () => {
    const handleUpgrade = vi.fn(() => false);
    const handler = createUpgradeHandler({
      runtime: { handleUpgrade } as never,
      allowRemoteAccess: true,
    });
    const socket = { destroy: vi.fn() } as unknown as Socket;

    handler(
      { url: "/api/ws", headers: { host: "127.0.0.1:8787" } } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );

    expect(handleUpgrade).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not destroy the socket when the runtime accepts the upgrade", () => {
    const handleUpgrade = vi.fn(() => true);
    const handler = createUpgradeHandler({
      runtime: { handleUpgrade } as never,
      allowRemoteAccess: true,
    });
    const socket = { destroy: vi.fn() } as unknown as Socket;

    handler(
      { url: "/api/ws", headers: { host: "127.0.0.1:8787" } } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );

    expect(socket.destroy).not.toHaveBeenCalled();
  });
});
