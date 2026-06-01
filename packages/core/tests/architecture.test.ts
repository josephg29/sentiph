import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architectural guard: @sentiph/core is the framework-agnostic domain layer.
 * It must not depend on React, the DOM, Node's runtime modules, HTTP, PTY, or
 * the filesystem — keeping it portable and trivially testable. This test fails
 * the build if such an import sneaks in.
 */
const SRC_DIR = join(__dirname, "..", "src");

const FORBIDDEN_IMPORT_PATTERNS: { label: string; test: (spec: string) => boolean }[] = [
  { label: "React", test: (s) => s === "react" || s.startsWith("react/") || s === "react-dom" },
  { label: "Node builtins", test: (s) => s.startsWith("node:") },
  { label: "node-pty", test: (s) => s === "node-pty" },
  { label: "ws (WebSocket server)", test: (s) => s === "ws" },
];

const collectTsFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return collectTsFiles(fullPath);
    }
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
};

const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']/g;

const importedSpecifiers = (source: string): string[] => {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
};

describe("@sentiph/core architectural boundaries", () => {
  const files = collectTsFiles(SRC_DIR);

  it("contains source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("imports no framework, DOM, Node, or I/O dependencies", () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of importedSpecifiers(source)) {
        for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
          if (pattern.test(specifier)) {
            violations.push(
              `${file.replace(SRC_DIR, "src")} imports ${specifier} (${pattern.label})`,
            );
          }
        }
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
