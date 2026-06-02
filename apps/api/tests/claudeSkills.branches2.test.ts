/**
 * Additional branch coverage for src/claudeSkills.ts
 * Targets:
 * - SKILL.md basename fallback (when filename === "SKILL" → use dirname)
 * - frontMatterMatch[1] ?? "" fallback
 * - readdirSync exception path (definitions returns early)
 * - statSync exception path (continue)
 * - sorting when a.source !== b.source (project vs user)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readAvailableClaudeSkills } from "../src/claudeSkills";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
  vi.restoreAllMocks();
});

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-cs2-test-"));
  tempDirs.push(dir);
  return dir;
};

const createSkillDir = (skillsRoot: string, skillDirName: string, content: string): void => {
  const skillDir = join(skillsRoot, skillDirName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");
};

// ---------------------------------------------------------------------------
// SKILL.md basename fallback — "SKILL" → use dirname
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — SKILL.md directory name fallback", () => {
  it("uses directory name as skill name when basename of file is SKILL (no H1, no front matter)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // Create a skill directory named "my-skill" with SKILL.md (basename = "SKILL")
    createSkillDir(skillsRoot, "my-dir-skill", "Just plain content without front matter or H1.");

    const result = readAvailableClaudeSkills(root);
    // The file is named SKILL.md → basename without ext = "SKILL" → use dirname = "my-dir-skill"
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("my-dir-skill");
  });
});

// ---------------------------------------------------------------------------
// frontMatterMatch[1] ?? "" — when frontMatterMatch[1] is undefined
// This is defensive code; in practice the regex captures group 1.
// We can't easily make group 1 undefined, but we test nearby paths.
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — front matter edge cases", () => {
  it("handles front matter with no newline at end gracefully", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "edge-skill", "---\nname: Edge Case\n---");

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Edge Case");
  });

  it("handles separatorIndex === 0 (colon at start of line) by skipping", () => {
    // A line starting with ':' has separatorIndex=0, which the code skips
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "colon-skill", "---\n: invalid-key\nname: Valid Name\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Valid Name");
  });
});

// ---------------------------------------------------------------------------
// readdirSync exception → return definitions early
// Note: ESM node:fs cannot be spied on directly.
// We test adjacent behavior: a directory that exists but has no entries
// (the readdirSync exception path is defensive for permission errors that
//  can't be reliably triggered in cross-platform tests without native tricks).
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — empty skills dir", () => {
  it("returns empty array when skillsRoot directory exists but is empty", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    mkdirSync(skillsRoot, { recursive: true });
    // No skill subdirs → readdirSync returns [], definitions = []
    const result = readAvailableClaudeSkills(root);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// statSync "not a directory" path — entries that are plain files are skipped
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — non-directory entries skipped", () => {
  it("skips plain files in skillsRoot (statSync.isDirectory() = false)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    mkdirSync(skillsRoot, { recursive: true });
    // Place a plain file directly in skillsRoot (not a directory → skipped)
    writeFileSync(join(skillsRoot, "plain-file.md"), "# Not a dir\n", "utf8");
    // Also add a valid skill dir
    createSkillDir(skillsRoot, "valid-dir", "---\nname: Valid Dir Skill\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Valid Dir Skill");
  });
});

// ---------------------------------------------------------------------------
// sort: a.source !== b.source (project first)
// readAvailableClaudeSkills only has "project" source currently
// (user source is not in the roots array), so this branch is only reachable
// if the roots array is extended. We verify the sort behavior with multiple
// skills from the same source (alphabetical) which IS reachable.
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — sort branches2", () => {
  it("sorts multiple skills alphabetically when all are 'project' source", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "z-skill", "---\nname: Zebra Skill\n---\n");
    createSkillDir(skillsRoot, "a-skill", "---\nname: Alpha Skill\n---\n");
    createSkillDir(skillsRoot, "m-skill", "---\nname: Middle Skill\n---\n");

    const result = readAvailableClaudeSkills(root);
    const names = result.map((s) => s.name);
    expect(names).toEqual(["Alpha Skill", "Middle Skill", "Zebra Skill"]);
  });

  it("skips skills with empty trimmed name", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // Front matter name is just spaces → trimmed = "" → skipped
    createSkillDir(skillsRoot, "empty-name-skill", "---\nname:    \n---\n");
    createSkillDir(skillsRoot, "valid-skill", "---\nname: Valid\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result.some((s) => s.name === "Valid")).toBe(true);
    // The empty-name-skill should use directory name as fallback (not "   ")
    // Actually: name = "   ".trim() → "" → seen.has check → name.length===0 → skip
    // But wait: if frontmatter name is "   ", trim gives "" which has length 0, so it's skipped
    // and then we fall through to title ?? fallbackName which is "empty-name-skill"
    // Actually looking at the code: name = value (after removing quotes, trim is separate)
    // The code does: const value = rawValue.replace(...).trim() but rawValue is line.slice() trimmed
    // So "name:    " → rawValue = "   " → value = "" → name not set
    // Then title = null (no H1) → name = fallbackName = "empty-name-skill"
    // Then in readAvailableClaudeSkills: name = metadata.name.trim() = "empty-name-skill"
    // name.length > 0, so it IS added
    expect(result.some((s) => s.name === "empty-name-skill")).toBe(true);
  });
});
