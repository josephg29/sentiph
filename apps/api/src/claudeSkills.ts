import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { DeckAvailableSkill } from "@sentiph/core";

const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;
const H1_PATTERN = /^#\s+(.+)$/m;

const normalizeSkillNames = (skills: readonly string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skill of skills) {
    const trimmed = skill.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized.sort((a, b) => a.localeCompare(b));
};

const readSkillMetadata = (
  skillFilePath: string,
): { name: string; description: string; title: string | null } => {
  const fallbackName =
    basename(skillFilePath, ".md") === "SKILL"
      ? basename(dirname(skillFilePath))
      : basename(skillFilePath, ".md");
  try {
    const content = readFileSync(skillFilePath, "utf8");
    const frontMatterMatch = content.match(FRONT_MATTER_PATTERN);
    let name: string | null = null;
    let description = "";

    if (frontMatterMatch) {
      for (const line of (frontMatterMatch[1] ?? "").split("\n")) {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex <= 0) continue;

        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        if (key === "name" && value.length > 0) {
          name = value;
        } else if (key === "description" && value.length > 0) {
          description = value;
        }
      }
    }

    const title = content.match(H1_PATTERN)?.[1]?.trim() ?? null;
    return {
      name: name ?? title ?? fallbackName,
      description,
      title,
    };
  } catch {
    return {
      name: fallbackName,
      description: "",
      title: null,
    };
  }
};

const listSkillDefinitionFiles = (skillsRoot: string): string[] => {
  if (!existsSync(skillsRoot)) return [];

  const definitions: string[] = [];

  let entries: string[] = [];
  try {
    entries = readdirSync(skillsRoot);
  } catch {
    return definitions;
  }

  for (const entry of entries) {
    const entryPath = join(skillsRoot, entry);
    try {
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const skillFile = join(entryPath, "SKILL.md");
    if (existsSync(skillFile)) {
      definitions.push(skillFile);
    }
  }

  return definitions;
};

export const readAvailableClaudeSkills = (workspaceCwd: string): DeckAvailableSkill[] => {
  const roots: Array<{ path: string; source: DeckAvailableSkill["source"] }> = [
    { path: join(workspaceCwd, ".claude", "skills"), source: "project" },
  ];

  const seen = new Map<string, DeckAvailableSkill>();

  for (const root of roots) {
    const definitions = listSkillDefinitionFiles(root.path);
    for (const definition of definitions) {
      const metadata = readSkillMetadata(definition);
      const name = metadata.name.trim();
      if (name.length === 0 || seen.has(name)) continue;
      seen.set(name, {
        name,
        description: metadata.description,
        source: root.source,
      });
    }
  }

  return [...seen.values()].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "project" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
};
