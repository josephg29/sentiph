import { describe, expect, it } from "vitest";

import {
  TERMINAL_MIN_WIDTH,
  reconcileTerminalWidths,
  resizeTerminalPair,
} from "../src/layout/terminalPaneSizing";

describe("terminalPaneSizing", () => {
  it("splits widths evenly when terminals are added and viewport has enough room", () => {
    const widths = reconcileTerminalWidths({}, ["tentacle-1", "tentacle-2"], 1000);

    expect(widths["tentacle-1"]).toBe(500);
    expect(widths["tentacle-2"]).toBe(500);
  });

  it("clamps all panes to minimum width when viewport is too small", () => {
    const widths = reconcileTerminalWidths({}, ["tentacle-1", "tentacle-2"], 500);

    expect(widths["tentacle-1"]).toBe(TERMINAL_MIN_WIDTH);
    expect(widths["tentacle-2"]).toBe(TERMINAL_MIN_WIDTH);
  });

  it("resizes adjacent terminals while respecting minimum width constraints", () => {
    const resized = resizeTerminalPair(
      {
        "tentacle-1": 500,
        "tentacle-2": 500,
      },
      "tentacle-1",
      "tentacle-2",
      300,
    );

    expect(resized["tentacle-1"]).toBe(1000 - TERMINAL_MIN_WIDTH);
    expect(resized["tentacle-2"]).toBe(TERMINAL_MIN_WIDTH);
  });
});
