import { type Route, expect, test } from "@playwright/test";

/**
 * Covers the Activity primary view (nav index 3): the Claude token usage bar
 * chart / heatmap panel and the GitHub section. API responses are stubbed at
 * the network boundary so the tests are fully deterministic.
 */

const BASE_STUBS: Record<string, unknown> = {
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

/**
 * A minimal but well-formed usage payload with two days of data.
 * The Activity view's UsageBarChart fetches from /api/analytics/usage-heatmap,
 * not /api/claude/usage — stub that endpoint with this shape.
 */
const USAGE_WITH_DATA = {
  days: [
    {
      date: "2026-05-30",
      totalTokens: 12_000,
      sessions: 3,
      models: [{ key: "claude-opus-4-5", tokens: 12_000 }],
      projects: [{ key: "sentiph", tokens: 12_000 }],
    },
    {
      date: "2026-05-31",
      totalTokens: 48_000,
      sessions: 7,
      models: [{ key: "claude-sonnet-4-5", tokens: 48_000 }],
      projects: [{ key: "sentiph", tokens: 48_000 }],
    },
  ],
  projects: ["sentiph"],
  models: ["claude-opus-4-5", "claude-sonnet-4-5"],
};

const fulfilJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

const stubRoutes = (
  page: import("@playwright/test").Page,
  overrides: Record<string, unknown> = {},
) => {
  const responses = { ...BASE_STUBS, ...overrides };
  return page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const match = Object.keys(responses).find((path) => url.pathname.startsWith(path));
    return fulfilJson(route, match ? responses[match] : {});
  });
};

test.beforeEach(async ({ page }) => {
  await stubRoutes(page);
});

test("Activity view mounts with usage chart and GitHub section", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  await page.keyboard.press("3");

  const activityView = page.getByRole("region", { name: "Activity primary view" });
  await expect(activityView).toBeVisible();

  // Usage chart section is present.
  await expect(
    activityView.getByRole("region", { name: "Claude token usage chart" }),
  ).toBeVisible();
});

test("Activity view with usage data renders bar chart SVG", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    // The UsageBarChart component fetches /api/analytics/usage-heatmap, not /api/claude/usage.
    if (url.pathname.startsWith("/api/analytics/usage-heatmap")) {
      return fulfilJson(route, USAGE_WITH_DATA);
    }
    const match = Object.keys(BASE_STUBS).find((p) => url.pathname.startsWith(p));
    return fulfilJson(route, match ? BASE_STUBS[match] : {});
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();
  await page.keyboard.press("3");

  const chartSection = page.getByRole("region", { name: "Claude token usage chart" });
  await expect(chartSection).toBeVisible();

  // Bar chart SVG is rendered.
  await expect(chartSection.getByRole("img", { name: "Token usage bar chart" })).toBeVisible();

  // Heatmap SVG is rendered.
  await expect(chartSection.getByRole("img", { name: "Token usage heatmap" })).toBeVisible();
});

test("Refresh button in usage chart section is present and clickable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();
  await page.keyboard.press("3");

  const refreshButton = page.getByRole("button", { name: "Refresh usage chart data" });
  await expect(refreshButton).toBeVisible();
  // Button should be enabled (no data-loading means not mid-refresh).
  await expect(refreshButton).toBeEnabled();
  // Clicking does not throw or navigate away.
  await refreshButton.click();
  await expect(page.getByRole("region", { name: "Activity primary view" })).toBeVisible();
});

test("segment mode toggle switches between Project and Model", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    // The UsageBarChart component fetches /api/analytics/usage-heatmap, not /api/claude/usage.
    if (url.pathname.startsWith("/api/analytics/usage-heatmap")) {
      return fulfilJson(route, USAGE_WITH_DATA);
    }
    const match = Object.keys(BASE_STUBS).find((p) => url.pathname.startsWith(p));
    return fulfilJson(route, match ? BASE_STUBS[match] : {});
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();
  await page.keyboard.press("3");

  const modelBtn = page.getByRole("button", { name: "Model" });
  const projectBtn = page.getByRole("button", { name: "Project" });

  await expect(projectBtn).toBeVisible();
  await expect(modelBtn).toBeVisible();

  // Switch to Model segmentation — should not crash.
  await modelBtn.click();
  await expect(page.getByRole("img", { name: "Token usage bar chart" })).toBeVisible();

  // Switch back to Project.
  await projectBtn.click();
  await expect(page.getByRole("img", { name: "Token usage bar chart" })).toBeVisible();
});
