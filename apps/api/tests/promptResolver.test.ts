import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  interpolatePrompt,
  listPromptTemplates,
  readPromptTemplate,
  resolvePrompt,
} from "../src/prompts";

describe("interpolatePrompt", () => {
  it("replaces known variables", () => {
    const result = interpolatePrompt("Hello {{name}}, welcome to {{place}}.", {
      name: "Alice",
      place: "Octogent",
    });
    expect(result).toBe("Hello Alice, welcome to Octogent.");
  });

  it("leaves unknown placeholders intact", () => {
    const result = interpolatePrompt("{{known}} and {{unknown}}", { known: "yes" });
    expect(result).toBe("yes and {{unknown}}");
  });

  it("handles templates with no placeholders", () => {
    const result = interpolatePrompt("No variables here.", { foo: "bar" });
    expect(result).toBe("No variables here.");
  });
});

describe("readPromptTemplate", () => {
  let workspaceCwd: string;

  beforeEach(async () => {
    workspaceCwd = await mkdtemp(join(tmpdir(), "prompt-test-"));
    await mkdir(join(workspaceCwd, ".octogent", "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceCwd, { recursive: true, force: true });
  });

  it("reads an existing template file", async () => {
    await writeFile(join(workspaceCwd, ".octogent", "prompts", "greeting.md"), "Hello {{name}}!\n");
    const result = await readPromptTemplate(workspaceCwd, "greeting");
    expect(result).toBe("Hello {{name}}!");
  });

  it("returns undefined for missing templates", async () => {
    const result = await readPromptTemplate(workspaceCwd, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("rejects path traversal attempts", async () => {
    const result = await readPromptTemplate(workspaceCwd, "../etc/passwd");
    expect(result).toBeUndefined();
  });
});

describe("resolvePrompt", () => {
  let workspaceCwd: string;

  beforeEach(async () => {
    workspaceCwd = await mkdtemp(join(tmpdir(), "prompt-test-"));
    await mkdir(join(workspaceCwd, ".octogent", "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceCwd, { recursive: true, force: true });
  });

  it("reads and interpolates a template", async () => {
    await writeFile(
      join(workspaceCwd, ".octogent", "prompts", "tentacle-init.md"),
      "You are the {{tentacleId}} agent.",
    );
    const result = await resolvePrompt(workspaceCwd, "tentacle-init", {
      tentacleId: "sandbox",
    });
    expect(result).toBe("You are the sandbox agent.");
  });

  it("returns undefined for missing templates", async () => {
    const result = await resolvePrompt(workspaceCwd, "missing", { tentacleId: "x" });
    expect(result).toBeUndefined();
  });
});

describe("listPromptTemplates", () => {
  let workspaceCwd: string;

  beforeEach(async () => {
    workspaceCwd = await mkdtemp(join(tmpdir(), "prompt-test-"));
    await mkdir(join(workspaceCwd, ".octogent", "prompts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceCwd, { recursive: true, force: true });
  });

  it("lists template names without .md extension", async () => {
    await writeFile(join(workspaceCwd, ".octogent", "prompts", "alpha.md"), "a");
    await writeFile(join(workspaceCwd, ".octogent", "prompts", "beta.md"), "b");
    await writeFile(join(workspaceCwd, ".octogent", "prompts", "readme.txt"), "ignored");

    const names = await listPromptTemplates(workspaceCwd);
    expect(names.sort()).toEqual(["alpha", "beta"]);
  });

  it("returns empty array when directory does not exist", async () => {
    const names = await listPromptTemplates("/tmp/nonexistent-workspace");
    expect(names).toEqual([]);
  });
});
