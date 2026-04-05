import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Interpolate `{{key}}` placeholders in a template string with values from the
 * provided variables map. Unknown placeholders are left as-is.
 */
export const interpolatePrompt = (template: string, variables: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);

/**
 * Read a prompt template from `<promptsDir>/<name>.md` and return the raw
 * template string. Returns `undefined` if the file does not exist.
 */
export const readPromptTemplate = async (
  promptsDir: string,
  name: string,
): Promise<string | undefined> => {
  // Guard against path traversal.
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return undefined;
  }

  const filePath = join(promptsDir, `${name}.md`);

  try {
    const content = await readFile(filePath, "utf-8");
    return content.trimEnd();
  } catch {
    return undefined;
  }
};

/**
 * Read and resolve a prompt template, interpolating the given variables.
 * Returns `undefined` if the template does not exist.
 */
export const resolvePrompt = async (
  promptsDir: string,
  name: string,
  variables: Record<string, string>,
): Promise<string | undefined> => {
  const template = await readPromptTemplate(promptsDir, name);
  if (template === undefined) {
    return undefined;
  }
  return interpolatePrompt(template, variables);
};

/**
 * List all available prompt template names (file basenames without `.md`).
 */
export const listPromptTemplates = async (promptsDir: string): Promise<string[]> => {
  try {
    const entries = await readdir(promptsDir);
    return entries.filter((e) => e.endsWith(".md")).map((e) => e.replace(/\.md$/, ""));
  } catch {
    return [];
  }
};
