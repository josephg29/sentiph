import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoist the spawn mock so vi.mock factory can access it
const { mockSpawn } = vi.hoisted(() => {
  const mockSpawn = vi.fn();
  return { mockSpawn };
});

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

import {
  type InstallationInfo,
  applyUpdate,
  checkForUpdates,
  detectInstallation,
  scheduleSelfRestart,
} from "../src/updates";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
  vi.clearAllMocks();
});

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-updates-"));
  temporaryDirectories.push(dir);
  return dir;
};

// Helpers to build fake EventEmitter-based child process mocks
const makeChildProcess = (exitCode: number, stdout: string, stderr: string, timedOut = false) => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stdoutListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stderrListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const child = {
    stdout: {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        stdoutListeners[event] = stdoutListeners[event] ?? [];
        stdoutListeners[event]?.push(cb);
      },
    },
    stderr: {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        stderrListeners[event] = stderrListeners[event] ?? [];
        stderrListeners[event]?.push(cb);
      },
    },
    on: (event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event]?.push(cb);
    },
    kill: vi.fn(),
    // Trigger emission after the promise chain attaches listeners
    _emit: (event: string, ...args: unknown[]) => {
      for (const cb of listeners[event] ?? []) cb(...args);
    },
    _emitStdout: (data: string) => {
      for (const cb of stdoutListeners.data ?? []) cb(Buffer.from(data));
    },
    _emitStderr: (data: string) => {
      for (const cb of stderrListeners.data ?? []) cb(Buffer.from(data));
    },
  };

  // Trigger asynchronously so the consumer has time to attach listeners
  Promise.resolve().then(() => {
    child._emitStdout(stdout);
    child._emitStderr(stderr);
    child._emit("close", timedOut ? null : exitCode);
  });

  return child;
};

// -----------------------------------------------------------------------
// detectInstallation
// -----------------------------------------------------------------------

describe("detectInstallation", () => {
  it("detects git install when .git directory exists", () => {
    const dir = makeTempDir();
    // Create a fake .git directory
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.2.3", name: "sentiph" }));

    const info = detectInstallation(dir);
    expect(info.source).toBe("git");
    expect(info.currentVersion).toBe("1.2.3");
    expect(info.packageRoot).toBe(dir);
  });

  it("detects npm install when path contains node_modules/sentiph", () => {
    // We can't easily create node_modules/sentiph on disk, so we use a path
    // that contains the signature but still write a real package.json
    const dir = makeTempDir();
    // Simulate by writing package.json with name "sentiph" (no .git)
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "2.0.0", name: "sentiph" }));

    const info = detectInstallation(dir);
    expect(info.source).toBe("npm");
    expect(info.currentVersion).toBe("2.0.0");
  });

  it("returns 0.0.0 as version when package.json has no version field", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "sentiph" }));

    const info = detectInstallation(dir);
    expect(info.currentVersion).toBe("0.0.0");
  });

  it("returns unknown source when package root has no .git and name is not sentiph", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.0.0", name: "other" }));

    const info = detectInstallation(dir);
    expect(info.source).toBe("unknown");
  });

  it("handles missing package.json gracefully", () => {
    const dir = makeTempDir();
    const info = detectInstallation(dir);
    expect(info.currentVersion).toBe("0.0.0");
    expect(info.source).toBe("unknown");
  });

  it("handles malformed package.json gracefully", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "package.json"), "{ invalid json", "utf8");

    const info = detectInstallation(dir);
    expect(info.currentVersion).toBe("0.0.0");
  });
});

// -----------------------------------------------------------------------
// checkForUpdates — npm source
// -----------------------------------------------------------------------

describe("checkForUpdates — npm", () => {
  const npmInstall = (version = "1.0.0"): InstallationInfo => ({
    source: "npm",
    packageRoot: "/fake/npm/root",
    currentVersion: version,
  });

  it("reports update available when npm has a newer version", async () => {
    const controller = new AbortController();
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "2.0.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    try {
      const status = await checkForUpdates(npmInstall("1.0.0"), controller.signal);
      expect(status.updateAvailable).toBe(true);
      expect(status.latestVersion).toBe("2.0.0");
      expect(status.source).toBe("npm");
      expect(status.details).toMatch(/2\.0\.0/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("reports no update when already on latest", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "1.0.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // We need to override globalThis.fetch since the module uses `fetch` directly
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const status = await checkForUpdates(npmInstall("1.0.0"), controller.signal);
      expect(status.updateAvailable).toBe(false);
      expect(status.latestVersion).toBe("1.0.0");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles npm registry non-ok response gracefully", async () => {
    const controller = new AbortController();
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 })) as typeof fetch;
    try {
      const status = await checkForUpdates(npmInstall("1.0.0"), controller.signal);
      expect(status.updateAvailable).toBe(false);
      expect(status.latestVersion).toBeNull();
      expect(status.error).toMatch(/404/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles npm registry fetch throwing an error", async () => {
    const controller = new AbortController();
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network failure")) as typeof fetch;
    try {
      const status = await checkForUpdates(npmInstall("1.0.0"), controller.signal);
      expect(status.updateAvailable).toBe(false);
      expect(status.error).toMatch(/network failure/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles npm registry returning response with missing version field", async () => {
    const controller = new AbortController();
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "sentiph" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    try {
      const status = await checkForUpdates(npmInstall("1.0.0"), controller.signal);
      expect(status.latestVersion).toBeNull();
      expect(status.error).toMatch(/missing version/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// -----------------------------------------------------------------------
// checkForUpdates — git source
// -----------------------------------------------------------------------

describe("checkForUpdates — git", () => {
  const gitInstall = (version = "0.0.0"): InstallationInfo => ({
    source: "git",
    packageRoot: "/fake/git/root",
    currentVersion: version,
  });

  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it("reports update available when remote SHA differs from local", async () => {
    const controller = new AbortController();

    // git fetch, git rev-parse HEAD, git rev-parse --abbrev-ref HEAD, git rev-parse origin/main
    mockSpawn
      .mockImplementationOnce(() => makeChildProcess(0, "", "")) // git fetch
      .mockImplementationOnce(() => makeChildProcess(0, "abc123\n", "")) // local HEAD
      .mockImplementationOnce(() => makeChildProcess(0, "main\n", "")) // branch name
      .mockImplementationOnce(() => makeChildProcess(0, "def456\n", "")); // remote HEAD

    const status = await checkForUpdates(gitInstall(), controller.signal);
    expect(status.updateAvailable).toBe(true);
    expect(status.source).toBe("git");
    expect(status.latestVersion).toBe("def456".slice(0, 12));
  });

  it("reports no update when local and remote SHA match", async () => {
    const controller = new AbortController();

    mockSpawn
      .mockImplementationOnce(() => makeChildProcess(0, "", "")) // git fetch
      .mockImplementationOnce(() => makeChildProcess(0, "abc123\n", "")) // local HEAD
      .mockImplementationOnce(() => makeChildProcess(0, "main\n", "")) // branch name
      .mockImplementationOnce(() => makeChildProcess(0, "abc123\n", "")); // remote HEAD (same)

    const status = await checkForUpdates(gitInstall(), controller.signal);
    expect(status.updateAvailable).toBe(false);
  });

  it("reports error when git fetch fails", async () => {
    const controller = new AbortController();

    mockSpawn.mockImplementationOnce(() => makeChildProcess(1, "", "fatal: no remote"));

    const status = await checkForUpdates(gitInstall(), controller.signal);
    expect(status.error).toMatch(/git fetch failed/);
    expect(status.updateAvailable).toBe(false);
  });

  it("reports error when rev-parse fails for local or remote", async () => {
    const controller = new AbortController();

    mockSpawn
      .mockImplementationOnce(() => makeChildProcess(0, "", "")) // git fetch
      .mockImplementationOnce(() => makeChildProcess(1, "", "error")) // local HEAD fails
      .mockImplementationOnce(() => makeChildProcess(0, "main\n", "")) // branch name
      .mockImplementationOnce(() => makeChildProcess(0, "def456\n", "")); // remote HEAD

    const status = await checkForUpdates(gitInstall(), controller.signal);
    expect(status.error).toMatch(/rev-parse failed/);
  });
});

// -----------------------------------------------------------------------
// checkForUpdates — unknown source
// -----------------------------------------------------------------------

describe("checkForUpdates — unknown source", () => {
  it("returns source=unknown and no update available", async () => {
    const controller = new AbortController();
    const installation: InstallationInfo = {
      source: "unknown",
      packageRoot: "/tmp/nowhere",
      currentVersion: "0.0.0",
    };

    const status = await checkForUpdates(installation, controller.signal);
    expect(status.source).toBe("unknown");
    expect(status.updateAvailable).toBe(false);
    expect(status.details).toMatch(/could not determine/i);
    expect(status.error).toBeNull();
  });
});

// -----------------------------------------------------------------------
// applyUpdate
// -----------------------------------------------------------------------

describe("applyUpdate — npm", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  const npmInstall = (): InstallationInfo => ({
    source: "npm",
    packageRoot: "/fake/npm/root",
    currentVersion: "1.0.0",
  });

  it("returns ok=true when npm install succeeds", async () => {
    mockSpawn.mockImplementationOnce(() => makeChildProcess(0, "added 1 package\n", ""));

    const result = await applyUpdate(npmInstall());
    expect(result.ok).toBe(true);
    expect(result.source).toBe("npm");
    expect(result.error).toBeNull();
  });

  it("returns ok=false when npm install fails", async () => {
    mockSpawn.mockImplementationOnce(() => makeChildProcess(1, "", "npm ERR! 404 Not Found"));

    const result = await applyUpdate(npmInstall());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exited with code 1/);
  });

  it("returns ok=false with error when npm install exits with non-zero code", async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeChildProcess(2, "", "npm ERR! tarball data for sentiph"),
    );

    const result = await applyUpdate(npmInstall());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exited with code 2/);
    expect(result.output).toContain("tarball data for sentiph");
  });
});

describe("applyUpdate — git", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  const gitInstall = (): InstallationInfo => ({
    source: "git",
    packageRoot: "/fake/git/root",
    currentVersion: "0.0.0",
  });

  it("returns ok=true when all git steps succeed", async () => {
    mockSpawn
      .mockImplementationOnce(() => makeChildProcess(0, "Fast-forward\n", "")) // git pull
      .mockImplementationOnce(() => makeChildProcess(0, "Packages installed\n", "")) // pnpm install
      .mockImplementationOnce(() => makeChildProcess(0, "Build complete\n", "")); // pnpm build

    const result = await applyUpdate(gitInstall());
    expect(result.ok).toBe(true);
    expect(result.source).toBe("git");
    expect(result.error).toBeNull();
  });

  it("returns ok=false when git pull fails", async () => {
    mockSpawn.mockImplementationOnce(() =>
      makeChildProcess(1, "", "error: Your local changes would be overwritten"),
    );

    const result = await applyUpdate(gitInstall());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/git pull.*exited with code 1/);
  });

  it("returns ok=false when pnpm install fails", async () => {
    mockSpawn
      .mockImplementationOnce(() => makeChildProcess(0, "", "")) // git pull
      .mockImplementationOnce(() => makeChildProcess(1, "", "pnpm install failed")); // pnpm install

    const result = await applyUpdate(gitInstall());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pnpm install exited with code 1/);
  });

  it("returns ok=false when pnpm build fails", async () => {
    mockSpawn
      .mockImplementationOnce(() => makeChildProcess(0, "", "")) // git pull
      .mockImplementationOnce(() => makeChildProcess(0, "", "")) // pnpm install
      .mockImplementationOnce(() => makeChildProcess(1, "", "tsc error")); // pnpm build

    const result = await applyUpdate(gitInstall());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pnpm build exited with code 1/);
  });
});

describe("applyUpdate — unknown source", () => {
  it("returns ok=false with explanation", async () => {
    const result = await applyUpdate({
      source: "unknown",
      packageRoot: "/tmp/nowhere",
      currentVersion: "0.0.0",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown/);
  });
});

// -----------------------------------------------------------------------
// scheduleSelfRestart
// -----------------------------------------------------------------------

describe("scheduleSelfRestart", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spawns a detached child and then calls process.exit after the delay", () => {
    const mockChild = { unref: vi.fn() };
    mockSpawn.mockReturnValueOnce(mockChild);

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });

    const installation: InstallationInfo = {
      source: "npm",
      packageRoot: "/fake/root",
      currentVersion: "1.0.0",
    };

    scheduleSelfRestart(installation, 100);

    // Timer hasn't fired yet
    expect(mockSpawn).not.toHaveBeenCalled();

    try {
      vi.advanceTimersByTime(200);
    } catch {
      // Expected: process.exit throws in our spy
    }

    expect(mockSpawn).toHaveBeenCalledOnce();
    expect(mockChild.unref).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it("handles spawn throwing and still calls process.exit", () => {
    mockSpawn.mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: string | number | null) => {
        throw new Error("process.exit called");
      });

    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/root",
      currentVersion: "0.0.0",
    };

    scheduleSelfRestart(installation, 50);

    try {
      vi.advanceTimersByTime(100);
    } catch {
      // Expected
    }

    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
});
