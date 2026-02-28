import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";

import { getTentacleId } from "../src/terminalRuntime/protocol";

describe("getTentacleId", () => {
  it("returns null for malformed percent-encoding in tentacle id", () => {
    const request = {
      url: "/api/terminals/%E0%A4%A/ws",
    } as IncomingMessage;

    expect(getTentacleId(request)).toBeNull();
  });
});
