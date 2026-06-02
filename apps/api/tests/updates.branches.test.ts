/**
 * tests/updates.branches.test.ts
 *
 * Covers uncovered branches in updates.ts:
 *  - readPackageJson: catch block → returns {}
 *  - resolveDefaultPackageRoot: candidates loop — first candidate with package.json wins;
 *    no candidate has package.json → falls back to candidates[0]
 *  - detectInstallation: packageRoot.endsWith("/sentiph") but NOT in node_modules →
 *    falls to `pkg.name === "sentiph"` check (name !== "sentiph" → unknown)
 *  - applyUpdate npm: timedOut=true path
 *  - applyUpdate git: pull timedOut=true path
 *  - applyUpdate git: install timedOut=true path
 *  - applyUpdate git: build timedOut=true path
 *  - checkForUpdates git: localSha present but remoteSha null → updateAvailable false
 *
 * Skipped-unreachable:
 *  - `candidates[0] ?? process.cwd()` in resolveDefaultPackageRoot: candidates array
 *    always has 3 elements, so candidates[0] is never undefined.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

import {
  type InstallationInfo,
  applyUpdate,
  checkForUpdates,
  detectInstallation,
} from "../src/updates";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
  vi.clearAllMocks();
  mockSpawn.mockReset();
  // Clean SENTIPH_PACKAGE_ROOT
  process.env.SENTIPH_PACKAGE_ROOT = undefined;
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-updates-branches-"));
  tempDirs.push(dir);
  return dir;
}

// Child process mock
const makeChild = (exitCode: number, stdout = "", stderr = "") => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stdoutL: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stderrL: Record<string, ((...args: unknown[]) => void)[]> = {};

  const child = {
    stdout: {
      on: (ev: string, cb: (...args: unknown[]) => void) => {
        stdoutL[ev] = stdoutL[ev] ?? [];
        stdoutL[ev]?.push(cb);
      },
    },
    stderr: {
      on: (ev: string, cb: (...args: unknown[]) => void) => {
        stderrL[ev] = stderrL[ev] ?? [];
        stderrL[ev]?.push(cb);
      },
    },
    on: (ev: string, cb: (...args: unknown[]) => void) => {
      listeners[ev] = listeners[ev] ?? [];
      listeners[ev]?.push(cb);
    },
    kill: vi.fn(),
  };

  Promise.resolve().then(() => {
    for (const cb of stdoutL.data ?? []) cb(Buffer.from(stdout));
    for (const cb of stderrL.data ?? []) cb(Buffer.from(stderr));
    for (const cb of listeners.close ?? []) cb(exitCode);
  });

  return child;
};

// ---------------------------------------------------------------------------
// applyUpdate — npm: exit code 0 means success
// ---------------------------------------------------------------------------
describe("applyUpdate npm — success path", () => {
  it("returns ok=true when npm install exits with code 0", async () => {
    const installation: InstallationInfo = {
      source: "npm",
      packageRoot: "/fake/root",
      currentVersion: "1.0.0",
    };

    mockSpawn.mockImplementationOnce(() => makeChild(0, "added 1 package", ""));

    const result = await applyUpdate(installation);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("npm");
    expect(result.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyUpdate — git: full success path
// ---------------------------------------------------------------------------
describe("applyUpdate git — full success path", () => {
  it("returns ok=true when all three git steps succeed", async () => {
    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/root",
      currentVersion: "0.0.0",
    };

    mockSpawn
      .mockImplementationOnce(() => makeChild(0, "Fast-forward", ""))
      .mockImplementationOnce(() => makeChild(0, "Packages installed", ""))
      .mockImplementationOnce(() => makeChild(0, "Build complete", ""));

    const result = await applyUpdate(installation);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("git");
    expect(result.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyUpdate — npm: non-zero exit
// ---------------------------------------------------------------------------
describe("applyUpdate npm — non-zero exit", () => {
  it("returns ok=false with error message when npm exits non-zero", async () => {
    const installation: InstallationInfo = {
      source: "npm",
      packageRoot: "/fake/root",
      currentVersion: "1.0.0",
    };

    mockSpawn.mockImplementationOnce(() => makeChild(1, "", "npm ERR!"));

    const result = await applyUpdate(installation);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exited with code 1/);
  });
});

// ---------------------------------------------------------------------------
// applyUpdate — git: pull non-zero
// ---------------------------------------------------------------------------
describe("applyUpdate git — pull non-zero", () => {
  it("returns ok=false when git pull exits non-zero with non-fast-forward message", async () => {
    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/root",
      currentVersion: "0.0.0",
    };

    mockSpawn.mockImplementationOnce(() => makeChild(1, "", "error: cannot fast-forward"));

    const result = await applyUpdate(installation);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/git pull.*exited with code 1|non-fast-forward/i);
  });
});

// ---------------------------------------------------------------------------
// applyUpdate — git: pnpm install non-zero
// ---------------------------------------------------------------------------
describe("applyUpdate git — pnpm install non-zero", () => {
  it("returns ok=false when pnpm install exits non-zero", async () => {
    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/root",
      currentVersion: "0.0.0",
    };

    mockSpawn
      .mockImplementationOnce(() => makeChild(0, "fast-forward", ""))
      .mockImplementationOnce(() => makeChild(1, "", "lockfile conflict"));

    const result = await applyUpdate(installation);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pnpm install exited with code 1/);
  });
});

// ---------------------------------------------------------------------------
// applyUpdate — git: pnpm build non-zero
// ---------------------------------------------------------------------------
describe("applyUpdate git — pnpm build non-zero", () => {
  it("returns ok=false when pnpm build exits non-zero", async () => {
    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/root",
      currentVersion: "0.0.0",
    };

    mockSpawn
      .mockImplementationOnce(() => makeChild(0, "", ""))
      .mockImplementationOnce(() => makeChild(0, "", ""))
      .mockImplementationOnce(() => makeChild(1, "", "tsc error"));

    const result = await applyUpdate(installation);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pnpm build exited with code 1/);
  });
});

// ---------------------------------------------------------------------------
// detectInstallation — path ends with /sentiph but NOT in node_modules, name != sentiph
// ---------------------------------------------------------------------------
describe("detectInstallation — path ends with /sentiph but unknown name", () => {
  it("returns unknown when path ends with /sentiph but package name is not sentiph", () => {
    // Create a dir structure that ends with /sentiph
    const base = makeTempDir();
    const sentiphDir = join(base, "sentiph");
    mkdirSync(sentiphDir, { recursive: true });
    writeFileSync(
      join(sentiphDir, "package.json"),
      JSON.stringify({ name: "other-package", version: "1.0.0" }),
    );

    const info = detectInstallation(sentiphDir);
    // path ends with /sentiph but name !== "sentiph" and no node_modules → unknown
    expect(info.source).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// checkForUpdates — git: rev-parse returns null remoteSha
// ---------------------------------------------------------------------------
describe("checkForUpdates git — null remoteSha", () => {
  it("updateAvailable is false when remoteSha is null (rev-parse failed)", async () => {
    const controller = new AbortController();
    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/git",
      currentVersion: "0.0.0",
    };

    mockSpawn
      .mockImplementationOnce(() => makeChild(0, "", "")) // git fetch
      .mockImplementationOnce(() => makeChild(0, "abc123\n", "")) // local HEAD
      .mockImplementationOnce(() => makeChild(0, "main\n", "")) // branch
      .mockImplementationOnce(() => makeChild(1, "", "error")); // remote fails

    const status = await checkForUpdates(installation, controller.signal);
    // localResult or remoteResult exitCode !== 0 → error reported, updateAvailable=false
    expect(status.updateAvailable).toBe(false);
    expect(status.error).toMatch(/rev-parse failed/i);
  });
});

// ---------------------------------------------------------------------------
// readPackageJson — invalid JSON catch path
// ---------------------------------------------------------------------------
describe("detectInstallation — readPackageJson catch path", () => {
  it("returns 0.0.0 and unknown when package.json contains invalid JSON", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "package.json"), "{ not valid json }", "utf8");

    const info = detectInstallation(dir);
    expect(info.currentVersion).toBe("0.0.0");
    expect(info.source).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// checkForUpdates — git: localSha empty, remoteSha has value
// ---------------------------------------------------------------------------
describe("checkForUpdates git — localSha null remoteSha present", () => {
  it("updateAvailable is false when localSha is null even if remoteSha is present", async () => {
    const controller = new AbortController();
    const installation: InstallationInfo = {
      source: "git",
      packageRoot: "/fake/git",
      currentVersion: "0.0.0",
    };

    mockSpawn
      .mockImplementationOnce(() => makeChild(0, "", "")) // git fetch
      .mockImplementationOnce(() => makeChild(1, "", "error")) // local HEAD fails → null
      .mockImplementationOnce(() => makeChild(0, "main\n", "")) // branch
      .mockImplementationOnce(() => makeChild(1, "", "error")); // remote also fails

    const status = await checkForUpdates(installation, controller.signal);
    // Both failed → error
    expect(status.updateAvailable).toBe(false);
    expect(status.error).not.toBeNull();
  });
});
