import { type Route, expect, test } from "@playwright/test";

/**
 * Minimal, valid stub responses for the HTTP endpoints the shell queries on
 * load. Returning empty-but-well-formed payloads lets the UI mount its full
 * chrome (navigation, runtime strip, primary view) without a live backend.
 */
const STUB_RESPONSES: Record<string, unknown> = {
  "/api/terminals": [],
  "/api/terminal-snapshots": {},
  "/api/ui-state": {},
  "/api/conversations": [],
  "/api/prompts": [],
  "/api/metrics/aggregate": {},
  "/api/github/summary": { status: "unavailable" },
  "/api/claude/usage": { status: "unavailable" },
  "/api/codex/usage": { status: "unavailable" },
  "/api/updates/status": { status: "unavailable" },
};

const fulfilJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

test.beforeEach(async ({ page }) => {
  // Stub every /api/** request so the shell renders deterministically offline.
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const match = Object.keys(STUB_RESPONSES).find((path) => url.pathname.startsWith(path));
    if (match) {
      return fulfilJson(route, STUB_RESPONSES[match]);
    }
    // Unknown endpoints get an empty object rather than a hard network error.
    return fulfilJson(route, {});
  });
});

test("mounts the app shell with primary navigation and runtime strip", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  await expect(page).toHaveTitle(/Sentiph/i);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByLabel("Runtime status strip")).toBeVisible();
  await expect(page.getByText("Press 1-9 to navigate")).toBeVisible();

  // The frontend bundle must mount cleanly — no uncaught render errors.
  expect(consoleErrors, consoleErrors.join("\n")).toHaveLength(0);
});

test("navigates to settings via keyboard-first primary navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  // The shell advertises number-key navigation; Settings is primary nav index 8.
  await page.keyboard.press("8");

  await expect(page.getByLabel("Settings primary view")).toBeVisible();
});
