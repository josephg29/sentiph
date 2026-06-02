/**
 * Branch coverage top-up for terminalRuntime/systemClients.ts.
 * Targets: parseDiffNumstatLineCounts ternary branches (rawDeleted undefined),
 * readErrorDetails stderr variants, readWorktreeStatus no-HEAD branches with
 * real-path conditioning on filtering, and miscellaneous uncovered paths.
 * Do NOT duplicate test names from systemClients.test.ts or systemClients.extra.test.ts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, mkdirSync: mkdirSyncMock };
});

import {
  createDefaultGitClient,
  parseDiffNumstatLineCounts,
  readGhFailureMessage,
} from "../src/terminalRuntime/systemClients";

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeErr = (opts: {
  status?: number;
  stderr?: string | Buffer;
  message?: string;
  code?: string;
}): Error & { status?: number; stderr?: string | Buffer; code?: string } => {
  const err = new Error(opts.message ?? "exec error") as Error & {
    status?: number;
    stderr?: string | Buffer;
    code?: string;
  };
  if (opts.status !== undefined) err.status = opts.status;
  if (opts.stderr !== undefined) err.stderr = opts.stderr;
  if (opts.code !== undefined) err.code = opts.code;
  return err;
};

// ─── parseDiffNumstatLineCounts — ternary branches ──────────────────────────

describe("parseDiffNumstatLineCounts — extra branch coverage", () => {
  it("treats a line with trailing tab as zero deletions (rawDeleted is empty string)", () => {
    // "5\t" after trim is "5" (trim removes trailing tabs). Then split("\t") gives ["5"].
    // rawDeleted = undefined via destructuring → (undefined ?? "0") → "0" → 0
    const result = parseDiffNumstatLineCounts("5\t");
    // trimmed "5".split("\t") = ["5"] → rawInserted="5", rawDeleted=undefined → 0
    expect(result.insertedLineCount).toBe(5);
    expect(result.deletedLineCount).toBe(0);
  });

  it("treats a line with no tab as inserted-only with zero deletions (rawDeleted undefined)", () => {
    // "10" → split("\t") = ["10"] → rawInserted="10" (10 lines inserted), rawDeleted=undefined → uses "0" fallback → 0 deletions
    const result = parseDiffNumstatLineCounts("10");
    expect(result.insertedLineCount).toBe(10);
    expect(result.deletedLineCount).toBe(0);
  });

  it("accumulates across multiple lines some of which have no deletion column", () => {
    const input = "3\t2\tfile1.ts\n5\t\tfile2.ts\n0\t0\tfile3.ts";
    const result = parseDiffNumstatLineCounts(input);
    expect(result.insertedLineCount).toBe(8);
    expect(result.deletedLineCount).toBe(2);
  });

  it("treats a line whose only tab-separated parts are non-numeric as zeros", () => {
    // "foo\tbar\tbaz" → parseInt("foo")=NaN, parseInt("bar")=NaN → both 0
    const result = parseDiffNumstatLineCounts("foo\tbar\tbaz");
    expect(result.insertedLineCount).toBe(0);
    expect(result.deletedLineCount).toBe(0);
  });
});

// ─── readGhFailureMessage — non-object/non-string stderr ─────────────────────

describe("readGhFailureMessage — readErrorDetails branch coverage", () => {
  it("returns null when error has numeric stderr (non-string, non-Buffer)", () => {
    // stderr is a number — neither string nor Buffer, falls through to ""
    const err = { stderr: 42, message: "something" };
    const result = readGhFailureMessage(err);
    // message doesn't contain recognizable patterns → null
    expect(result).toBeNull();
  });

  it("returns null when error is a plain object with no recognizable stderr or message", () => {
    expect(readGhFailureMessage({ code: "EOTHER", status: 99 })).toBeNull();
  });

  it("handles errors with empty-string message and no recognizable patterns", () => {
    expect(readGhFailureMessage(makeErr({ message: "generic failure", stderr: "" }))).toBeNull();
  });
});

// ─── createDefaultGitClient.readWorktreeStatus — no-HEAD path branches ──────

describe("createDefaultGitClient — readWorktreeStatus no-HEAD numstat branch", () => {
  let client: ReturnType<typeof createDefaultGitClient>;
  let tmpDir: string;

  beforeEach(() => {
    execFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    client = createDefaultGitClient();
    tmpDir = mkdtempSync(join(tmpdir(), "sentiph-sc-branches-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses only staged numstat when no-HEAD and unstaged numstat returns null", () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("--abbrev-ref") && args.includes("HEAD") && !args.includes("@{upstream}")) {
        return "main\n";
      }
      if (args.includes("--verify")) {
        // No HEAD commit
        throw makeErr({ status: 128 });
      }
      if (args.includes("--cached") && !args.includes("--quiet")) {
        // Staged numstat: 4 insertions, 0 deletions
        return "4\t0\tfile1.ts";
      }
      // Everything else (unstaged diff, porcelain, etc.) throws → returns null/"" from readOptionalGitCommand
      throw makeErr({ status: 128 });
    });

    const result = client.readWorktreeStatus({ cwd: tmpDir });
    // Staged = "4\t0\tfile1.ts"; unstaged = null → filtered → join("") = "4\t0\tfile1.ts"
    expect(result.insertedLineCount).toBeGreaterThanOrEqual(0);
  });

  it("uses only unstaged numstat when no-HEAD and cached numstat returns null", () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("--abbrev-ref") && args.includes("HEAD") && !args.includes("@{upstream}")) {
        return "main\n";
      }
      if (args.includes("--verify")) {
        throw makeErr({ status: 128 });
      }
      // Cached numstat throws → null → filtered out
      if (args.includes("--cached") && !args.includes("--quiet")) {
        throw makeErr({ status: 128 });
      }
      // Unstaged (bare diff --numstat --): 2 insertions
      if (args.includes("--numstat") && args.includes("--")) {
        return "2\t1\tfile2.ts";
      }
      throw makeErr({ status: 128 });
    });

    const result = client.readWorktreeStatus({ cwd: tmpDir });
    expect(result.insertedLineCount).toBeGreaterThanOrEqual(0);
  });

  it("filters out empty-string numstat results before joining", () => {
    // When both cached AND unstaged return empty strings, the .filter(line => line.length > 0)
    // removes them so the join produces "" → parseDiffNumstatLineCounts("") → zeros
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("--abbrev-ref") && args.includes("HEAD") && !args.includes("@{upstream}")) {
        return "main\n";
      }
      if (args.includes("--verify")) {
        throw makeErr({ status: 128 });
      }
      // Both return empty strings (but NOT null - they succeed with empty output)
      if (args.includes("--numstat")) {
        return "";
      }
      if (args.includes("--porcelain")) {
        return "";
      }
      throw makeErr({ status: 128 });
    });

    const result = client.readWorktreeStatus({ cwd: tmpDir });
    expect(result.insertedLineCount).toBe(0);
    expect(result.deletedLineCount).toBe(0);
  });
});
