import { describe, expect, it } from "vitest";

import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "../src/app/constants";
import { clampSidebarWidth, normalizeFrontendUiStateSnapshot } from "../src/app/uiStateNormalizers";

describe("clampSidebarWidth", () => {
  it("clamps below the minimum", () => {
    expect(clampSidebarWidth(0)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it("clamps above the maximum", () => {
    expect(clampSidebarWidth(99999)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it("passes through an in-range value", () => {
    const mid = Math.round((MIN_SIDEBAR_WIDTH + MAX_SIDEBAR_WIDTH) / 2);
    expect(clampSidebarWidth(mid)).toBe(mid);
  });
});

describe("normalizeFrontendUiStateSnapshot", () => {
  it("returns null for non-object input", () => {
    expect(normalizeFrontendUiStateSnapshot(null)).toBeNull();
    expect(normalizeFrontendUiStateSnapshot("nope")).toBeNull();
    expect(normalizeFrontendUiStateSnapshot(42)).toBeNull();
  });

  it("returns an empty snapshot for an empty object", () => {
    expect(normalizeFrontendUiStateSnapshot({})).toEqual({});
  });

  it("keeps valid fields, clamps sidebar width, and sanitizes collections", () => {
    const result = normalizeFrontendUiStateSnapshot({
      activePrimaryNav: 3,
      isAgentsSidebarVisible: false,
      sidebarWidth: 100000,
      minimizedTerminalIds: ["a", "a", "b", 5],
      terminalWidths: { t1: 200, bad: "x" },
      canvasOpenTerminalIds: ["x", 7],
    });

    expect(result?.activePrimaryNav).toBe(3);
    expect(result?.isAgentsSidebarVisible).toBe(false);
    expect(result?.sidebarWidth).toBe(MAX_SIDEBAR_WIDTH);
    expect(result?.minimizedTerminalIds).toEqual(["a", "b"]);
    expect(result?.terminalWidths).toEqual({ t1: 200 });
    expect(result?.canvasOpenTerminalIds).toEqual(["x"]);
  });

  it("drops an out-of-range activePrimaryNav", () => {
    expect(
      normalizeFrontendUiStateSnapshot({ activePrimaryNav: 999 })?.activePrimaryNav,
    ).toBeUndefined();
    expect(
      normalizeFrontendUiStateSnapshot({ activePrimaryNav: 0 })?.activePrimaryNav,
    ).toBeUndefined();
  });
});
