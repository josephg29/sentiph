import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.SENTIPH_API_ORIGIN ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      include: ["src/**"],
      // Enforced ratchet floors: set just below the current measured coverage so
      // the suite can never regress. Raise these as coverage improves.
      thresholds: {
        statements: 46,
        branches: 32,
        functions: 42,
        lines: 47,
      },
    },
  },
} as never);
