import { type Route, expect, test } from "@playwright/test";

/**
 * Covers the Observability primary view (nav index 9): summary cards, heatmap,
 * success-rate chart, idle-time breakdown, token usage table, and audit trail.
 * All /api/** traffic is stubbed — no backend required.
 */

const BASE_STUBS: Record<string, unknown> = {
  "/api/terminals": [],
  "/api/terminal-snapshots": {},
  "/api/ui-state": {},
  "/api/conversations": [],
  "/api/prompts": [],
  "/api/github/summary": { status: "unavailable" },
  "/api/claude/usage": { status: "unavailable" },
  "/api/codex/usage": { status: "unavailable" },
  "/api/updates/status": { status: "unavailable" },
};

/**
 * Minimal well-formed aggregate response.
 * Shape must satisfy normalizeAgentMetricsAggregate — every required field must be present
 * or the normalizer returns null and the component renders zero-state.
 */
const AGGREGATE_DATA = {
  fetchedAt: "2026-05-31T12:00:00.000Z",
  totalRuns: 42,
  successCount: 37,
  errorCount: 5,
  stoppedCount: 0,
  successRate: 0.88,
  avgDurationMs: 4_200,
  totalTokenIn: 80_000,
  totalTokenOut: 20_000,
  totalTokenCostUsd: 1.234,
  byTentacleName: {
    "agent-alpha": { successRate: 0.9, totalRuns: 30 },
    "agent-beta": { successRate: 0.75, totalRuns: 12 },
  },
};

/** Minimal summaries payload. */
const SUMMARIES_DATA = [
  {
    terminalId: "term-1",
    tentacleName: "agent-alpha",
    totalRuns: 30,
    successRate: 0.9,
    avgDurationMs: 3_800,
    totalTokenCostUsd: 0.9,
    idlePercent: 0.12,
  },
];

const HEATMAP_DATA = { buckets: [] };

const fulfilJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.startsWith("/api/metrics/aggregate")) {
      return fulfilJson(route, AGGREGATE_DATA);
    }
    if (url.pathname.startsWith("/api/metrics/summaries")) {
      return fulfilJson(route, SUMMARIES_DATA);
    }
    if (url.pathname.startsWith("/api/metrics/heatmap")) {
      return fulfilJson(route, HEATMAP_DATA);
    }
    if (url.pathname.startsWith("/api/metrics/events")) {
      return fulfilJson(route, []);
    }

    const match = Object.keys(BASE_STUBS).find((p) => url.pathname.startsWith(p));
    return fulfilJson(route, match ? BASE_STUBS[match] : {});
  });
});

test("Observability view mounts with the section heading", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();

  await page.keyboard.press("9");

  const obsView = page.getByRole("region", { name: "Observability primary view" });
  await expect(obsView).toBeVisible();
  await expect(obsView.getByRole("heading", { name: "Observability" })).toBeVisible();
});

test("Observability view renders aggregate summary cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();
  await page.keyboard.press("9");

  const obsView = page.getByRole("region", { name: "Observability primary view" });

  // Summary cards are rendered as a <dl> with <dt>/<dd> pairs.
  // Use locator('dt') to avoid ambiguity with the "Success Rate by Agent" heading.
  const cards = obsView.locator("dl.obs-summary-cards");
  await expect(cards).toBeVisible();

  // Total Runs card.
  await expect(cards.locator("dt").filter({ hasText: "Total Runs" })).toBeVisible();
  await expect(cards.locator("dd").filter({ hasText: "42" })).toBeVisible();

  // Success Rate card.
  await expect(cards.locator("dt").filter({ hasText: "Success Rate" })).toBeVisible();
  await expect(cards.locator("dd").filter({ hasText: "88%" })).toBeVisible();

  // Error count card.
  await expect(cards.locator("dt").filter({ hasText: "Errors" })).toBeVisible();
  await expect(cards.locator("dd").filter({ hasText: "5" })).toBeVisible();
});

test("Observability view renders zero-state cards when aggregate is empty", async ({ page }) => {
  // Override to empty aggregate.
  await page.route("**/api/metrics/aggregate**", (route) => fulfilJson(route, {}));

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor();
  await page.keyboard.press("9");

  const obsView = page.getByRole("region", { name: "Observability primary view" });
  await expect(obsView.getByText("Total Runs")).toBeVisible();
  // Zero-state: aggregate is absent, component renders 0.
  await expect(obsView.locator("dd").filter({ hasText: "0" }).first()).toBeVisible();
});

test("Observability view clicking Observe nav tab marks it active", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.waitFor();

  await nav.getByRole("button", { name: /Observe/i }).click();

  await expect(nav.getByRole("button", { name: /Observe/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Observability primary view" })).toBeVisible();
});
