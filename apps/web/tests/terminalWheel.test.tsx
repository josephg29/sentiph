import { describe, expect, it } from "vitest";

import { wheelDeltaToScrollLines } from "../src/components/terminalWheel";

describe("wheelDeltaToScrollLines", () => {
  it("returns zero for invalid or neutral wheel deltas", () => {
    expect(wheelDeltaToScrollLines(0, WheelEvent.DOM_DELTA_PIXEL)).toBe(0);
    expect(wheelDeltaToScrollLines(Number.NaN, WheelEvent.DOM_DELTA_PIXEL)).toBe(0);
  });

  it("converts pixel wheel delta to signed terminal lines", () => {
    expect(wheelDeltaToScrollLines(120, WheelEvent.DOM_DELTA_PIXEL)).toBe(3);
    expect(wheelDeltaToScrollLines(-120, WheelEvent.DOM_DELTA_PIXEL)).toBe(-3);
  });

  it("converts line/page delta modes to sensible line movement", () => {
    expect(wheelDeltaToScrollLines(3, WheelEvent.DOM_DELTA_LINE)).toBe(1);
    expect(wheelDeltaToScrollLines(1, WheelEvent.DOM_DELTA_PAGE)).toBe(4);
  });
});
