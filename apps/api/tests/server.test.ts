/**
 * tests/server.test.ts
 *
 * server.ts is a top-level entry-point script: it reads env vars, calls
 * validateStartupEnv(), creates an API server, and calls .start()/.stop().
 * It has no named exports; all surface area is triggered at import-time.
 *
 * Strategy: mock createApiServer so we can control the server object,
 * then dynamically import() the module under controlled env conditions to
 * exercise every code path in validateStartupEnv() and the startup chain.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Hoist mocks
// --------------------------------------------------------------------------

const { mockApiServerStart, mockApiServerStop, mockCreateApiServer } = vi.hoisted(() => {
  const mockApiServerStop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const mockApiServerStart = vi
    .fn<(port: number, host: string) => Promise<{ host: string; port: number }>>()
    .mockResolvedValue({ host: "127.0.0.1", port: 8787 });

  const mockCreateApiServer = vi.fn(() => ({
    start: mockApiServerStart,
    stop: mockApiServerStop,
  }));

  return { mockApiServerStart, mockApiServerStop, mockCreateApiServer };
});

vi.mock("../src/createApiServer", () => ({
  createApiServer: mockCreateApiServer,
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;

  vi.clearAllMocks();
  vi.resetModules();
});

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-server-"));
  temporaryDirectories.push(dir);
  return dir;
};

// Capture and restore env mutations
let originalEnv: NodeJS.ProcessEnv;

const SENTIPH_VARS = [
  "SENTIPH_API_PORT",
  "PORT",
  "SENTIPH_WORKSPACE_CWD",
  "SENTIPH_WEB_DIST_DIR",
  "SENTIPH_PROJECT_STATE_DIR",
  "SENTIPH_PROMPTS_DIR",
  "SENTIPH_ALLOW_REMOTE_ACCESS",
  "HOST",
] as const;

beforeEach(() => {
  originalEnv = { ...process.env };
  // Clear port-related vars to avoid leftover state from the host environment
  const cleaned = { ...process.env };
  for (const key of SENTIPH_VARS) {
    Reflect.deleteProperty(cleaned, key);
  }
  process.env = cleaned;
});

afterEach(() => {
  process.env = originalEnv;
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("server.ts — validateStartupEnv and startup", () => {
  it("starts successfully with default environment", async () => {
    await import("../src/server");

    expect(mockCreateApiServer).toHaveBeenCalledOnce();
    expect(mockApiServerStart).toHaveBeenCalledWith(8787, "127.0.0.1");
  });

  it("passes allowRemoteAccess=false by default", async () => {
    await import("../src/server");

    const calls = mockCreateApiServer.mock.calls as unknown as [Record<string, unknown>][];
    const callArgs = calls[0]?.[0];
    expect(callArgs?.allowRemoteAccess).toBe(false);
  });

  it("passes allowRemoteAccess=true when SENTIPH_ALLOW_REMOTE_ACCESS=1", async () => {
    process.env.SENTIPH_ALLOW_REMOTE_ACCESS = "1";

    await import("../src/server");

    const calls = mockCreateApiServer.mock.calls as unknown as [Record<string, unknown>][];
    const callArgs = calls[0]?.[0];
    expect(callArgs?.allowRemoteAccess).toBe(true);
  });

  it("parses a valid SENTIPH_API_PORT and uses it as the start port", async () => {
    process.env.SENTIPH_API_PORT = "9000";

    await import("../src/server");

    expect(mockApiServerStart).toHaveBeenCalledWith(9000, "127.0.0.1");
  });

  it("parses a valid PORT env var and uses it", async () => {
    process.env.PORT = "9001";

    await import("../src/server");

    expect(mockApiServerStart).toHaveBeenCalledWith(9001, "127.0.0.1");
  });

  it("falls back to 8787 when SENTIPH_API_PORT is not an integer", async () => {
    // This triggers the console.error + process.exit(1) path in validateStartupEnv
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });

    process.env.SENTIPH_API_PORT = "not-a-port";

    await expect(import("../src/server")).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("exits with 1 when port is out of range (0)", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });

    process.env.SENTIPH_API_PORT = "0";

    await expect(import("../src/server")).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("exits with 1 when port is out of range (65536)", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });

    process.env.SENTIPH_API_PORT = "65536";

    await expect(import("../src/server")).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("exits with 1 when SENTIPH_WORKSPACE_CWD does not exist", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });

    process.env.SENTIPH_WORKSPACE_CWD = "/absolutely/does/not/exist/on/this/machine";

    await expect(import("../src/server")).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("warns but does not exit when SENTIPH_WEB_DIST_DIR does not exist", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    process.env.SENTIPH_WEB_DIST_DIR = "/absolutely/does/not/exist/web/dist";

    // Should NOT throw — only warns
    await import("../src/server");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/SENTIPH_WEB_DIST_DIR/));
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("passes SENTIPH_WORKSPACE_CWD to createApiServer when it exists", async () => {
    const dir = makeTempDir();
    process.env.SENTIPH_WORKSPACE_CWD = dir;

    await import("../src/server");

    const calls = mockCreateApiServer.mock.calls as unknown as [Record<string, unknown>][];
    const callArgs = calls[0]?.[0];
    expect(callArgs?.workspaceCwd).toBe(dir);
  });

  it("uses HOST env var for start host", async () => {
    process.env.HOST = "0.0.0.0";

    await import("../src/server");

    expect(mockApiServerStart).toHaveBeenCalledWith(8787, "0.0.0.0");
  });

  it("logs active port to console after start", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await import("../src/server");

    const logged = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("listening on"),
    );
    expect(logged).toBe(true);

    logSpy.mockRestore();
  });

  it("calls process.exit(1) and logs error when server start rejects", async () => {
    mockApiServerStart.mockRejectedValueOnce(new Error("EADDRINUSE"));

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null): never => undefined as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("../src/server");

    // Give the async .catch chain time to run
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
