import { describe, expect, it } from "vitest";

import {
  TERMINAL_AGENT_PROVIDERS,
  isAgentRuntimeState,
  isTerminalAgentProvider,
} from "../src/domain/agentRuntime";

describe("isAgentRuntimeState", () => {
  it('returns true for "idle"', () => {
    expect(isAgentRuntimeState("idle")).toBe(true);
  });

  it('returns true for "processing"', () => {
    expect(isAgentRuntimeState("processing")).toBe(true);
  });

  it('returns true for "waiting_for_permission"', () => {
    expect(isAgentRuntimeState("waiting_for_permission")).toBe(true);
  });

  it('returns true for "waiting_for_user"', () => {
    expect(isAgentRuntimeState("waiting_for_user")).toBe(true);
  });

  it("returns false for an unknown string", () => {
    expect(isAgentRuntimeState("running")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isAgentRuntimeState("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isAgentRuntimeState(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAgentRuntimeState(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isAgentRuntimeState(0)).toBe(false);
  });

  it("returns false for an object", () => {
    expect(isAgentRuntimeState({ state: "idle" })).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isAgentRuntimeState(["idle"])).toBe(false);
  });

  it("is case-sensitive — returns false for 'IDLE'", () => {
    expect(isAgentRuntimeState("IDLE")).toBe(false);
  });
});

describe("TERMINAL_AGENT_PROVIDERS", () => {
  it('contains "codex"', () => {
    expect(TERMINAL_AGENT_PROVIDERS).toContain("codex");
  });

  it('contains "claude-code"', () => {
    expect(TERMINAL_AGENT_PROVIDERS).toContain("claude-code");
  });

  it("has exactly 2 entries", () => {
    expect(TERMINAL_AGENT_PROVIDERS).toHaveLength(2);
  });
});

describe("isTerminalAgentProvider", () => {
  it('returns true for "codex"', () => {
    expect(isTerminalAgentProvider("codex")).toBe(true);
  });

  it('returns true for "claude-code"', () => {
    expect(isTerminalAgentProvider("claude-code")).toBe(true);
  });

  it("returns false for an unknown provider string", () => {
    expect(isTerminalAgentProvider("openai")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isTerminalAgentProvider("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTerminalAgentProvider(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTerminalAgentProvider(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isTerminalAgentProvider(42)).toBe(false);
  });

  it("returns false for an object", () => {
    expect(isTerminalAgentProvider({ provider: "codex" })).toBe(false);
  });

  it("is case-sensitive — returns false for 'Codex'", () => {
    expect(isTerminalAgentProvider("Codex")).toBe(false);
  });
});
