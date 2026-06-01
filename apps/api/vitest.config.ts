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
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 48,
        lines: 50,
      },
    },
  },
});
