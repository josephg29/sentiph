import { describe, expect, it } from "vitest";

import { createChannelStore } from "../src/terminalRuntime/channelStore";

describe("createChannelStore", () => {
  const fixedClock = () => new Date("2026-06-04T12:00:00.000Z");

  it("enqueues a message with generated id, timestamp, and delivered=false", () => {
    let n = 0;
    const store = createChannelStore({ generateMessageId: () => `m-${n++}`, now: fixedClock });

    const message = store.enqueue({
      fromTerminalId: "terminal-1",
      toTerminalId: "terminal-2",
      content: "hello",
    });

    expect(message).toEqual({
      messageId: "m-0",
      fromTerminalId: "terminal-1",
      toTerminalId: "terminal-2",
      content: "hello",
      timestamp: "2026-06-04T12:00:00.000Z",
      delivered: false,
    });
  });

  it("keeps separate queues per target terminal and preserves arrival order", () => {
    let n = 0;
    const store = createChannelStore({ generateMessageId: () => `m-${n++}`, now: fixedClock });

    store.enqueue({ fromTerminalId: "a", toTerminalId: "x", content: "first" });
    store.enqueue({ fromTerminalId: "b", toTerminalId: "x", content: "second" });
    store.enqueue({ fromTerminalId: "c", toTerminalId: "y", content: "other" });

    expect(store.list("x").map((m) => m.content)).toEqual(["first", "second"]);
    expect(store.list("y").map((m) => m.content)).toEqual(["other"]);
  });

  it("list returns copies so callers cannot mutate internal state", () => {
    const store = createChannelStore({ generateMessageId: () => "m-0", now: fixedClock });
    store.enqueue({ fromTerminalId: "a", toTerminalId: "x", content: "v" });

    const copy = store.list("x");
    const firstCopy = copy[0];
    if (firstCopy) {
      firstCopy.delivered = true;
    }

    expect(store.list("x")[0]?.delivered).toBe(false);
    expect(store.hasPending("x")).toBe(true);
  });

  it("takePending returns only undelivered messages", () => {
    let n = 0;
    const store = createChannelStore({ generateMessageId: () => `m-${n++}`, now: fixedClock });
    const first = store.enqueue({ fromTerminalId: "a", toTerminalId: "x", content: "1" });
    store.enqueue({ fromTerminalId: "a", toTerminalId: "x", content: "2" });

    store.markDelivered("x", first.messageId);

    expect(store.takePending("x").map((m) => m.content)).toEqual(["2"]);
    expect(store.hasPending("x")).toBe(true);
  });

  it("markDelivered flips the delivered flag and is reflected by list", () => {
    const store = createChannelStore({ generateMessageId: () => "only", now: fixedClock });
    store.enqueue({ fromTerminalId: "a", toTerminalId: "x", content: "1" });

    store.markDelivered("x", "only");

    expect(store.list("x")[0]?.delivered).toBe(true);
    expect(store.hasPending("x")).toBe(false);
    expect(store.takePending("x")).toEqual([]);
  });

  it("returns empty results for an unknown terminal", () => {
    const store = createChannelStore();
    expect(store.list("nope")).toEqual([]);
    expect(store.takePending("nope")).toEqual([]);
    expect(store.hasPending("nope")).toBe(false);
  });
});
