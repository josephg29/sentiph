import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTentacleStore } from "../src/terminalRuntime/tentacleStore";

describe("createTentacleStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tentacle-store-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a tentacle folder with CONTEXT.md and returns a summary", () => {
    const store = createTentacleStore(dir);
    const summary = store.createTentacle({
      name: "api-backend",
      description: "API runtime and request handling",
    });

    expect(summary).toEqual({
      tentacleId: "api-backend",
      name: "api-backend",
      description: "API runtime and request handling",
    });
    const context = readFileSync(join(dir, "api-backend", "CONTEXT.md"), "utf8");
    expect(context).toBe("# api-backend\n\nAPI runtime and request handling\n");
  });

  it("slugifies names that are not valid ids", () => {
    const store = createTentacleStore(dir);
    const summary = store.createTentacle({ name: "Docs & Guides!" });
    expect(summary.tentacleId).toBe("docs-guides");
    expect(existsSync(join(dir, "docs-guides", "CONTEXT.md"))).toBe(true);
  });

  it("honors an explicit valid id", () => {
    const store = createTentacleStore(dir);
    const summary = store.createTentacle({ name: "Whatever", id: "custom_id-1" });
    expect(summary.tentacleId).toBe("custom_id-1");
  });

  it("lists created tentacles with name and description parsed from CONTEXT.md", () => {
    const store = createTentacleStore(dir);
    store.createTentacle({ name: "API", description: "the api" });
    store.createTentacle({ name: "Web", description: "the web ui" });

    const listed = store.listTentacles().sort((a, b) => a.tentacleId.localeCompare(b.tentacleId));
    expect(listed).toEqual([
      { tentacleId: "api", name: "API", description: "the api" },
      { tentacleId: "web", name: "Web", description: "the web ui" },
    ]);
  });

  it("returns an empty list when the tentacles dir does not exist", () => {
    const store = createTentacleStore(join(dir, "missing"));
    expect(store.listTentacles()).toEqual([]);
  });

  it("ignores directories without a CONTEXT.md", () => {
    const store = createTentacleStore(dir);
    store.createTentacle({ name: "real" });
    // A stray directory with no CONTEXT.md should be skipped.
    mkdtempSync(join(dir, "stray-"));
    expect(store.listTentacles().map((t) => t.tentacleId)).toEqual(["real"]);
  });
});
