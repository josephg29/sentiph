import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SENTIPH_SYSTEM_PROMPT,
  assertSentiphSystemPromptIsShellSafe,
} from "../sentiphSystemPrompt";

const resolveCurrentDir = (): string =>
  // import.meta.dirname is Node 22+ and Vite-bundle safe; fall back for older runtimes.
  (import.meta.dirname as string | undefined) ?? dirname(fileURLToPath(import.meta.url));

const resolveSentiphMcpServerPath = (): { mcpServerPath: string; useTsx: boolean } => {
  const currentDir = resolveCurrentDir();
  // In a production bundle, sentiphMcp.ts is emitted as a standalone sentiph-mcp.js.
  // In dev (tsx), the TypeScript source file is run directly.
  const jsPath = join(currentDir, "sentiph-mcp.js");
  if (existsSync(jsPath)) {
    return { mcpServerPath: jsPath, useTsx: false };
  }
  return { mcpServerPath: join(currentDir, "sentiphMcp.ts"), useTsx: true };
};

export const writeSentiphMcpConfig = (stateDir: string): string => {
  const configPath = join(stateDir, "sentiph-mcp-config.json");
  const { mcpServerPath, useTsx } = resolveSentiphMcpServerPath();

  const nodeCommand = process.execPath;
  let nodeArgs: string[];
  if (!useTsx) {
    nodeArgs = [mcpServerPath];
  } else {
    const _require = createRequire(import.meta.url);
    try {
      const tsxPkgPath = _require.resolve("tsx/package.json");
      const tsxCliPath = join(dirname(tsxPkgPath), "dist", "cli.mjs");
      nodeArgs = existsSync(tsxCliPath)
        ? [tsxCliPath, mcpServerPath]
        : ["--import", "tsx/esm", mcpServerPath];
    } catch {
      nodeArgs = ["--import", "tsx/esm", mcpServerPath];
    }
  }

  const config = {
    mcpServers: {
      sentiph: {
        command: nodeCommand,
        args: nodeArgs,
        env: {
          SENTIPH_API_ORIGIN: process.env.SENTIPH_API_ORIGIN ?? "http://127.0.0.1:8787",
        },
      },
    },
  };

  try {
    // Create stateDir and its state/ subdirectory unconditionally — on first
    // run the dir may not yet exist when this is called (the registry creates
    // it later), which would silently skip writing and leave Sentiph without
    // MCP tools until the next server restart.
    mkdirSync(join(stateDir, "state"), { recursive: true });
    // mode 0o600: only the owner can read this config, since it leaks the
    // local API origin to any user with read access on the state directory.
    writeFileSync(configPath, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[sentiph-mcp] Failed to write MCP config at ${configPath}: ${message}. Sentiph will start without MCP tools.`,
    );
  }
  return configPath;
};

export const writeSentiphSystemPrompt = (stateDir: string): string | undefined => {
  const promptPath = join(stateDir, "sentiph-system-prompt.md");
  try {
    assertSentiphSystemPromptIsShellSafe(SENTIPH_SYSTEM_PROMPT);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(promptPath, SENTIPH_SYSTEM_PROMPT, {
      encoding: "utf-8",
      mode: 0o600,
    });
    return promptPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[sentiph-system-prompt] Failed to write system prompt at ${promptPath}: ${message}. Sentiph will start without orchestration guidance.`,
    );
    return undefined;
  }
};
