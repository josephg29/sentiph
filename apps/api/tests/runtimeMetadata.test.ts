import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type RuntimeMetadata,
  clearRuntimeMetadata,
  readRuntimeMetadata,
  writeRuntimeMetadata,
} from "../src/runtimeMetadata";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
});

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-rtmd-"));
  temporaryDirectories.push(dir);
  return dir;
};

const validMetadata = (): RuntimeMetadata => ({
  apiBaseUrl: "http://127.0.0.1:8787",
  host: "127.0.0.1",
  port: 8787,
  pid: 12345,
  startedAt: "2026-01-01T00:00:00.000Z",
  workspaceCwd: "/tmp/my-project",
});

describe("writeRuntimeMetadata", () => {
  it("creates the state directory and writes the file", () => {
    const projectStateDir = makeTempDir();
    const meta = validMetadata();

    writeRuntimeMetadata(projectStateDir, meta);

    const read = readRuntimeMetadata(projectStateDir);
    expect(read).toEqual(meta);
  });

  it("overwrites existing metadata with new values", () => {
    const projectStateDir = makeTempDir();
    writeRuntimeMetadata(projectStateDir, validMetadata());

    const updated = { ...validMetadata(), port: 9999, pid: 99999 };
    writeRuntimeMetadata(projectStateDir, updated);

    const read = readRuntimeMetadata(projectStateDir);
    expect(read?.port).toBe(9999);
    expect(read?.pid).toBe(99999);
  });

  it("writes valid JSON with pretty formatting", () => {
    const projectStateDir = makeTempDir();
    writeRuntimeMetadata(projectStateDir, validMetadata());

    const filePath = join(projectStateDir, "state", "runtime.json");
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const raw = readFileSync(filePath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    // Pretty-printed JSON has newlines
    expect(raw).toContain("\n");
  });
});

describe("readRuntimeMetadata", () => {
  it("returns null when file does not exist", () => {
    const projectStateDir = makeTempDir();
    const result = readRuntimeMetadata(projectStateDir);
    expect(result).toBeNull();
  });

  it("returns null when file contains invalid JSON", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    writeFileSync(join(projectStateDir, "state", "runtime.json"), "not-json", "utf8");

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when required field apiBaseUrl is missing", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    const { apiBaseUrl: _removed, ...without } = validMetadata();
    writeFileSync(join(projectStateDir, "state", "runtime.json"), JSON.stringify(without), "utf8");

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when required field host is missing", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    const { host: _removed, ...without } = validMetadata();
    writeFileSync(join(projectStateDir, "state", "runtime.json"), JSON.stringify(without), "utf8");

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when port is not a finite number", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    writeFileSync(
      join(projectStateDir, "state", "runtime.json"),
      JSON.stringify({ ...validMetadata(), port: "not-a-number" }),
      "utf8",
    );

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when port is Infinity", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    writeFileSync(
      join(projectStateDir, "state", "runtime.json"),
      JSON.stringify({ ...validMetadata(), port: null }),
      "utf8",
    );

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when pid is missing", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    const { pid: _removed, ...without } = validMetadata();
    writeFileSync(join(projectStateDir, "state", "runtime.json"), JSON.stringify(without), "utf8");

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when startedAt is not a string", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    writeFileSync(
      join(projectStateDir, "state", "runtime.json"),
      JSON.stringify({ ...validMetadata(), startedAt: 12345 }),
      "utf8",
    );

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when workspaceCwd is missing", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    const { workspaceCwd: _removed, ...without } = validMetadata();
    writeFileSync(join(projectStateDir, "state", "runtime.json"), JSON.stringify(without), "utf8");

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when parsed value is an array (not a record)", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    writeFileSync(
      join(projectStateDir, "state", "runtime.json"),
      JSON.stringify([1, 2, 3]),
      "utf8",
    );

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns null when parsed value is null", () => {
    const projectStateDir = makeTempDir();
    mkdirSync(join(projectStateDir, "state"), { recursive: true });
    writeFileSync(join(projectStateDir, "state", "runtime.json"), "null", "utf8");

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("returns full metadata object when all fields are valid", () => {
    const projectStateDir = makeTempDir();
    const meta = validMetadata();
    writeRuntimeMetadata(projectStateDir, meta);

    const result = readRuntimeMetadata(projectStateDir);
    expect(result).toEqual(meta);
  });
});

describe("clearRuntimeMetadata", () => {
  it("removes the runtime.json file when it exists", () => {
    const projectStateDir = makeTempDir();
    writeRuntimeMetadata(projectStateDir, validMetadata());

    // Verify file exists
    expect(readRuntimeMetadata(projectStateDir)).not.toBeNull();

    clearRuntimeMetadata(projectStateDir);

    expect(readRuntimeMetadata(projectStateDir)).toBeNull();
  });

  it("is a no-op when the file does not exist (does not throw)", () => {
    const projectStateDir = makeTempDir();

    expect(() => clearRuntimeMetadata(projectStateDir)).not.toThrow();
  });

  it("allows writing fresh metadata after clearing", () => {
    const projectStateDir = makeTempDir();
    writeRuntimeMetadata(projectStateDir, validMetadata());
    clearRuntimeMetadata(projectStateDir);

    const fresh = { ...validMetadata(), port: 9999 };
    writeRuntimeMetadata(projectStateDir, fresh);

    expect(readRuntimeMetadata(projectStateDir)?.port).toBe(9999);
  });
});
