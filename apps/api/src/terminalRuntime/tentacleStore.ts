import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type TentacleSummary = {
  tentacleId: string;
  name: string;
  description: string;
};

export type CreateTentacleInput = {
  name: string;
  description?: string;
  /** Optional explicit id; defaults to a slug of the name. */
  id?: string;
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128) || "tentacle";

/**
 * Filesystem-backed store for tentacle (session) folders under a tentacles
 * directory. Each tentacle is a folder with a CONTEXT.md whose first heading is
 * the display name and whose first paragraph is the description — the same files
 * the Deck view and the terminal factory's context-prompt logic read.
 */
export const createTentacleStore = (tentaclesDir: string) => {
  const readSummary = (tentacleId: string): TentacleSummary | null => {
    const contextPath = join(tentaclesDir, tentacleId, "CONTEXT.md");
    if (!existsSync(contextPath)) {
      return null;
    }
    const content = readFileSync(contextPath, "utf8");
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const name = headingMatch ? (headingMatch[1] ?? "").trim() : tentacleId;
    const afterHeading = headingMatch
      ? content.slice(content.indexOf(headingMatch[0]) + headingMatch[0].length)
      : content;
    const description =
      afterHeading
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .find((block) => block.length > 0) ?? "";
    return { tentacleId, name, description };
  };

  const createTentacle = ({ name, description, id }: CreateTentacleInput): TentacleSummary => {
    const tentacleId = id && ID_PATTERN.test(id) ? id : slugify(name);
    const dir = join(tentaclesDir, tentacleId);
    mkdirSync(dir, { recursive: true });
    const trimmedDescription = description?.trim() ?? "";
    writeFileSync(join(dir, "CONTEXT.md"), `# ${name}\n\n${trimmedDescription}\n`, "utf8");
    return { tentacleId, name, description: trimmedDescription };
  };

  const listTentacles = (): TentacleSummary[] => {
    if (!existsSync(tentaclesDir)) {
      return [];
    }
    const summaries: TentacleSummary[] = [];
    for (const entry of readdirSync(tentaclesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const summary = readSummary(entry.name);
      if (summary) {
        summaries.push(summary);
      }
    }
    return summaries;
  };

  return { createTentacle, listTentacles };
};
