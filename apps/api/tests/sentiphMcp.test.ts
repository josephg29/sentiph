/**
 * sentiphMcp.test.ts
 *
 * sentiphMcp.ts is a script (no exports). All behaviour is driven by stdin lines
 * parsed as JSON-RPC 2.0 messages. We intercept node:readline so the module
 * registers its "line" handler against a fake EventEmitter, then emit synthetic
 * lines and capture what the module writes to process.stdout.
 *
 * fetch is globally available in Node 18+ / Vitest's jsdom-ish env, so we
 * mock it with vi.stubGlobal.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── readline stub ────────────────────────────────────────────────────────────
// We need this in place BEFORE the module is imported (vi.mock is hoisted).
const fakeRl = new EventEmitter();

vi.mock("node:readline", () => ({
  createInterface: vi.fn(() => fakeRl),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────
type JsonRpcResponse = {
  jsonrpc: string;
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

/**
 * Send a JSON-RPC request line to the module and await the response it writes
 * to process.stdout.  Returns parsed JSON.
 */
async function sendLine(msg: object): Promise<JsonRpcResponse> {
  return new Promise((resolve) => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementationOnce((data) => {
      writeSpy.mockRestore();
      resolve(JSON.parse(String(data).trim()) as JsonRpcResponse);
      return true;
    });
    fakeRl.emit("line", JSON.stringify(msg));
  });
}

/**
 * For async tool calls the module does the network request before writing to
 * stdout, so we must await in a slightly different way.
 */
async function sendLineAsync(msg: object, timeoutMs = 2_000): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      writeSpy.mockRestore();
      reject(new Error("Timeout waiting for stdout write"));
    }, timeoutMs);

    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementationOnce((data) => {
      clearTimeout(timer);
      writeSpy.mockRestore();
      resolve(JSON.parse(String(data).trim()) as JsonRpcResponse);
      return true;
    });

    fakeRl.emit("line", JSON.stringify(msg));
  });
}

// ─── module import (after mocks are set up) ──────────────────────────────────
// Import side-effectful module once. The readline mock intercepts createInterface.
await import("../src/sentiphMcp");

// ─── fetch stub helpers ───────────────────────────────────────────────────────
function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okText(text: string, status = 200): Response {
  return new Response(text, { status });
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
}

function serverError(errorMsg = "internal error"): Response {
  return new Response(JSON.stringify({ error: errorMsg }), { status: 500 });
}

// Keep the orchestrating-parent env var out of the ambient environment so these
// tests are hermetic: sentiphMcp.ts reads SENTIPH_SESSION_ID lazily, and most
// tests assume no parent (parentTerminalId === null). Without this, running the
// suite from inside a Sentiph session (where SENTIPH_SESSION_ID is set) changes
// list_terminals filtering and fails these tests.
beforeEach(() => {
  vi.stubEnv("SENTIPH_SESSION_ID", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ─── JSON-RPC protocol tests ──────────────────────────────────────────────────
describe("JSON-RPC protocol handling", () => {
  it("ignores empty/blank lines", () => {
    const spy = vi.spyOn(process.stdout, "write");
    fakeRl.emit("line", "   ");
    fakeRl.emit("line", "");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ignores lines with invalid JSON", () => {
    const spy = vi.spyOn(process.stdout, "write");
    fakeRl.emit("line", "not-json");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ignores messages without an id field", () => {
    const spy = vi.spyOn(process.stdout, "write");
    fakeRl.emit("line", JSON.stringify({ jsonrpc: "2.0", method: "initialize" }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("responds to initialize", async () => {
    const res = await sendLine({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res.jsonrpc).toBe("2.0");
    expect(res.id).toBe(1);
    const result = res.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe("2024-11-05");
    expect((result.serverInfo as Record<string, unknown>).name).toBe("sentiph");
  });

  it("responds to tools/list with all tool names", async () => {
    const res = await sendLine({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const result = res.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("list_terminals");
    expect(names).toContain("spawn_terminal");
    expect(names).toContain("send_prompt");
    expect(names).toContain("get_terminal_output");
    expect(names).toContain("close_terminal");
  });

  it("responds with Method not found for unknown methods", async () => {
    const res = await sendLine({ jsonrpc: "2.0", id: 3, method: "unknown/method" });
    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(-32601);
    expect(res.error?.message).toMatch(/method not found/i);
  });

  it("responds with error -32602 when tool name is missing from tools/call", async () => {
    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { arguments: {} },
    });
    expect(res.error?.code).toBe(-32602);
    expect(res.error?.message).toMatch(/missing tool name/i);
  });

  it("handles tools/call with no params object", async () => {
    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
    });
    expect(res.error?.code).toBe(-32602);
  });
});

// ─── list_terminals ───────────────────────────────────────────────────────────
describe("tool: list_terminals", () => {
  it("returns 'No terminals yet' when children array is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson([])));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const content = (res.result as { content: Array<{ text: string }> }).content;
    expect(content[0]?.text).toMatch(/no terminals yet/i);
  });

  it("lists terminals with parentTerminalId set", async () => {
    const snapshots = [
      {
        terminalId: "t1",
        tentacleName: "Builder",
        parentTerminalId: "parent-abc",
        agentRuntimeState: "idle",
      },
      {
        terminalId: "t2",
        tentacleName: "Tester",
        parentTerminalId: null,
        agentRuntimeState: "processing",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    // Both terminals have a non-null parentTerminalId (t2 has null → excluded)
    expect(text).toContain("t1");
    expect(text).not.toContain("t2");
    expect(text).toMatch(/idle.*ready/i);
  });

  it("throws (returns error text) when API responds with non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/error/i);
  });

  it("shows duration note for idle terminal in this state >= 5s", async () => {
    const changedAt = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    const snapshots = [
      {
        terminalId: "t1",
        tentacleName: "Worker",
        parentTerminalId: "p",
        agentRuntimeState: "idle",
        agentStateChangedAt: changedAt,
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/\d+s in this state/);
  });

  it("shows minutes:seconds duration for terminal in state >= 60s", async () => {
    const changedAt = new Date(Date.now() - 90_000).toISOString(); // 90s ago
    const snapshots = [
      {
        terminalId: "t1",
        tentacleName: "Worker",
        parentTerminalId: "p",
        agentRuntimeState: "processing",
        agentStateChangedAt: changedAt,
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/\d+m\d+s in this state/);
  });

  it("shows no idle hint when no terminals are idle", async () => {
    const snapshots = [
      {
        terminalId: "t1",
        tentacleName: "Busy",
        parentTerminalId: "p",
        agentRuntimeState: "processing",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("No idle terminals");
  });
});

// ─── send_prompt ──────────────────────────────────────────────────────────────
describe("tool: send_prompt", () => {
  it("returns error when terminal_id is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson([])));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { prompt: "Hello" } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/terminal_id is required/i);
  });

  it("returns error when prompt is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson([])));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1" } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/prompt is required/i);
  });

  it("returns error when prompt exceeds MAX_PROMPT_LENGTH", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson([])));
    const longPrompt = "x".repeat(8193);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: longPrompt } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/maximum length/i);
  });

  it("blocks send_prompt when terminal is processing", async () => {
    const changedAt = new Date(Date.now() - 5_000).toISOString();
    const snapshots = [
      {
        terminalId: "t1",
        agentRuntimeState: "processing",
        agentStateChangedAt: changedAt,
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "Do something" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/blocked/i);
    expect(text).toMatch(/processing/i);
  });

  it("sends prompt successfully to idle terminal", async () => {
    const snapshots = [{ terminalId: "t1", agentRuntimeState: "idle" }];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(snapshots)) // guard check
      .mockResolvedValueOnce(okText("", 200)); // input POST

    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 24,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "Do the work" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/sent prompt to terminal "t1"/i);
  });

  it("returns not-found message for 404 terminal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson([])) // guard (no match)
      .mockResolvedValueOnce(notFound()); // input POST returns 404

    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "missing", prompt: "hello" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
  });

  it("throws on 500 from input endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson([])) // guard
      .mockResolvedValueOnce(serverError("terminal exploded")); // POST fails

    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "Do work" } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/terminal exploded/i);
  });

  it("handles guard fetch failure gracefully (proceeds to send)", async () => {
    // If the guard fetch fails (network error), send_prompt proceeds anyway
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error")) // guard throws
      .mockResolvedValueOnce(okText("", 200)); // input POST succeeds

    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "Work please" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/sent prompt/i);
  });

  it("blocks with processing duration note when changedAt is set", async () => {
    const changedAt = new Date(Date.now() - 30_000).toISOString();
    const snapshots = [
      { terminalId: "t1", agentRuntimeState: "processing", agentStateChangedAt: changedAt },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 28,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "hi" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/processing for \d+s/);
  });
});

// ─── spawn_terminal ───────────────────────────────────────────────────────────
describe("tool: spawn_terminal", () => {
  it("returns error when prompt is empty", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: { name: "spawn_terminal", arguments: { name: "Builder", color: "#ff6b2b" } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/prompt is required/i);
  });

  it("returns error when prompt exceeds MAX_PROMPT_LENGTH", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "x".repeat(8193), name: "Builder", color: "#ff6b2b" },
      },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/maximum length/i);
  });

  it("spawns a terminal and returns its ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson({ terminalId: "new-t1" })));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Build the project", name: "Builder", color: "#ff6b2b" },
      },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("new-t1");
    expect(text).toMatch(/spawned terminal/i);
  });

  it("passes optional fields: name, color, group_leader, model, effort", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t99" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: {
          prompt: "Do something",
          name: "Researcher",
          color: "#ff9500",
          group_leader: true,
          model: "haiku",
          effort: "high",
        },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.name).toBe("Researcher");
    expect(body.color).toBe("#ff9500");
    expect(body.isGroupLeader).toBe(true);
    expect(body.model).toBe("haiku");
    expect(body.effort).toBe("high");
  });

  it("rejects invalid hex color (does not include in body)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 34,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Task", name: "Worker", color: "red" }, // not a valid hex
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.color).toBeUndefined();
  });

  it("rejects invalid model (does not include in body)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 35,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Task", name: "Worker", color: "#ff9500", model: "gpt-4" },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.model).toBeUndefined();
  });

  it("throws when API returns error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(serverError("quota exceeded")));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 36,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Task", name: "Worker", color: "#ff9500" },
      },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/quota exceeded/i);
  });
});

// ─── get_terminal_output ──────────────────────────────────────────────────────
describe("tool: get_terminal_output", () => {
  it("returns error when terminal_id is empty", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: {} },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/terminal_id is required/i);
  });

  it("returns 'not found' when scrollback returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(notFound()) // scrollback
        .mockResolvedValueOnce(okJson([])), // snapshots
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "ghost" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
  });

  it("throws when scrollback returns 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("fail", { status: 500 }))
        .mockResolvedValueOnce(okJson([])),
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/api error 500/i);
  });

  it("returns idle header and full output for idle terminal", async () => {
    const snapshots = [{ terminalId: "t1", agentRuntimeState: "idle" }];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okText("Hello from agent")) // scrollback
        .mockResolvedValueOnce(okJson(snapshots)), // snapshots
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 43,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("[agent: idle");
    expect(text).toContain("Hello from agent");
  });

  it("returns processing header with tail-only output for processing terminal", async () => {
    // Build output with many lines so the tail logic truncates
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join("\n");
    const snapshots = [{ terminalId: "t1", agentRuntimeState: "processing" }];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(okText(lines)).mockResolvedValueOnce(okJson(snapshots)),
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("[agent: processing");
    expect(text).toContain("earlier lines hidden");
    // Should end with a "Do not interpret" instruction
    expect(text).toMatch(/do not interpret/i);
  });

  it("strips ANSI codes from scrollback", async () => {
    const ansiOutput = "\x1b[32mGreen text\x1b[0m";
    const snapshots = [{ terminalId: "t1", agentRuntimeState: "idle" }];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(okText(ansiOutput)).mockResolvedValueOnce(okJson(snapshots)),
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 45,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("Green text");
    expect(text).not.toContain("\x1b[");
  });

  it("handles processing output shorter than TAIL_LINES without omittedNote", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");
    const snapshots = [{ terminalId: "t1", agentRuntimeState: "processing" }];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(okText(lines)).mockResolvedValueOnce(okJson(snapshots)),
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 46,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    // No "earlier lines hidden" because all lines fit in the tail
    expect(text).not.toContain("earlier lines hidden");
  });

  it("uses lifecycleState when agentRuntimeState is absent", async () => {
    const snapshots = [{ terminalId: "t1", lifecycleState: "starting" }];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okText("Starting up..."))
        .mockResolvedValueOnce(okJson(snapshots)),
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 47,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("[agent: starting]");
  });

  it("shows 'No output yet.' when scrollback is empty", async () => {
    const snapshots = [{ terminalId: "t1", agentRuntimeState: "idle" }];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okText("   ")) // whitespace only
        .mockResolvedValueOnce(okJson(snapshots)),
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 48,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("No output yet.");
  });
});

// ─── close_terminal ───────────────────────────────────────────────────────────
describe("tool: close_terminal", () => {
  it("returns error when terminal_id is empty", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "close_terminal", arguments: {} },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/terminal_id is required/i);
  });

  it("sends SIGTERM (stop) by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okText("", 200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: { name: "close_terminal", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/sigterm/i);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/stop");
  });

  it("sends SIGKILL when force=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okText("", 200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: { name: "close_terminal", arguments: { terminal_id: "t1", force: true } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/sigkill/i);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/kill");
  });

  it("returns not-found message for 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFound()));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: { name: "close_terminal", arguments: { terminal_id: "ghost" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
  });

  it("throws on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(serverError("cannot close")));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 54,
      method: "tools/call",
      params: { name: "close_terminal", arguments: { terminal_id: "t1" } },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/cannot close/i);
  });
});

// ─── unknown tool ─────────────────────────────────────────────────────────────
describe("tool: unknown", () => {
  it("returns error content for an unregistered tool name", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: { name: "delete_everything", arguments: {} },
    });

    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/unknown tool/i);
  });
});
