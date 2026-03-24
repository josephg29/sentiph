import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const PROMPTS_RELATIVE_PATH = "prompts";

/**
 * Interpolate `{{key}}` placeholders in a template string with values from the
 * provided variables map. Unknown placeholders are left as-is.
 */
export const interpolatePrompt = (template: string, variables: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);

/**
 * Read a prompt template from `prompts/<name>.md` and return the raw
 * template string. Returns `undefined` if the file does not exist.
 */
export const readPromptTemplate = async (
  workspaceCwd: string,
  name: string,
): Promise<string | undefined> => {
  // Guard against path traversal.
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return undefined;
  }

  const filePath = join(workspaceCwd, PROMPTS_RELATIVE_PATH, `${name}.md`);

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
  workspaceCwd: string,
  name: string,
  variables: Record<string, string>,
): Promise<string | undefined> => {
  const template = await readPromptTemplate(workspaceCwd, name);
  if (template === undefined) {
    return undefined;
  }
  return interpolatePrompt(template, variables);
};

/**
 * List all available prompt template names (file basenames without `.md`).
 */
export const listPromptTemplates = async (workspaceCwd: string): Promise<string[]> => {
  const dirPath = join(workspaceCwd, PROMPTS_RELATIVE_PATH);
  try {
    const entries = await readdir(dirPath);
    return entries.filter((e) => e.endsWith(".md")).map((e) => e.replace(/\.md$/, ""));
  } catch {
    return [];
  }
};
