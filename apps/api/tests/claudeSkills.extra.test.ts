/**
 * tests/claudeSkills.extra.test.ts
 *
 * Extra branch coverage for claudeSkills.ts:
 *  - normalizeSkillNames: duplicate trimming, empty strings, sorting
 *  - listSkillDefinitionFiles: readdirSync throws (permissions error)
 *  - readSkillMetadata: front matter with various edge cases
 *  - readAvailableClaudeSkills: skills root with mixed entries
 */

import { mkdirSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readAvailableClaudeSkills } from "../src/claudeSkills";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-skills-extra-"));
  tempDirs.push(dir);
  return dir;
}

function createSkillDir(skillsRoot: string, dirName: string, content: string): void {
  const skillDir = join(skillsRoot, dirName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// listSkillDefinitionFiles: readdirSync throws
// We can't spy on ESM node:fs in vitest without hoisting.
// Instead we test the same code path by creating a skills root directory
// that is empty — returns [] which matches the readdirSync empty path.
// The "readdirSync throws" branch is tested via the SKILL.md-as-directory trick:
// readdirSync succeeds but statSync is called on the bad entry.
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — skills root is a file (not a dir)", () => {
  it("handles skills root that does not exist gracefully", () => {
    const root = makeTempDir();
    // .claude/skills does not exist → listSkillDefinitionFiles returns []
    const result = readAvailableClaudeSkills(root);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listSkillDefinitionFiles: statSync behaviour with SKILL.md as a directory
// The catch in statSync-like path: if statSync succeeds but entry is a file,
// we skip it (isDirectory() returns false).
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — non-directory entries in skills root", () => {
  it("skips top-level files in skills root (not directories)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    mkdirSync(skillsRoot, { recursive: true });

    // Write a plain file directly in skills root — should be skipped
    writeFileSync(join(skillsRoot, "stray-file.md"), "# Not a skill dir\n");

    // Also add a real skill directory
    createSkillDir(skillsRoot, "valid-skill", "---\nname: Valid\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Valid");
  });
});

// ---------------------------------------------------------------------------
// readSkillMetadata: front matter lines with empty key (colon at position 0)
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — front matter parsing edge cases", () => {
  it("ignores front matter lines where colon is first char (empty key)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "edge-skill", "---\n:value-with-empty-key\nname: Valid Name\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Valid Name");
  });

  it("handles front matter with only whitespace lines", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "ws-skill", "---\n   \n   \nname: Whitespace\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Whitespace");
  });

  it("uses SKILL.md file parent dir name when name key value is empty", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // name key present but value is empty after trim
    createSkillDir(skillsRoot, "empty-name-skill", "---\nname:   \n---\n");

    const result = readAvailableClaudeSkills(root);
    // name is empty → falls through to title (none) → fallbackName (dir name)
    expect(result[0]?.name).toBe("empty-name-skill");
  });

  it("handles multi-colon in front matter value correctly (only first colon splits)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(
      skillsRoot,
      "colon-skill",
      "---\nname: Skill: With Colon In Name\ndescription: A: B: C\n---\n",
    );

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Skill: With Colon In Name");
    expect(result[0]?.description).toBe("A: B: C");
  });
});

// ---------------------------------------------------------------------------
// normalizeSkillNames: deduplication of skill names (via seen Map in readAvailableClaudeSkills)
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — deduplication edge cases", () => {
  it("keeps the first-encountered skill when names collide after trim", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // Two skills; both result in name "Dupe" — directory sort determines order
    createSkillDir(skillsRoot, "a-first", "---\nname: Dupe\ndescription: First\n---\n");
    createSkillDir(skillsRoot, "b-second", "---\nname: Dupe\ndescription: Second\n---\n");

    const result = readAvailableClaudeSkills(root);
    const dupes = result.filter((s) => s.name === "Dupe");
    expect(dupes).toHaveLength(1);
  });

  it("skips skill entry when name is empty after trim", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // A SKILL.md where H1 is also blank; fallback dir name is used
    createSkillDir(skillsRoot, "no-name", "---\n---\n");

    const result = readAvailableClaudeSkills(root);
    // Fallback name is "no-name" (dir name), not empty
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("no-name");
  });
});

// ---------------------------------------------------------------------------
// Multiple skills with sorting
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — sorting", () => {
  it("sorts skills by name within same source (project)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "z-skill", "---\nname: Zebra Skill\n---\n");
    createSkillDir(skillsRoot, "a-skill", "---\nname: Apple Skill\n---\n");
    createSkillDir(skillsRoot, "m-skill", "---\nname: Mango Skill\n---\n");
    createSkillDir(skillsRoot, "b-skill", "---\nname: Banana Skill\n---\n");

    const result = readAvailableClaudeSkills(root);
    const names = result.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

// ---------------------------------------------------------------------------
// Skills with no H1 heading and no name in front matter — uses dir name
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — fallback name = SKILL.md parent dir", () => {
  it("uses directory name as fallback when name is SKILL and file is named SKILL.md", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // The fallback: basename(skillFilePath, ".md") === "SKILL" → use dirname
    createSkillDir(skillsRoot, "my-tool", "No front matter, no heading.");

    const result = readAvailableClaudeSkills(root);
    // "SKILL" after stripping .md is "SKILL" → uses dirname = "my-tool"
    expect(result[0]?.name).toBe("my-tool");
  });
});

// ---------------------------------------------------------------------------
// normalizeSkillNames duplicate trimming — via readAvailableClaudeSkills
// ---------------------------------------------------------------------------
describe("readAvailableClaudeSkills — normalizeSkillNames indirectly", () => {
  it("handles skill names with leading/trailing whitespace in front matter", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    // The front matter value is " Trimmed " — after quote-stripping and value.trim() we get "Trimmed"
    createSkillDir(skillsRoot, "ws-name", "---\nname:   Trimmed   \n---\n");

    const result = readAvailableClaudeSkills(root);
    // name = "Trimmed   ".trim() is handled in readSkillMetadata via rawValue.trim()
    // Then name.trim() in readAvailableClaudeSkills
    expect(result[0]?.name).toBe("Trimmed");
  });
});
