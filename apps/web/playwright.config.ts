import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * E2E configuration for the Sentiph web UI.
 *
 * The suite runs against the real Vite-built frontend bundle. API traffic is
 * stubbed at the network layer inside each spec (see e2e/app-shell.spec.ts),
 * so the tests are deterministic and require neither the Node API server, a
 * PTY, nor the `claude` CLI to be present.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
