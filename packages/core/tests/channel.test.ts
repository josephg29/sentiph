import { describe, expect, it } from "vitest";

import { formatChannelDelivery } from "../src/domain/channel";

describe("formatChannelDelivery", () => {
  it("renders the documented delivery line format", () => {
    expect(
      formatChannelDelivery({ fromTerminalId: "terminal-1", content: "Need review on parser" }),
    ).toBe("[Channel message from terminal-1]: Need review on parser");
  });

  it("preserves content verbatim, including punctuation", () => {
    expect(formatChannelDelivery({ fromTerminalId: "t-2", content: "DONE: ready ✅" })).toBe(
      "[Channel message from t-2]: DONE: ready ✅",
    );
  });

  it("handles empty content", () => {
    expect(formatChannelDelivery({ fromTerminalId: "parent", content: "" })).toBe(
      "[Channel message from parent]: ",
    );
  });
});
