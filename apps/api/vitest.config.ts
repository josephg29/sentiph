import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      include: ["src/**"],
      // Enforced ratchet floors: set just below the current measured coverage so
      // the suite can never regress. Raise these as coverage improves.
      // Measured 2026-06: stmts 96.4 / branches 90.3 / funcs 93.8 / lines 96.6.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 93,
        lines: 95,
      },
    },
  },
});
