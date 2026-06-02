import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readAvailableClaudeSkills } from "../src/claudeSkills";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-skills-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function makeWorkspace(root: string): string {
  return root;
}

function createSkillDir(skillsRoot: string, skillDirName: string, skillMdContent: string): void {
  const skillDir = join(skillsRoot, skillDirName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillMdContent, "utf8");
}

describe("readAvailableClaudeSkills", () => {
  it("returns empty array when workspace has no .claude/skills dir", () => {
    const root = makeTempDir();
    const result = readAvailableClaudeSkills(root);
    expect(result).toEqual([]);
  });

  it("returns empty array when .claude/skills dir is empty", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".claude", "skills"), { recursive: true });
    const result = readAvailableClaudeSkills(root);
    expect(result).toEqual([]);
  });

  it("reads a skill with front matter name and description", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(
      skillsRoot,
      "my-skill",
      "---\nname: My Skill\ndescription: Does something useful\n---\n# My Skill\n\nContent here.",
    );

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "My Skill",
      description: "Does something useful",
      source: "project",
    });
  });

  it("falls back to H1 heading when front matter has no name", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(
      skillsRoot,
      "h1-skill",
      "---\ndescription: Only description here\n---\n# The H1 Title\n\nBody.",
    );

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("The H1 Title");
    expect(result[0]?.description).toBe("Only description here");
  });

  it("falls back to directory name when no front matter or H1", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "plain-skill", "Just plain content, no front matter or heading.");

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("plain-skill");
  });

  it("falls back to directory name for a SKILL.md file with empty front matter", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "empty-fm-skill", "---\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("empty-fm-skill");
  });

  it("returns empty description when none is in front matter", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "no-desc", "---\nname: No Desc\n---\n# No Desc\n");

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.description).toBe("");
  });

  it("strips surrounding quotes from front matter values", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(
      skillsRoot,
      "quoted",
      `---\nname: "Quoted Name"\ndescription: 'Single quoted'\n---\n`,
    );

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Quoted Name");
    expect(result[0]?.description).toBe("Single quoted");
  });

  it("deduplicates skills with the same name (first wins)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "skill-a", "---\nname: Duplicate\ndescription: First one\n---\n");
    createSkillDir(skillsRoot, "skill-b", "---\nname: Duplicate\ndescription: Second one\n---\n");

    const result = readAvailableClaudeSkills(root);
    const dupes = result.filter((s) => s.name === "Duplicate");
    expect(dupes).toHaveLength(1);
    expect(dupes[0]?.description).toBe("First one");
  });

  it("sorts multiple project skills alphabetically by name", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "z-skill", "---\nname: Zebra\n---\n");
    createSkillDir(skillsRoot, "a-skill", "---\nname: Apple\n---\n");
    createSkillDir(skillsRoot, "m-skill", "---\nname: Mango\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result.map((s) => s.name)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("ignores entries in skills root that are not directories", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    mkdirSync(skillsRoot, { recursive: true });
    // Write a plain file (not a directory) in the skills root
    writeFileSync(join(skillsRoot, "not-a-dir.md"), "# Not a skill dir\n");
    createSkillDir(skillsRoot, "real-skill", "---\nname: Real\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Real");
  });

  it("ignores subdirectories without a SKILL.md file", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    const noSkillDir = join(skillsRoot, "no-skill-file");
    mkdirSync(noSkillDir, { recursive: true });
    writeFileSync(join(noSkillDir, "README.md"), "# Not a SKILL.md\n");

    const result = readAvailableClaudeSkills(root);
    expect(result).toEqual([]);
  });

  it("handles unreadable SKILL.md gracefully (treats as empty name fallback)", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    const skillDir = join(skillsRoot, "broken-skill");
    mkdirSync(skillDir, { recursive: true });
    // Create the SKILL.md as a directory so readFileSync will throw
    mkdirSync(join(skillDir, "SKILL.md"), { recursive: true });

    // Should not throw — falls back to directory name
    const result = readAvailableClaudeSkills(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("broken-skill");
  });

  it("all returned skills have source = 'project'", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "alpha", "---\nname: Alpha\n---\n");
    createSkillDir(skillsRoot, "beta", "---\nname: Beta\n---\n");

    const result = readAvailableClaudeSkills(root);
    for (const skill of result) {
      expect(skill.source).toBe("project");
    }
  });

  it("ignores front matter key with no colon or empty key", () => {
    const root = makeTempDir();
    const skillsRoot = join(root, ".claude", "skills");
    createSkillDir(skillsRoot, "weird-fm", "---\nno-colon-here\n: empty-key\nname: Valid\n---\n");

    const result = readAvailableClaudeSkills(root);
    expect(result[0]?.name).toBe("Valid");
  });
});
