/**
 * Additional branch coverage for src/createApiServer/gitParsers.ts
 * Targets uncovered if-branches identified in the HTML coverage report.
 */
import { describe, expect, it } from "vitest";

import {
  parseTentacleCommitMessage,
  parseTentaclePullRequestCreateInput,
  parseTentacleSyncBaseRef,
} from "../src/createApiServer/gitParsers";

describe("parseTentacleSyncBaseRef — branches2", () => {
  // "if path not taken": typeof payload !== "object" when payload is not null/undefined
  it("returns error when payload is a number (non-object, non-null)", () => {
    const result = parseTentacleSyncBaseRef(42);
    expect(result.error).toBe("Expected a JSON object body.");
    expect(result.baseRef).toBeNull();
  });

  it("returns error when payload is a string", () => {
    const result = parseTentacleSyncBaseRef("just a string");
    expect(result.error).toBe("Expected a JSON object body.");
    expect(result.baseRef).toBeNull();
  });

  // "if path not taken": rawBaseRef === undefined when no baseRef key in object
  it("returns baseRef null with no error when object has no baseRef key", () => {
    const result = parseTentacleSyncBaseRef({ otherField: "value" });
    expect(result.error).toBeNull();
    expect(result.baseRef).toBeNull();
  });
});

describe("parseTentaclePullRequestCreateInput — branches2", () => {
  // "if path not taken": record.baseRef !== undefined && typeof record.baseRef !== "string"
  it("returns error when baseRef is a number", () => {
    const result = parseTentaclePullRequestCreateInput({ title: "My PR", baseRef: 42 });
    expect(result.error).toBe("Pull request baseRef must be a string.");
    expect(result.title).toBeNull();
  });

  it("returns error when baseRef is an object", () => {
    const result = parseTentaclePullRequestCreateInput({ title: "My PR", baseRef: {} });
    expect(result.error).toBe("Pull request baseRef must be a string.");
  });

  // "if path not taken": record.baseRef !== undefined && normalizedBaseRef.length === 0
  it("returns error when baseRef is an empty string", () => {
    const result = parseTentaclePullRequestCreateInput({ title: "My PR", baseRef: "" });
    expect(result.error).toBe("Pull request baseRef cannot be empty.");
    expect(result.title).toBeNull();
  });

  it("returns error when baseRef is whitespace-only", () => {
    const result = parseTentaclePullRequestCreateInput({ title: "My PR", baseRef: "   " });
    expect(result.error).toBe("Pull request baseRef cannot be empty.");
  });

  // Happy path: baseRef provided and valid
  it("returns valid result when baseRef is a non-empty string", () => {
    const result = parseTentaclePullRequestCreateInput({
      title: "Feature PR",
      body: "Some body",
      baseRef: "main",
    });
    expect(result.error).toBeNull();
    expect(result.title).toBe("Feature PR");
    expect(result.body).toBe("Some body");
    expect(result.baseRef).toBe("main");
  });

  // non-object payload branch already tested in gitRoutes, but add here for unit isolation
  it("returns error for non-object payload (boolean)", () => {
    const result = parseTentaclePullRequestCreateInput(true);
    expect(result.error).toBe("Expected a JSON object body.");
  });
});
