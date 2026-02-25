import { describe, expect, it } from "vitest";

import {
  TENTACLE_MIN_WIDTH,
  reconcileTentacleWidths,
  resizeTentaclePair,
} from "../src/layout/tentaclePaneSizing";

describe("tentaclePaneSizing", () => {
  it("splits widths evenly when tentacles are added and viewport has enough room", () => {
    const widths = reconcileTentacleWidths({}, ["tentacle-1", "tentacle-2"], 1000);

    expect(widths["tentacle-1"]).toBe(500);
    expect(widths["tentacle-2"]).toBe(500);
  });

  it("clamps all panes to minimum width when viewport is too small", () => {
    const widths = reconcileTentacleWidths({}, ["tentacle-1", "tentacle-2"], 500);

    expect(widths["tentacle-1"]).toBe(TENTACLE_MIN_WIDTH);
    expect(widths["tentacle-2"]).toBe(TENTACLE_MIN_WIDTH);
  });

  it("resizes adjacent tentacles while respecting minimum width constraints", () => {
    const resized = resizeTentaclePair(
      {
        "tentacle-1": 500,
        "tentacle-2": 500,
      },
      "tentacle-1",
      "tentacle-2",
      300,
    );

    expect(resized["tentacle-1"]).toBe(1000 - TENTACLE_MIN_WIDTH);
    expect(resized["tentacle-2"]).toBe(TENTACLE_MIN_WIDTH);
  });
});
