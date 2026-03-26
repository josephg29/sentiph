import { describe, expect, it, vi } from "vitest";

import { measureTerminalBoardViewportWidth } from "../src/app/hooks/useTerminalBoardInteractions";

describe("measureTerminalBoardViewportWidth", () => {
  it("subtracts horizontal padding from board width", () => {
    const board = document.createElement("main");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      bottom: 0,
      height: 0,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingLeft: "8px",
      paddingRight: "8px",
    } as CSSStyleDeclaration);

    expect(measureTerminalBoardViewportWidth(board)).toBe(984);
  });
});
