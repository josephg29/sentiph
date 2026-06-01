import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      include: ["src/**"],
      // Type-only modules compile to no runtime code; excluding them keeps the
      // gate focused on executable logic instead of `export type` declarations.
      exclude: [
        "src/index.ts",
        "src/ports/**",
        "src/domain/usage.ts",
        "src/domain/agentMetrics.ts",
        "src/domain/conversation.ts",
        "src/domain/terminal.ts",
        "src/domain/git.ts",
        "src/domain/uiState.ts",
        "src/domain/channel.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
