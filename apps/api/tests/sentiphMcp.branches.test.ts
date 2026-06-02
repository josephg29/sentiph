/**
 * tests/sentiphMcp.branches.test.ts
 *
 * Covers uncovered branches in sentiphMcp.ts that are not reached by
 * sentiphMcp.test.ts:
 *
 *  - list_terminals: duration elapsed < 5s → no durationNote (elapsedSec < 5)
 *  - list_terminals: changedAt present but agentRuntimeState absent → no durationNote
 *  - list_terminals: parentTerminalId is set at module level → filter by parentTerminalId
 *    (SENTIPH_SESSION_ID env — unreachable in test since module is already loaded)
 *  - spawn_terminal: parentTerminalId is set → body includes parentTerminalId
 *    (same env constraint — unreachable)
 *  - get_terminal_output: snapshotsRes NOT ok → agentState stays "unknown"
 *  - get_terminal_output: snapshot not found in list → agentState stays "unknown"
 *  - send_prompt: guard fetch returns non-ok but non-null → proceeds to send
 *    (guardRes?.ok falsy but guardRes is not null)
 *  - spawn_terminal: name is empty string → not included in body
 *
 * Skipped-unreachable:
 *  - `parentTerminalId` env branch in list_terminals and spawn_terminal:
 *    process.env.SENTIPH_SESSION_ID is read at module load time (top-level const).
 *    Since the module is imported once before tests run, we cannot change this
 *    value mid-test-suite. These branches require a separate worker/process.
 */

import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// The readline mock must already be in place — sentiphMcp.test.ts imports the
// module first. We re-use the same fakeRl by re-mocking readline identically.
// Since vi.mock is hoisted and modules are cached, the same fakeRl instance
// is shared across test files in the same worker.

// We need a separate readline instance for this file because the module was
// already loaded in sentiphMcp.test.ts. We work with the same fakeRl that
// was registered (the module caches the handler on the original rl).

// ─── Reproduce the readline stub at top level ─────────────────────────────
const fakeRl = new EventEmitter();

vi.mock("node:readline", () => ({
  createInterface: vi.fn(() => fakeRl),
}));

// Import the module (already loaded by sentiphMcp.test.ts — no-op re-import,
// same handlers registered on the original fakeRl)
await import("../src/sentiphMcp");

// ─── Helpers ─────────────────────────────────────────────────────────────────
type JsonRpcResponse = {
  jsonrpc: string;
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

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

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okText(text: string, status = 200): Response {
  return new Response(text, { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// list_terminals: elapsed < 5s → no durationNote
// ---------------------------------------------------------------------------
describe("tool: list_terminals branches — no duration note when < 5s", () => {
  it("does not show duration note when elapsed is less than 5 seconds", async () => {
    const changedAt = new Date(Date.now() - 2_000).toISOString(); // 2s ago
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
      id: 200,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    // Should NOT have a duration note (elapsed < 5s)
    expect(text).not.toMatch(/in this state/);
    expect(text).toContain("t1");
  });

  it("does not show duration note when changedAt is undefined", async () => {
    const snapshots = [
      {
        terminalId: "t2",
        tentacleName: "Runner",
        parentTerminalId: "p",
        agentRuntimeState: "idle",
        // no agentStateChangedAt
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 201,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).not.toMatch(/in this state/);
  });

  it("uses terminalId as name fallback when tentacleName is absent", async () => {
    const snapshots = [
      {
        terminalId: "terminal-xyz",
        parentTerminalId: "p",
        agentRuntimeState: "idle",
        // no tentacleName
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 202,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    // terminalId used as display name
    expect(text).toContain("terminal-xyz");
  });

  it("uses state.state fallback when agentRuntimeState and lifecycleState are absent", async () => {
    const snapshots = [
      {
        terminalId: "t3",
        parentTerminalId: "p",
        state: "booting",
        // no agentRuntimeState, no lifecycleState
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 203,
      method: "tools/call",
      params: { name: "list_terminals", arguments: {} },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("booting");
  });
});

// ---------------------------------------------------------------------------
// get_terminal_output: snapshotsRes NOT ok → agentState stays "unknown"
// ---------------------------------------------------------------------------
describe("tool: get_terminal_output branches — snapshots response not ok", () => {
  it("uses unknown agentState when snapshots endpoint returns error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okText("Agent output here")) // scrollback ok
        .mockResolvedValueOnce(new Response("server error", { status: 503 })), // snapshots fail
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 210,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    // agentState = "unknown" when snapshotsRes is not ok
    expect(text).toContain("[agent: unknown]");
    expect(text).toContain("Agent output here");
  });

  it("uses unknown agentState when terminal not found in snapshots list", async () => {
    const snapshots = [{ terminalId: "other-terminal", agentRuntimeState: "idle" }];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okText("Some output")) // scrollback
        .mockResolvedValueOnce(okJson(snapshots)), // snapshots — t1 not found
    );

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 211,
      method: "tools/call",
      params: { name: "get_terminal_output", arguments: { terminal_id: "t1" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toContain("[agent: unknown]");
  });
});

// ---------------------------------------------------------------------------
// send_prompt: guard fetch returns non-ok response → proceeds to send anyway
// ---------------------------------------------------------------------------
describe("tool: send_prompt branches — guard returns non-ok", () => {
  it("proceeds to send when guard fetch returns a non-ok (but non-null) response", async () => {
    // guardRes is not null but guardRes.ok is false → the if (guardRes?.ok) block is skipped
    // → proceeds to POST the prompt
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 })) // guard: not ok
      .mockResolvedValueOnce(okText("", 200)); // input POST succeeds

    vi.stubGlobal("fetch", fetchMock);

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 220,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "Do work" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/sent prompt/i);
  });
});

// ---------------------------------------------------------------------------
// spawn_terminal: name is empty string → not included in body
// ---------------------------------------------------------------------------
describe("tool: spawn_terminal branches — empty name not sent", () => {
  it("does not include name in body when name is an empty string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t-new" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 230,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Do something", name: "  ", color: "#ff9500" },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    // name is "  ".trim() = "" → falsy → not included
    expect(body.name).toBeUndefined();
  });

  it("does not include name when name is not a string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t-new2" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 231,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Do something", name: 42, color: "#ff9500" },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.name).toBeUndefined();
  });

  it("does not include group_leader when false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t-new3" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 232,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Task", name: "Worker", color: "#ff9500", group_leader: false },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.isGroupLeader).toBeUndefined();
  });

  it("does not include effort when value is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ terminalId: "t-new4" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineAsync({
      jsonrpc: "2.0",
      id: 233,
      method: "tools/call",
      params: {
        name: "spawn_terminal",
        arguments: { prompt: "Task", name: "Worker", color: "#ff9500", effort: "extreme" },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.effort).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// send_prompt: elapsedSec = null when changedAt is undefined (no duration note)
// ---------------------------------------------------------------------------
describe("tool: send_prompt branches — processing without changedAt", () => {
  it("blocks send_prompt with no duration note when changedAt is undefined", async () => {
    const snapshots = [
      {
        terminalId: "t1",
        agentRuntimeState: "processing",
        // no agentStateChangedAt
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(snapshots)));

    const res = await sendLineAsync({
      jsonrpc: "2.0",
      id: 240,
      method: "tools/call",
      params: { name: "send_prompt", arguments: { terminal_id: "t1", prompt: "Work" } },
    });

    const text = (res.result as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text).toMatch(/blocked/i);
    // No "processing for Xs" since changedAt is missing
    expect(text).not.toMatch(/processing for \d+s/);
  });
});
