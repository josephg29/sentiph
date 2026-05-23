import { builtinModules } from "node:module";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const externals = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "node-pty",
  "ws",
];

export default defineConfig({
  build: {
    outDir: resolve(__dirname, "../../dist/api"),
    emptyOutDir: false,
    lib: {
      entry: {
        cli: resolve(__dirname, "../api/src/cli.ts"),
        "sentiph-mcp": resolve(__dirname, "../api/src/sentiphMcp.ts"),
      },
      formats: ["es"],
    },
    minify: false,
    sourcemap: true,
    target: "node22",
    rollupOptions: {
      external: externals,
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "createApiServer-[hash].js",
      },
    },
  },
});
