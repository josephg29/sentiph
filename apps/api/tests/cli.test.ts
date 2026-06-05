/**
 * tests/cli.test.ts
 *
 * cli.ts is a top-level script that reads process.argv and calls main() at
 * import time. We test its internal behaviour by:
 *  1. Mocking all side-effecting deps (projectPersistence, runtimeMetadata,
 *     startupPrerequisites, createApiServer, node:child_process, node:net).
 *  2. Dynamically import()-ing the module inside each test after setting
 *     process.argv and env-vars, then resetting modules between tests.
 *
 * Helper functions that have no exports are tested indirectly:
 *  - readPreferredStartPort  (via argv-driven startServer path)
 *  - canListenOnPort / findOpenPort (via mocked createServer)
 *  - maybeOpenBrowser (via env SENTIPH_NO_OPEN and platform branching)
 *  - parseFlag (via terminalCreate args)
 *  - resolveRuntimeApiBase (via mock loadProjectConfig)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Hoisted mocks
// --------------------------------------------------------------------------

const {
  mockSpawn,
  mockCreateServer,
  mockLoadProjectConfig,
  mockLoadProjectsRegistry,
  mockEnsureProjectScaffold,
  mockEnsureSentiphGitignoreEntry,
  mockRegisterProject,
  mockResolveProjectStateDir,
  mockMigrateStateToGlobal,
  mockResolveEphemeralProjectStateDir,
  mockReadRuntimeMetadata,
  mockWriteRuntimeMetadata,
  mockClearRuntimeMetadata,
  mockCollectStartupPrerequisiteReport,
  mockFormatStartupPrerequisiteReport,
  mockCreateApiServer,
  mockApiStart,
  mockApiStop,
} = vi.hoisted(() => {
  const mockApiStop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const mockApiStart = vi
    .fn<(port: number, host: string) => Promise<{ host: string; port: number }>>()
    .mockResolvedValue({ host: "127.0.0.1", port: 8787 });

  const mockCreateApiServer = vi.fn(() => ({ start: mockApiStart, stop: mockApiStop }));

  const mockSpawn = vi.fn(() => ({ unref: vi.fn() }));

  // Fake net.createServer that reports port as open immediately
  const mockCreateServer = vi.fn(() => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const server = {
      once: (event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event]?.push(cb);
        if (event === "listening") {
          Promise.resolve().then(() => {
            for (const fn of listeners.listening ?? []) fn();
          });
        }
      },
      listen: vi.fn(),
      close: vi.fn((cb?: () => void) => {
        if (cb) cb();
      }),
    };
    return server;
  });

  const mockLoadProjectConfig = vi.fn<() => null | { displayName: string }>(() => null);
  const mockLoadProjectsRegistry = vi.fn<
    () => { projects: { id: string; name: string; path: string }[] }
  >(() => ({ projects: [] }));
  const mockEnsureProjectScaffold = vi.fn(() => ({ displayName: "test-project" }));
  const mockEnsureSentiphGitignoreEntry = vi.fn();
  const mockRegisterProject = vi.fn();
  const mockResolveProjectStateDir = vi.fn(() => "/fake/state");
  const mockMigrateStateToGlobal = vi.fn();
  const mockResolveEphemeralProjectStateDir = vi.fn(() => "/fake/ephemeral-state");
  const mockReadRuntimeMetadata = vi.fn<() => null | Record<string, unknown>>(() => null);
  const mockWriteRuntimeMetadata = vi.fn();
  const mockClearRuntimeMetadata = vi.fn();
  const mockCollectStartupPrerequisiteReport = vi.fn<
    () => { errors: string[]; warnings: string[] }
  >(() => ({ errors: [], warnings: [] }));
  const mockFormatStartupPrerequisiteReport = vi.fn<() => string[]>(() => []);

  return {
    mockSpawn,
    mockCreateServer,
    mockLoadProjectConfig,
    mockLoadProjectsRegistry,
    mockEnsureProjectScaffold,
    mockEnsureSentiphGitignoreEntry,
    mockRegisterProject,
    mockResolveProjectStateDir,
    mockMigrateStateToGlobal,
    mockResolveEphemeralProjectStateDir,
    mockReadRuntimeMetadata,
    mockWriteRuntimeMetadata,
    mockClearRuntimeMetadata,
    mockCollectStartupPrerequisiteReport,
    mockFormatStartupPrerequisiteReport,
    mockCreateApiServer,
    mockApiStart,
    mockApiStop,
  };
});

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));
vi.mock("node:net", () => ({ createServer: mockCreateServer }));

vi.mock("../src/projectPersistence", () => ({
  loadProjectConfig: mockLoadProjectConfig,
  loadProjectsRegistry: mockLoadProjectsRegistry,
  ensureProjectScaffold: mockEnsureProjectScaffold,
  ensureSentiphGitignoreEntry: mockEnsureSentiphGitignoreEntry,
  registerProject: mockRegisterProject,
  resolveProjectStateDir: mockResolveProjectStateDir,
  migrateStateToGlobal: mockMigrateStateToGlobal,
  resolveEphemeralProjectStateDir: mockResolveEphemeralProjectStateDir,
}));

vi.mock("../src/runtimeMetadata", () => ({
  readRuntimeMetadata: mockReadRuntimeMetadata,
  writeRuntimeMetadata: mockWriteRuntimeMetadata,
  clearRuntimeMetadata: mockClearRuntimeMetadata,
}));

vi.mock("../src/startupPrerequisites", () => ({
  collectStartupPrerequisiteReport: mockCollectStartupPrerequisiteReport,
  formatStartupPrerequisiteReport: mockFormatStartupPrerequisiteReport,
}));

vi.mock("../src/createApiServer", () => ({
  createApiServer: mockCreateApiServer,
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

let originalArgv: string[];
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalArgv = process.argv;
  originalEnv = { ...process.env };
  process.env.SENTIPH_NO_OPEN = "1"; // suppress browser opening in all tests
  process.env.SENTIPH_API_PORT = undefined;
  process.env.PORT = undefined;
  process.env.SENTIPH_API_ORIGIN = undefined;
  process.env.SENTIPH_API_BASE = undefined;
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  process.argv = originalArgv;
  process.env = originalEnv;
});

// Convenience: set argv so cli.ts's `args` and `command` are as desired
const setArgv = (...rest: string[]) => {
  process.argv = ["node", "cli.js", ...rest];
};

// --------------------------------------------------------------------------
// Tests — start / default command
// --------------------------------------------------------------------------

describe("cli.ts — start (default command)", () => {
  it("calls createApiServer and starts on the default port when no command given", async () => {
    setArgv();

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockCreateApiServer).toHaveBeenCalledOnce();
    expect(mockApiStart).toHaveBeenCalledWith(8787, "127.0.0.1");
    expect(mockWriteRuntimeMetadata).toHaveBeenCalledOnce();
  });

  it("uses 'start' command explicitly", async () => {
    setArgv("start");

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockApiStart).toHaveBeenCalledOnce();
  });

  it("reads SENTIPH_API_PORT for preferred start port", async () => {
    setArgv("start");
    process.env.SENTIPH_API_PORT = "9000";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockApiStart).toHaveBeenCalledWith(9000, "127.0.0.1");
  });

  it("reads PORT env var as fallback", async () => {
    setArgv("start");
    process.env.PORT = "9001";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockApiStart).toHaveBeenCalledWith(9001, "127.0.0.1");
  });

  it("falls back to DEFAULT_START_PORT when SENTIPH_API_PORT is invalid", async () => {
    setArgv("start");
    process.env.SENTIPH_API_PORT = "not-a-port";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockApiStart).toHaveBeenCalledWith(8787, "127.0.0.1");
  });

  it("falls back to DEFAULT_START_PORT when port is 0 (out of range)", async () => {
    setArgv("start");
    process.env.SENTIPH_API_PORT = "0";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockApiStart).toHaveBeenCalledWith(8787, "127.0.0.1");
  });

  it("falls back to DEFAULT_START_PORT when port is 65536 (out of range)", async () => {
    setArgv("start");
    process.env.SENTIPH_API_PORT = "65536";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockApiStart).toHaveBeenCalledWith(8787, "127.0.0.1");
  });

  it("uses project state dir from existing config when project is initialized", async () => {
    setArgv("start");
    mockLoadProjectConfig.mockReturnValueOnce({ displayName: "my-project" });
    mockResolveProjectStateDir.mockReturnValueOnce("/state/my-project");

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockRegisterProject).toHaveBeenCalled();
    expect(mockMigrateStateToGlobal).toHaveBeenCalled();
  });

  it("uses ephemeral state dir when project is not initialized", async () => {
    setArgv("start");
    mockLoadProjectConfig.mockReturnValueOnce(null);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockResolveEphemeralProjectStateDir).toHaveBeenCalled();
  });

  it("exits when startup prerequisites have errors", async () => {
    setArgv("start");
    mockCollectStartupPrerequisiteReport.mockReturnValueOnce({
      errors: ["Missing claude binary"],
      warnings: [],
    });
    mockFormatStartupPrerequisiteReport.mockReturnValueOnce(["ERROR: Missing claude binary"]);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("emits warnings but continues when prerequisites have warnings only", async () => {
    setArgv("start");
    mockCollectStartupPrerequisiteReport.mockReturnValueOnce({ errors: [], warnings: ["slow"] });
    mockFormatStartupPrerequisiteReport.mockReturnValueOnce(["WARN: slow"]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(warnSpy).toHaveBeenCalled();
    expect(mockApiStart).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });

  it("finds next open port when preferred is in use (net error event fires)", async () => {
    setArgv("start");

    let callCount = 0;
    mockCreateServer.mockImplementation(() => {
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      const server = {
        once: (event: string, cb: (...args: unknown[]) => void) => {
          listeners[event] = listeners[event] ?? [];
          listeners[event]?.push(cb);
          if (event === "error" && callCount === 0) {
            // First port attempt fails
            callCount++;
            Promise.resolve().then(() => {
              for (const fn of listeners.error ?? []) fn(new Error("EADDRINUSE"));
            });
          } else if (event === "listening" && callCount > 0) {
            // Second port attempt succeeds
            Promise.resolve().then(() => {
              for (const fn of listeners.listening ?? []) fn();
            });
          }
        },
        listen: vi.fn(),
        close: vi.fn((cb?: () => void) => {
          if (cb) cb();
        }),
      };
      return server;
    });

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should have tried port 8788 after 8787 was in use
    expect(mockApiStart).toHaveBeenCalledWith(8788, "127.0.0.1");
  });
});

// --------------------------------------------------------------------------
// Tests — init command
// --------------------------------------------------------------------------

describe("cli.ts — init command", () => {
  it("initializes a project without a name argument", async () => {
    setArgv("init");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockEnsureProjectScaffold.mockReturnValueOnce({ displayName: "my-dir" });

    await import("../src/cli");

    expect(mockEnsureProjectScaffold).toHaveBeenCalledOnce();
    expect(mockEnsureSentiphGitignoreEntry).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Initialized|Updated/));

    logSpy.mockRestore();
  });

  it("passes name argument to ensureProjectScaffold", async () => {
    setArgv("init", "my-cool-project");

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockEnsureProjectScaffold.mockReturnValueOnce({ displayName: "my-cool-project" });
    // First loadProjectConfig call is in initializeProject (hadConfig check)
    mockLoadProjectConfig.mockReturnValueOnce({ displayName: "my-cool-project" });

    await import("../src/cli");

    expect(mockEnsureProjectScaffold).toHaveBeenCalledWith(expect.any(String), "my-cool-project");
  });

  it("logs 'Updated' when project already had config", async () => {
    setArgv("init");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    // loadProjectConfig called twice: once in initializeProject for hadConfig, once later
    mockLoadProjectConfig.mockReturnValueOnce({ displayName: "existing" }); // hadConfig = true
    mockEnsureProjectScaffold.mockReturnValueOnce({ displayName: "existing" });

    await import("../src/cli");

    const logged = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("Updated"),
    );
    expect(logged).toBe(true);

    logSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — projects command
// --------------------------------------------------------------------------

describe("cli.ts — projects command", () => {
  it("logs 'No projects registered yet' when registry is empty", async () => {
    setArgv("projects");
    mockLoadProjectsRegistry.mockReturnValueOnce({ projects: [] });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");

    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/No projects registered/));

    logSpy.mockRestore();
  });

  it("lists each project when registry has entries", async () => {
    setArgv("projects");
    mockLoadProjectsRegistry.mockReturnValueOnce({
      projects: [{ id: "proj-1", name: "My Project", path: "/home/user/my-project" }],
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");

    const printed = logSpy.mock.calls.some(
      (call) =>
        typeof call[0] === "string" && call[0].includes("proj-1") && call[0].includes("My Project"),
    );
    expect(printed).toBe(true);

    logSpy.mockRestore();
  });

  it("also responds to 'project' singular alias", async () => {
    setArgv("project");
    mockLoadProjectsRegistry.mockReturnValueOnce({ projects: [] });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");

    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — terminal create
// --------------------------------------------------------------------------

describe("cli.ts — terminal create", () => {
  beforeEach(() => {
    process.env.SENTIPH_API_ORIGIN = "http://127.0.0.1:8787";
  });

  it("posts to /api/terminals with minimal body", async () => {
    setArgv("terminal", "create");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ terminalId: "term-abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/terminals",
      expect.objectContaining({ method: "POST" }),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Created terminal "term-abc"/));

    logSpy.mockRestore();
  });

  it("includes --name flag in body", async () => {
    setArgv("terminal", "create", "--name", "my-term");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ terminalId: "t1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.name).toBe("my-term");
  });

  it("includes -n short flag in body", async () => {
    setArgv("terminal", "create", "-n", "short-name");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ terminalId: "t2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.name).toBe("short-name");
  });

  it("exits with 1 and logs error when response is not ok", async () => {
    setArgv("terminal", "create");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("calls apiError when fetch throws", async () => {
    setArgv("terminal", "create");

    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("connection refused"));

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — terminal list
// --------------------------------------------------------------------------

describe("cli.ts — terminal list", () => {
  beforeEach(() => {
    process.env.SENTIPH_API_ORIGIN = "http://127.0.0.1:8787";
  });

  it("logs 'No terminals found' when list is empty", async () => {
    setArgv("terminal", "list");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logSpy).toHaveBeenCalledWith("No terminals found.");

    logSpy.mockRestore();
  });

  it("prints terminal rows for each terminal", async () => {
    setArgv("terminal", "ls");

    const terminals = [
      {
        terminalId: "t-1",
        tentacleName: "Alpha",
        lifecycleState: "running",
        processId: 1234,
        lifecycleReason: "normal",
      },
    ];

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify(terminals), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const printed = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("t-1"),
    );
    expect(printed).toBe(true);

    logSpy.mockRestore();
  });

  it("exits when fetch returns non-ok", async () => {
    setArgv("terminal", "list");

    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Internal error", { status: 500 }));

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — terminal stop / kill
// --------------------------------------------------------------------------

describe("cli.ts — terminal stop/kill", () => {
  beforeEach(() => {
    process.env.SENTIPH_API_ORIGIN = "http://127.0.0.1:8787";
  });

  it("stops a terminal by ID", async () => {
    setArgv("terminal", "stop", "term-xyz");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ terminalId: "term-xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Stopped terminal "term-xyz"/));

    logSpy.mockRestore();
  });

  it("kills a terminal by ID", async () => {
    setArgv("terminal", "kill", "term-xyz");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ terminalId: "term-xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Killed terminal "term-xyz"/));

    logSpy.mockRestore();
  });

  it("exits with 1 when terminalId is missing for stop", async () => {
    setArgv("terminal", "stop");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("exits with 1 when terminalId starts with '-' (looks like a flag)", async () => {
    setArgv("terminal", "stop", "--flag");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("exits with 1 when stop response is not ok", async () => {
    setArgv("terminal", "stop", "bad-term");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — terminal prune
// --------------------------------------------------------------------------

describe("cli.ts — terminal prune", () => {
  beforeEach(() => {
    process.env.SENTIPH_API_ORIGIN = "http://127.0.0.1:8787";
  });

  it("logs 'No stale terminals' when prune returns empty list", async () => {
    setArgv("terminal", "prune");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ prunedTerminalIds: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/No stale, stopped, or exited terminals/),
    );

    logSpy.mockRestore();
  });

  it("reports number of pruned terminals", async () => {
    setArgv("terminal", "prune");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ prunedTerminalIds: ["t1", "t2"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const printed = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("Pruned 2 terminal(s)"),
    );
    expect(printed).toBe(true);

    logSpy.mockRestore();
  });

  it("exits with 1 on prune error response", async () => {
    setArgv("terminal", "prune");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — channel send / list
// --------------------------------------------------------------------------

describe("cli.ts — channel send", () => {
  beforeEach(() => {
    process.env.SENTIPH_API_ORIGIN = "http://127.0.0.1:8787";
    process.env.SENTIPH_SESSION_ID = undefined;
  });

  it("POSTs to /api/channels/:id/messages with content and default sender", async () => {
    setArgv("channel", "send", "terminal-2", "need review");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ messageId: "m-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://127.0.0.1:8787/api/channels/terminal-2/messages");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body).toEqual({ fromTerminalId: "cli", content: "need review" });
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Sent message/));

    logSpy.mockRestore();
  });

  it("uses --from flag as the sender, regardless of position", async () => {
    setArgv("channel", "send", "terminal-2", "done", "--from", "terminal-1");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ messageId: "m-2" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body).toEqual({ fromTerminalId: "terminal-1", content: "done" });
  });

  it("falls back to SENTIPH_SESSION_ID when --from is omitted", async () => {
    setArgv("channel", "send", "terminal-2", "hi");
    process.env.SENTIPH_SESSION_ID = "terminal-9";

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ messageId: "m-3" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.fromTerminalId).toBe("terminal-9");
  });

  it("exits 1 when terminalId is missing", async () => {
    setArgv("channel", "send");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("exits 1 and prints server error when response is not ok", async () => {
    setArgv("channel", "send", "ghost", "hi");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Target terminal not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe("cli.ts — channel list", () => {
  beforeEach(() => {
    process.env.SENTIPH_API_ORIGIN = "http://127.0.0.1:8787";
  });

  it("prints 'No messages.' when channel is empty", async () => {
    setArgv("channel", "list", "terminal-2");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(logSpy).toHaveBeenCalledWith("No messages.");
    logSpy.mockRestore();
  });

  it("prints a row per message with delivery status", async () => {
    setArgv("channel", "list", "terminal-2");

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            fromTerminalId: "terminal-1",
            toTerminalId: "terminal-2",
            content: "hello",
            delivered: false,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const printed = logSpy.mock.calls.some(
      (call) =>
        typeof call[0] === "string" && call[0].includes("queued") && call[0].includes("hello"),
    );
    expect(printed).toBe(true);
    logSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — unknown command → usage help
// --------------------------------------------------------------------------

describe("cli.ts — unknown command prints usage and exits 1", () => {
  it("prints usage and exits 1 for unrecognised commands", async () => {
    setArgv("not-a-real-command");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    const usagePrinted = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("Usage:"),
    );
    expect(usagePrinted).toBe(true);

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
// Tests — resolveRuntimeApiBase branches
// --------------------------------------------------------------------------

describe("cli.ts — resolveRuntimeApiBase", () => {
  it("uses SENTIPH_API_ORIGIN env when set", async () => {
    setArgv("terminal", "list");
    process.env.SENTIPH_API_ORIGIN = "http://custom-host:1234";

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("http://custom-host:1234");
  });

  it("uses runtimeMetadata.apiBaseUrl when project config exists", async () => {
    setArgv("terminal", "list");
    process.env.SENTIPH_API_ORIGIN = undefined;
    process.env.SENTIPH_API_BASE = undefined;

    mockLoadProjectConfig.mockReturnValueOnce({ displayName: "my-project" });
    mockResolveProjectStateDir.mockReturnValueOnce("/state/my-project");
    mockReadRuntimeMetadata.mockReturnValueOnce({
      apiBaseUrl: "http://127.0.0.1:9999",
      host: "127.0.0.1",
      port: 9999,
      pid: 1,
      startedAt: "",
      workspaceCwd: "",
    });

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("http://127.0.0.1:9999");
  });
});

// --------------------------------------------------------------------------
// Tests — maybeOpenBrowser
// --------------------------------------------------------------------------

describe("cli.ts — maybeOpenBrowser is suppressed by env", () => {
  it("does not call spawn when SENTIPH_NO_OPEN=1", async () => {
    setArgv("start");
    process.env.SENTIPH_NO_OPEN = "1";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does not call spawn when CI=1", async () => {
    setArgv("start");
    process.env.SENTIPH_NO_OPEN = undefined;
    process.env.CI = "1";

    await import("../src/cli");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockSpawn).not.toHaveBeenCalled();

    process.env.CI = undefined;
  });
});
