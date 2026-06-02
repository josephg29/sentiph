import { type Route, expect, test } from "@playwright/test";

/**
 * Covers navigation between every primary view (Agents / Activity /
 * Settings / Observe) via both keyboard shortcuts and nav button clicks.
 * All API traffic is stubbed so no backend or Claude CLI is needed.
 */

const STUB_RESPONSES: Record<string, unknown> = {
  "/api/terminals": [],
  "/api/terminal-snapshots": {},
  "/api/ui-state": {},
  "/api/conversations": [],
  "/api/prompts": [],
  "/api/metrics/aggregate": {},
  "/api/metrics/summaries": [],
  "/api/metrics/heatmap": { buckets: [] },
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
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const match = Object.keys(STUB_RESPONSES).find((path) => url.pathname.startsWith(path));
    return fulfilJson(route, match ? STUB_RESPONSES[match] : {});
  });
});

test("keyboard shortcut 1 activates Agents nav tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  await page.keyboard.press("1");

  const agentsTab = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: /Agents/i });
  await expect(agentsTab).toHaveAttribute("aria-current", "page");
});

test("keyboard shortcut 3 navigates to Activity view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  await page.keyboard.press("3");

  await expect(page.getByRole("region", { name: "Activity primary view" })).toBeVisible();
  const activityTab = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: /Activity/i });
  await expect(activityTab).toHaveAttribute("aria-current", "page");
});

test("clicking Settings nav button navigates to Settings view", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.waitFor();

  await nav.getByRole("button", { name: /Settings/i }).click();

  await expect(page.getByLabel("Settings primary view")).toBeVisible();
});

test("keyboard shortcut 9 navigates to Observability view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  await page.keyboard.press("9");

  await expect(page.getByRole("region", { name: "Observability primary view" })).toBeVisible();
  const observeTab = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: /Observe/i });
  await expect(observeTab).toHaveAttribute("aria-current", "page");
});

test("round-trip navigation preserves shell chrome", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  // Navigate away from default Agents view and back.
  await page.keyboard.press("8");
  await expect(page.getByLabel("Settings primary view")).toBeVisible();

  await page.keyboard.press("1");

  // Shell chrome must still be present after round-trip.
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByLabel("Runtime status strip")).toBeVisible();
});
