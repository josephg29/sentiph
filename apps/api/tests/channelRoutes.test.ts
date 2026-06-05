import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { handleChannelMessagesRoute } from "../src/createApiServer/channelRoutes";
import type {
  RouteHandlerContext,
  RouteHandlerDependencies,
} from "../src/createApiServer/routeHelpers";

const makeResponse = () => {
  const chunks: string[] = [];
  let statusCode = 0;

  const res = new EventEmitter() as ServerResponse;
  res.writeHead = vi.fn(((code: number) => {
    statusCode = code;
    return res;
  }) as typeof res.writeHead) as unknown as typeof res.writeHead;
  res.end = vi.fn(((data?: string) => {
    if (data) chunks.push(data);
    return res;
  }) as typeof res.end) as unknown as typeof res.end;

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => {
      const raw = chunks.join("");
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    },
  };
};

const makeRequest = (method = "GET", body = ""): IncomingMessage => {
  const stream = body ? Readable.from([Buffer.from(body)]) : Readable.from([]);
  return Object.assign(stream, {
    method,
    headers: {} as IncomingMessage["headers"],
    url: "/",
  }) as unknown as IncomingMessage;
};

const makeCtx = (method: string, pathname: string, body = "") => {
  const { res, getStatus, getBody } = makeResponse();
  return {
    ctx: {
      request: makeRequest(method, body),
      response: res,
      requestUrl: new URL(`http://localhost${pathname}`),
      corsOrigin: null,
    } satisfies RouteHandlerContext,
    getStatus,
    getBody,
  };
};

const makeRuntime = () => ({
  listChannelMessages: vi.fn((_id: string) => [] as unknown[]),
  sendChannelMessage: vi.fn(
    (input: { fromTerminalId: string; toTerminalId: string; content: string }) => ({
      messageId: "m-1",
      fromTerminalId: input.fromTerminalId,
      toTerminalId: input.toTerminalId,
      content: input.content,
      timestamp: "2026-06-04T12:00:00.000Z",
      delivered: false,
    }),
  ),
});

const makeDeps = (runtime = makeRuntime()): RouteHandlerDependencies =>
  ({ runtime }) as unknown as RouteHandlerDependencies;

describe("handleChannelMessagesRoute", () => {
  it("returns false for non-matching paths", async () => {
    const { ctx } = makeCtx("GET", "/api/channels/terminal-1");
    const handled = await handleChannelMessagesRoute(ctx, makeDeps());
    expect(handled).toBe(false);
  });

  it("GET lists messages for a terminal", async () => {
    const runtime = makeRuntime();
    runtime.listChannelMessages.mockReturnValueOnce([
      {
        messageId: "m-1",
        fromTerminalId: "a",
        toTerminalId: "terminal-1",
        content: "hi",
        delivered: true,
      },
    ]);
    const { ctx, getStatus, getBody } = makeCtx("GET", "/api/channels/terminal-1/messages");

    const handled = await handleChannelMessagesRoute(ctx, makeDeps(runtime));

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(runtime.listChannelMessages).toHaveBeenCalledWith("terminal-1");
    expect(getBody()).toHaveLength(1);
  });

  it("POST sends a message and returns 201 with the stored message", async () => {
    const runtime = makeRuntime();
    const { ctx, getStatus, getBody } = makeCtx(
      "POST",
      "/api/channels/terminal-2/messages",
      JSON.stringify({ fromTerminalId: "terminal-1", content: "review please" }),
    );

    const handled = await handleChannelMessagesRoute(ctx, makeDeps(runtime));

    expect(handled).toBe(true);
    expect(getStatus()).toBe(201);
    expect(runtime.sendChannelMessage).toHaveBeenCalledWith({
      fromTerminalId: "terminal-1",
      toTerminalId: "terminal-2",
      content: "review please",
    });
    expect((getBody() as { content: string }).content).toBe("review please");
  });

  it("POST returns 404 when the target terminal does not exist", async () => {
    const runtime = makeRuntime();
    runtime.sendChannelMessage.mockReturnValueOnce(null as never);
    const { ctx, getStatus } = makeCtx(
      "POST",
      "/api/channels/ghost/messages",
      JSON.stringify({ fromTerminalId: "terminal-1", content: "hi" }),
    );

    await handleChannelMessagesRoute(ctx, makeDeps(runtime));

    expect(getStatus()).toBe(404);
  });

  it("POST returns 400 when content is missing", async () => {
    const { ctx, getStatus } = makeCtx(
      "POST",
      "/api/channels/terminal-2/messages",
      JSON.stringify({ fromTerminalId: "terminal-1" }),
    );

    await handleChannelMessagesRoute(ctx, makeDeps());

    expect(getStatus()).toBe(400);
  });

  it("POST returns 400 when fromTerminalId is missing", async () => {
    const { ctx, getStatus } = makeCtx(
      "POST",
      "/api/channels/terminal-2/messages",
      JSON.stringify({ content: "hi" }),
    );

    await handleChannelMessagesRoute(ctx, makeDeps());

    expect(getStatus()).toBe(400);
  });

  it("rejects unsupported methods with 405", async () => {
    const { ctx, getStatus } = makeCtx("DELETE", "/api/channels/terminal-2/messages");
    await handleChannelMessagesRoute(ctx, makeDeps());
    expect(getStatus()).toBe(405);
  });
});
