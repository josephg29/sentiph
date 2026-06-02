/**
 * Additional branch coverage for src/projectPersistence.ts
 * Targets uncovered branches identified in the HTML coverage report:
 * - !isRecord(value) in toProjectRegistryEntry
 * - workspaceCwd match in toProjectRegistryEntry (legacy path)
 * - ensureGlobalSentiphDir when dir doesn't exist
 * - loadProjectsRegistry when file doesn't exist / invalid
 * - !isRecord(parsed) || !Array.isArray in loadProjectsRegistry
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GLOBAL_SENTIPH_DIR,
  PROJECTS_FILE,
  ensureProjectConfig,
  loadProjectConfig,
  loadProjectsRegistry,
  migrateStateToGlobal,
  registerProject,
  resolveProjectStateDir,
  saveProjectsRegistry,
} from "../src/projectPersistence";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-pp2-test-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// loadProjectsRegistry — !existsSync(PROJECTS_FILE) branch
// (we can't easily redirect PROJECTS_FILE, but we can verify the function
//  returns an empty projects array when called — covers the guard)
// ---------------------------------------------------------------------------
describe("loadProjectsRegistry — branches2", () => {
  it("always returns an object with a projects array", () => {
    const registry = loadProjectsRegistry();
    expect(registry).toHaveProperty("projects");
    expect(Array.isArray(registry.projects)).toBe(true);
  });

  it("filters out entries with missing required fields from projects.json", () => {
    // Save a registry with one valid and one invalid entry
    const original = loadProjectsRegistry();
    const mixed = {
      projects: [
        { id: "valid-id", name: "Valid", path: "/valid", createdAt: "2024-01-01T00:00:00.000Z" },
        { notAProject: true }, // invalid — missing id, name, path, createdAt
        null, // will be filtered
        42, // will be filtered
      ],
    };
    saveProjectsRegistry(mixed as never);

    try {
      const reloaded = loadProjectsRegistry();
      const found = reloaded.projects.find((p) => p.id === "valid-id");
      expect(found).toBeDefined();
      // The invalid entries should be filtered
      const invalids = reloaded.projects.filter(
        (p) => p.id !== "valid-id" && !original.projects.some((o) => o.id === p.id),
      );
      expect(invalids).toHaveLength(0);
    } finally {
      saveProjectsRegistry(original);
    }
  });

  it("returns empty projects when projects.json contains invalid JSON", () => {
    // We can test this indirectly by temporarily corrupting the file
    const originalExists = existsSync(PROJECTS_FILE);
    const originalContent = originalExists ? readFileSync(PROJECTS_FILE, "utf8") : null;
    mkdirSync(GLOBAL_SENTIPH_DIR, { recursive: true });
    writeFileSync(PROJECTS_FILE, "NOT VALID JSON {{{", "utf8");
    try {
      const result = loadProjectsRegistry();
      expect(result.projects).toEqual([]);
    } finally {
      if (originalContent !== null) {
        writeFileSync(PROJECTS_FILE, originalContent, "utf8");
      }
    }
  });

  it("returns empty projects when projects.json has no projects array", () => {
    const originalExists = existsSync(PROJECTS_FILE);
    const originalContent = originalExists ? readFileSync(PROJECTS_FILE, "utf8") : null;
    mkdirSync(GLOBAL_SENTIPH_DIR, { recursive: true });
    writeFileSync(PROJECTS_FILE, JSON.stringify({ notProjects: [] }), "utf8");
    try {
      const result = loadProjectsRegistry();
      expect(result.projects).toEqual([]);
    } finally {
      if (originalContent !== null) {
        writeFileSync(PROJECTS_FILE, originalContent, "utf8");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// toProjectRegistryEntry — legacy path (workspaceCwd match without id field)
// ---------------------------------------------------------------------------
describe("registerProject — legacy entry handling branches2", () => {
  it("loads projects including legacy entries that match workspace path", () => {
    // Write a projects.json with a legacy entry (name+path but no id)
    const workspace = makeTempDir();
    const legacyName = "legacy-test-project";

    const originalExists = existsSync(PROJECTS_FILE);
    const originalContent = originalExists ? readFileSync(PROJECTS_FILE, "utf8") : null;

    mkdirSync(GLOBAL_SENTIPH_DIR, { recursive: true });
    writeFileSync(
      PROJECTS_FILE,
      `${JSON.stringify({
        projects: [{ name: legacyName, path: workspace, createdAt: "2023-01-01T00:00:00.000Z" }],
      })}\n`,
      "utf8",
    );

    try {
      // ensureProjectConfig will find the legacy name and use it
      const config = ensureProjectConfig(workspace);
      expect(config.displayName).toBe(legacyName);
    } finally {
      if (originalContent !== null) {
        writeFileSync(PROJECTS_FILE, originalContent, "utf8");
      } else if (existsSync(PROJECTS_FILE)) {
        // Restore to safe state
        const current = loadProjectsRegistry();
        saveProjectsRegistry({
          projects: current.projects.filter((p) => p.path !== workspace),
        });
      }
    }
  });

  it("registerProject updates existing entry (path and lastOpenedAt) when id matches", () => {
    const workspace = makeTempDir();
    // First registration creates entry
    const first = registerProject(workspace, "First Call");
    const firstOpened = first.lastOpenedAt;

    // Second registration should update path and lastOpenedAt
    const second = registerProject(workspace, "First Call");
    expect(second.id).toBe(first.id);
    // lastOpenedAt should be >= firstOpened
    expect((second.lastOpenedAt ?? "") >= (firstOpened ?? "")).toBe(true);

    // Clean up
    const registry = loadProjectsRegistry();
    saveProjectsRegistry({
      projects: registry.projects.filter((p) => p.id !== first.id),
    });
    const projectDir = join(GLOBAL_SENTIPH_DIR, "projects", first.id);
    rmSync(projectDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// migrateStateToGlobal — legacy global transcript branch
// ---------------------------------------------------------------------------
describe("migrateStateToGlobal — legacy transcript branch2", () => {
  it("copies legacy global transcripts when local source is absent", () => {
    const workspace = makeTempDir();
    const newProjectDir = makeTempDir();

    // Set up workspace config
    mkdirSync(join(workspace, ".sentiph"), { recursive: true });
    writeFileSync(
      join(workspace, ".sentiph", "project.json"),
      `${JSON.stringify({
        version: 1,
        projectId: "test-pp2-proj-id",
        displayName: "Test Project",
        createdAt: "2024-01-01T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    const legacyName = "pp2-legacy-project";
    const legacyDir = join(GLOBAL_SENTIPH_DIR, "projects", legacyName);
    const legacyTranscripts = join(legacyDir, "state", "transcripts");
    mkdirSync(legacyTranscripts, { recursive: true });
    writeFileSync(join(legacyTranscripts, "session-legacy.txt"), "legacy content", "utf8");

    const originalExists = existsSync(PROJECTS_FILE);
    const originalContent = originalExists ? readFileSync(PROJECTS_FILE, "utf8") : null;

    mkdirSync(GLOBAL_SENTIPH_DIR, { recursive: true });
    writeFileSync(
      PROJECTS_FILE,
      `${JSON.stringify({
        projects: [{ name: legacyName, path: workspace, createdAt: "2023-01-01T00:00:00.000Z" }],
      })}\n`,
      "utf8",
    );

    try {
      migrateStateToGlobal(workspace, newProjectDir);
      expect(existsSync(join(newProjectDir, "state", "transcripts", "session-legacy.txt"))).toBe(
        true,
      );
    } finally {
      if (originalContent !== null) {
        writeFileSync(PROJECTS_FILE, originalContent, "utf8");
      }
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });

  it("migrates state file from legacy global dir when local source absent", () => {
    const workspace = makeTempDir();
    const newProjectDir = makeTempDir();

    mkdirSync(join(workspace, ".sentiph"), { recursive: true });
    writeFileSync(
      join(workspace, ".sentiph", "project.json"),
      `${JSON.stringify({
        version: 1,
        projectId: "test-pp2-proj-id2",
        displayName: "Test Project 2",
        createdAt: "2024-01-01T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    const legacyName = "pp2-legacy-project-2";
    const legacyDir = join(GLOBAL_SENTIPH_DIR, "projects", legacyName);
    const legacyState = join(legacyDir, "state");
    mkdirSync(legacyState, { recursive: true });
    writeFileSync(join(legacyState, "runtime.json"), JSON.stringify({ source: "legacy" }), "utf8");

    const originalExists = existsSync(PROJECTS_FILE);
    const originalContent = originalExists ? readFileSync(PROJECTS_FILE, "utf8") : null;

    mkdirSync(GLOBAL_SENTIPH_DIR, { recursive: true });
    writeFileSync(
      PROJECTS_FILE,
      `${JSON.stringify({
        projects: [{ name: legacyName, path: workspace, createdAt: "2023-01-01T00:00:00.000Z" }],
      })}\n`,
      "utf8",
    );

    try {
      migrateStateToGlobal(workspace, newProjectDir);
      expect(existsSync(join(newProjectDir, "state", "runtime.json"))).toBe(true);
    } finally {
      if (originalContent !== null) {
        writeFileSync(PROJECTS_FILE, originalContent, "utf8");
      }
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});
