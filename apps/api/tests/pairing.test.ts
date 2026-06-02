import { describe, expect, it } from "vitest";

import { createPairingService } from "../src/pairing";

describe("createPairingService", () => {
  it("generates a stable 64-char hex token for the process lifetime", () => {
    const service = createPairingService();
    const token = service.getToken();
    expect(token).not.toBeNull();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // Stable across reads.
    expect(service.getToken()).toBe(token);
  });

  it("generates a distinct token per service instance", () => {
    const a = createPairingService();
    const b = createPairingService();
    expect(a.getToken()).not.toBe(b.getToken());
  });

  it("verifies the correct token", () => {
    const service = createPairingService();
    const token = service.getToken() as string;
    expect(service.verifyToken(token)).toBe(true);
  });

  it("rejects an incorrect token of the same length without throwing", () => {
    const service = createPairingService();
    const wrong = "f".repeat(64);
    expect(service.verifyToken(wrong)).toBe(false);
  });

  it("returns false (does not throw) on a length mismatch", () => {
    const service = createPairingService();
    expect(() => service.verifyToken("short")).not.toThrow();
    expect(service.verifyToken("short")).toBe(false);
    expect(service.verifyToken("")).toBe(false);
  });

  it("returns false for a non-string candidate without throwing", () => {
    const service = createPairingService();
    expect(service.verifyToken(undefined as unknown as string)).toBe(false);
    expect(service.verifyToken(123 as unknown as string)).toBe(false);
  });
});
