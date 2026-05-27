import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type InstallationSource = "npm" | "git" | "unknown";

export type InstallationInfo = {
  source: InstallationSource;
  packageRoot: string;
  currentVersion: string;
};

const readPackageJson = (packageRoot: string): { version?: unknown; name?: unknown } => {
  try {
    const raw = readFileSync(join(packageRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown; name?: unknown };
    return parsed;
  } catch {
    return {};
  }
};

const resolveDefaultPackageRoot = (): string => {
  const envRoot = process.env.SENTIPH_PACKAGE_ROOT?.trim();
  if (envRoot) {
    return resolve(envRoot);
  }
  const candidates = [
    resolve(import.meta.dirname ?? ".", "../.."),
    resolve(import.meta.dirname ?? ".", "../../.."),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return candidates[0] ?? process.cwd();
};

/**
 * Determines how Sentiph was installed by inspecting the package directory.
 * A `.git` directory means a git-clone dev install; a `node_modules/sentiph` path or
 * `package.json` name `"sentiph"` means an npm global install; otherwise source is "unknown".
 * @param packageRootOverride override the auto-detected package root (useful for tests)
 */
export const detectInstallation = (packageRootOverride?: string): InstallationInfo => {
  const packageRoot = packageRootOverride ?? resolveDefaultPackageRoot();
  const pkg = readPackageJson(packageRoot);
  const currentVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";

  // A git checkout has a .git directory and is the authoritative case for
  // local development. The npm-published tarball never contains .git.
  if (existsSync(join(packageRoot, ".git"))) {
    return { source: "git", packageRoot, currentVersion };
  }
  // npm installs land under a node_modules tree.
  if (packageRoot.includes(`${"node_modules"}/sentiph`) || packageRoot.endsWith("/sentiph")) {
    if (packageRoot.includes("node_modules")) {
      return { source: "npm", packageRoot, currentVersion };
    }
  }
  // Default: treat a non-git directory containing package.json with name
  // "sentiph" as an npm install (covers global npm prefix paths that vary
  // across systems).
  if (pkg.name === "sentiph") {
    return { source: "npm", packageRoot, currentVersion };
  }
  return { source: "unknown", packageRoot, currentVersion };
};

const compareSemver = (a: string, b: string): number => {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split("-")[0]!
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const aa = parse(a);
  const bb = parse(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const fetchNpmLatestVersion = async (
  signal: AbortSignal,
): Promise<{ latestVersion: string | null; error?: string }> => {
  try {
    const res = await fetch("https://registry.npmjs.org/sentiph/latest", { signal });
    if (!res.ok) {
      return { latestVersion: null, error: `npm registry responded ${res.status}` };
    }
    const data = (await res.json()) as { version?: unknown };
    if (typeof data.version !== "string") {
      return { latestVersion: null, error: "npm registry response missing version" };
    }
    return { latestVersion: data.version };
  } catch (error) {
    return {
      latestVersion: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const runCommand = (
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> =>
  new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? -1, stdout, stderr, timedOut });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: -1,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        timedOut,
      });
    });
  });

const fetchGitRemoteHead = async (
  packageRoot: string,
): Promise<{ localSha: string | null; remoteSha: string | null; error?: string }> => {
  const fetchResult = await runCommand("git", ["fetch", "origin", "--quiet"], packageRoot, 30_000);
  if (fetchResult.exitCode !== 0) {
    return {
      localSha: null,
      remoteSha: null,
      error: `git fetch failed: ${fetchResult.stderr.trim() || `exit ${fetchResult.exitCode}`}`,
    };
  }
  const localResult = await runCommand("git", ["rev-parse", "HEAD"], packageRoot, 5_000);
  const branchResult = await runCommand(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    packageRoot,
    5_000,
  );
  const branch = branchResult.stdout.trim() || "main";
  const remoteResult = await runCommand(
    "git",
    ["rev-parse", `origin/${branch}`],
    packageRoot,
    5_000,
  );
  if (localResult.exitCode !== 0 || remoteResult.exitCode !== 0) {
    return {
      localSha: localResult.stdout.trim() || null,
      remoteSha: remoteResult.stdout.trim() || null,
      error: `git rev-parse failed (local exit ${localResult.exitCode}, remote exit ${remoteResult.exitCode})`,
    };
  }
  return {
    localSha: localResult.stdout.trim(),
    remoteSha: remoteResult.stdout.trim(),
  };
};

export type UpdateStatus = {
  source: InstallationSource;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  details: string | null;
  error: string | null;
};

/**
 * Checks whether a newer version is available.
 * For npm installs: fetches `registry.npmjs.org/sentiph/latest` and compares semver.
 * For git installs: runs `git fetch origin` then compares local HEAD SHA to remote.
 * @param signal AbortSignal to cancel in-flight network requests
 */
export const checkForUpdates = async (
  installation: InstallationInfo,
  signal: AbortSignal,
): Promise<UpdateStatus> => {
  if (installation.source === "npm") {
    const { latestVersion, error } = await fetchNpmLatestVersion(signal);
    const updateAvailable =
      latestVersion !== null && compareSemver(latestVersion, installation.currentVersion) > 0;
    return {
      source: "npm",
      currentVersion: installation.currentVersion,
      latestVersion,
      updateAvailable,
      details: updateAvailable
        ? `npm has sentiph@${latestVersion} (you are on ${installation.currentVersion}).`
        : `You are on the latest published version (${installation.currentVersion}).`,
      error: error ?? null,
    };
  }
  if (installation.source === "git") {
    const { localSha, remoteSha, error } = await fetchGitRemoteHead(installation.packageRoot);
    const updateAvailable =
      !!localSha && !!remoteSha && localSha !== remoteSha;
    return {
      source: "git",
      currentVersion: installation.currentVersion,
      latestVersion: remoteSha ? remoteSha.slice(0, 12) : null,
      updateAvailable,
      details: updateAvailable
        ? `origin is ahead (${remoteSha?.slice(0, 12)}). Local HEAD is ${localSha?.slice(0, 12)}.`
        : `Local checkout matches origin HEAD (${localSha?.slice(0, 12) ?? "unknown"}).`,
      error: error ?? null,
    };
  }
  return {
    source: "unknown",
    currentVersion: installation.currentVersion,
    latestVersion: null,
    updateAvailable: false,
    details:
      "Could not determine how Sentiph is installed. Update manually from the source you used to install.",
    error: null,
  };
};

export type ApplyResult = {
  ok: boolean;
  source: InstallationSource;
  output: string;
  error: string | null;
};

/**
 * Applies the pending update in-place.
 * npm installs: runs `npm install -g sentiph@latest` (5-minute timeout).
 * git installs: runs `git pull --ff-only`, then `pnpm install`, then `pnpm build` (10-minute total).
 * A failed sub-step aborts the sequence and reports the error in `ApplyResult`.
 */
export const applyUpdate = async (installation: InstallationInfo): Promise<ApplyResult> => {
  if (installation.source === "npm") {
    const result = await runCommand(
      "npm",
      ["install", "-g", "sentiph@latest"],
      installation.packageRoot,
      300_000,
    );
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (result.timedOut) {
      return {
        ok: false,
        source: "npm",
        output,
        error: "npm install timed out after 5 minutes.",
      };
    }
    return {
      ok: result.exitCode === 0,
      source: "npm",
      output,
      error: result.exitCode === 0 ? null : `npm install exited with code ${result.exitCode}.`,
    };
  }
  if (installation.source === "git") {
    const pull = await runCommand(
      "git",
      ["pull", "--ff-only"],
      installation.packageRoot,
      60_000,
    );
    if (pull.exitCode !== 0) {
      return {
        ok: false,
        source: "git",
        output: `${pull.stdout}\n${pull.stderr}`.trim(),
        error: pull.timedOut
          ? "git pull timed out."
          : `git pull --ff-only exited with code ${pull.exitCode}. Resolve manually (uncommitted changes or non-fast-forward).`,
      };
    }
    const install = await runCommand(
      "pnpm",
      ["install", "--frozen-lockfile=false"],
      installation.packageRoot,
      300_000,
    );
    if (install.exitCode !== 0) {
      return {
        ok: false,
        source: "git",
        output: `${pull.stdout}\n${pull.stderr}\n${install.stdout}\n${install.stderr}`.trim(),
        error: install.timedOut
          ? "pnpm install timed out."
          : `pnpm install exited with code ${install.exitCode}.`,
      };
    }
    const build = await runCommand("pnpm", ["build"], installation.packageRoot, 600_000);
    return {
      ok: build.exitCode === 0,
      source: "git",
      output: `${pull.stdout}\n${pull.stderr}\n${install.stdout}\n${install.stderr}\n${build.stdout}\n${build.stderr}`.trim(),
      error:
        build.exitCode === 0
          ? null
          : build.timedOut
            ? "pnpm build timed out."
            : `pnpm build exited with code ${build.exitCode}.`,
    };
  }
  return {
    ok: false,
    source: "unknown",
    output: "",
    error: "Cannot apply update: installation source is unknown.",
  };
};

/**
 * Spawns a fresh Sentiph process (detached, stdio ignored) then calls `process.exit(0)`
 * after `delayMs` so the new binary starts cleanly without inheriting the old process's
 * open handles. The new child survives because it is detached and unreffed.
 */
export const scheduleSelfRestart = (installation: InstallationInfo, delayMs = 500): void => {
  const binPath = join(installation.packageRoot, "bin", "sentiph");
  setTimeout(() => {
    try {
      const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    } catch (error) {
      console.error("[updates] failed to spawn restart child:", error);
    }
    process.exit(0);
  }, delayMs);
};

export const __testing = {
  compareSemver,
  resolveDefaultPackageRoot,
};
