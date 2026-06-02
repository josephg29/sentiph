import { describe, expect, it } from "vitest";

import {
  parseTerminalAgentProvider,
  parseTerminalColor,
  parseTerminalEffort,
  parseTerminalModel,
  parseTerminalName,
  parseTerminalNameOrigin,
  parseTerminalWorkspaceMode,
} from "../src/createApiServer/terminalParsers";

// ---------------------------------------------------------------------------
// parseTerminalName
// ---------------------------------------------------------------------------
describe("parseTerminalName", () => {
  it("returns not-provided when payload is null", () => {
    const result = parseTerminalName(null);
    expect(result.provided).toBe(false);
    expect(result.name).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns not-provided when payload is undefined", () => {
    const result = parseTerminalName(undefined);
    expect(result.provided).toBe(false);
    expect(result.name).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns error when payload is not an object", () => {
    const result = parseTerminalName("a string");
    expect(result.provided).toBe(true);
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns not-provided when object has no name or tentacleName", () => {
    const result = parseTerminalName({});
    expect(result.provided).toBe(false);
    expect(result.name).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns error when name is not a string", () => {
    const result = parseTerminalName({ name: 123 });
    expect(result.error).toBe("Terminal name must be a string.");
  });

  it("returns error when name is empty string", () => {
    const result = parseTerminalName({ name: "   " });
    expect(result.error).toBe("Terminal name cannot be empty.");
  });

  it("parses name from 'name' key", () => {
    const result = parseTerminalName({ name: "  planner  " });
    expect(result.provided).toBe(true);
    expect(result.name).toBe("planner");
    expect(result.error).toBeNull();
  });

  it("parses name from 'tentacleName' key", () => {
    const result = parseTerminalName({ tentacleName: "reviewer" });
    expect(result.provided).toBe(true);
    expect(result.name).toBe("reviewer");
    expect(result.error).toBeNull();
  });

  it("prefers 'name' key over 'tentacleName'", () => {
    const result = parseTerminalName({ name: "first", tentacleName: "second" });
    expect(result.name).toBe("first");
  });
});

// ---------------------------------------------------------------------------
// parseTerminalWorkspaceMode
// ---------------------------------------------------------------------------
describe("parseTerminalWorkspaceMode", () => {
  it("defaults to 'shared' when payload is null", () => {
    const result = parseTerminalWorkspaceMode(null);
    expect(result.workspaceMode).toBe("shared");
    expect(result.error).toBeNull();
  });

  it("defaults to 'shared' when payload is undefined", () => {
    const result = parseTerminalWorkspaceMode(undefined);
    expect(result.workspaceMode).toBe("shared");
    expect(result.error).toBeNull();
  });

  it("returns error when payload is not an object", () => {
    const result = parseTerminalWorkspaceMode(42);
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("defaults to 'shared' when workspaceMode field absent", () => {
    const result = parseTerminalWorkspaceMode({});
    expect(result.workspaceMode).toBe("shared");
    expect(result.error).toBeNull();
  });

  it("accepts 'shared'", () => {
    const result = parseTerminalWorkspaceMode({ workspaceMode: "shared" });
    expect(result.workspaceMode).toBe("shared");
    expect(result.error).toBeNull();
  });

  it("accepts 'worktree'", () => {
    const result = parseTerminalWorkspaceMode({ workspaceMode: "worktree" });
    expect(result.workspaceMode).toBe("worktree");
    expect(result.error).toBeNull();
  });

  it("returns error for invalid workspace mode", () => {
    const result = parseTerminalWorkspaceMode({ workspaceMode: "isolated" });
    expect(result.error).toBe("Terminal workspace mode must be either 'shared' or 'worktree'.");
  });
});

// ---------------------------------------------------------------------------
// parseTerminalAgentProvider
// ---------------------------------------------------------------------------
describe("parseTerminalAgentProvider", () => {
  it("returns undefined when payload is null", () => {
    const result = parseTerminalAgentProvider(null);
    expect(result.agentProvider).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is undefined", () => {
    const result = parseTerminalAgentProvider(undefined);
    expect(result.agentProvider).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns error when payload is not an object", () => {
    const result = parseTerminalAgentProvider("claude-code");
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns undefined when agentProvider field absent", () => {
    const result = parseTerminalAgentProvider({});
    expect(result.agentProvider).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("accepts 'claude-code'", () => {
    const result = parseTerminalAgentProvider({ agentProvider: "claude-code" });
    expect(result.agentProvider).toBe("claude-code");
    expect(result.error).toBeNull();
  });

  it("accepts 'codex'", () => {
    const result = parseTerminalAgentProvider({ agentProvider: "codex" });
    expect(result.agentProvider).toBe("codex");
    expect(result.error).toBeNull();
  });

  it("returns error for invalid provider", () => {
    const result = parseTerminalAgentProvider({ agentProvider: "openai" });
    expect(result.error).toBe("Terminal agent provider must be either 'codex' or 'claude-code'.");
  });
});

// ---------------------------------------------------------------------------
// parseTerminalColor
// ---------------------------------------------------------------------------
describe("parseTerminalColor", () => {
  it("returns undefined when payload is null", () => {
    const result = parseTerminalColor(null);
    expect(result.color).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is undefined", () => {
    const result = parseTerminalColor(undefined);
    expect(result.color).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is not an object", () => {
    const result = parseTerminalColor("string");
    expect(result.color).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when color field absent", () => {
    const result = parseTerminalColor({});
    expect(result.color).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("accepts a valid hex color", () => {
    const result = parseTerminalColor({ color: "#ff6b2b" });
    expect(result.color).toBe("#ff6b2b");
    expect(result.error).toBeNull();
  });

  it("accepts uppercase hex color", () => {
    const result = parseTerminalColor({ color: "#FF6B2B" });
    expect(result.color).toBe("#FF6B2B");
    expect(result.error).toBeNull();
  });

  it("returns error for non-string color", () => {
    const result = parseTerminalColor({ color: 12345 });
    expect(result.error).toContain("hex color");
  });

  it("returns error for invalid hex (missing #)", () => {
    const result = parseTerminalColor({ color: "ff6b2b" });
    expect(result.error).toContain("hex color");
  });

  it("returns error for too short hex", () => {
    const result = parseTerminalColor({ color: "#f6b" });
    expect(result.error).toContain("hex color");
  });
});

// ---------------------------------------------------------------------------
// parseTerminalNameOrigin
// ---------------------------------------------------------------------------
describe("parseTerminalNameOrigin", () => {
  it("returns undefined when payload is null", () => {
    const result = parseTerminalNameOrigin(null);
    expect(result.nameOrigin).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is undefined", () => {
    const result = parseTerminalNameOrigin(undefined);
    expect(result.nameOrigin).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns error when payload is not an object", () => {
    const result = parseTerminalNameOrigin("user");
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns undefined when nameOrigin field absent", () => {
    const result = parseTerminalNameOrigin({});
    expect(result.nameOrigin).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("accepts 'generated'", () => {
    const result = parseTerminalNameOrigin({ nameOrigin: "generated" });
    expect(result.nameOrigin).toBe("generated");
    expect(result.error).toBeNull();
  });

  it("accepts 'user'", () => {
    const result = parseTerminalNameOrigin({ nameOrigin: "user" });
    expect(result.nameOrigin).toBe("user");
    expect(result.error).toBeNull();
  });

  it("accepts 'prompt'", () => {
    const result = parseTerminalNameOrigin({ nameOrigin: "prompt" });
    expect(result.nameOrigin).toBe("prompt");
    expect(result.error).toBeNull();
  });

  it("returns error for invalid origin", () => {
    const result = parseTerminalNameOrigin({ nameOrigin: "manual" });
    expect(result.error).toBe("Terminal name origin must be 'generated', 'user', or 'prompt'.");
  });
});

// ---------------------------------------------------------------------------
// parseTerminalModel
// ---------------------------------------------------------------------------
describe("parseTerminalModel", () => {
  it("returns undefined when payload is null", () => {
    const result = parseTerminalModel(null);
    expect(result.model).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is undefined", () => {
    const result = parseTerminalModel(undefined);
    expect(result.model).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is not an object", () => {
    const result = parseTerminalModel("sonnet");
    expect(result.model).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when model field absent", () => {
    const result = parseTerminalModel({});
    expect(result.model).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("accepts 'sonnet'", () => {
    const result = parseTerminalModel({ model: "sonnet" });
    expect(result.model).toBe("sonnet");
    expect(result.error).toBeNull();
  });

  it("accepts 'haiku'", () => {
    const result = parseTerminalModel({ model: "haiku" });
    expect(result.model).toBe("haiku");
    expect(result.error).toBeNull();
  });

  it("accepts 'opus'", () => {
    const result = parseTerminalModel({ model: "opus" });
    expect(result.model).toBe("opus");
    expect(result.error).toBeNull();
  });

  it("returns error for invalid model", () => {
    const result = parseTerminalModel({ model: "gpt-4" });
    expect(result.error).toBe("Terminal model must be one of 'opus', 'sonnet', 'haiku'.");
  });
});

// ---------------------------------------------------------------------------
// parseTerminalEffort
// ---------------------------------------------------------------------------
describe("parseTerminalEffort", () => {
  it("returns undefined when payload is null", () => {
    const result = parseTerminalEffort(null);
    expect(result.effort).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is undefined", () => {
    const result = parseTerminalEffort(undefined);
    expect(result.effort).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when payload is not an object", () => {
    const result = parseTerminalEffort("high");
    expect(result.effort).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("returns undefined when effort field absent", () => {
    const result = parseTerminalEffort({});
    expect(result.effort).toBeUndefined();
    expect(result.error).toBeNull();
  });

  it("accepts 'low'", () => {
    const result = parseTerminalEffort({ effort: "low" });
    expect(result.effort).toBe("low");
    expect(result.error).toBeNull();
  });

  it("accepts 'medium'", () => {
    const result = parseTerminalEffort({ effort: "medium" });
    expect(result.effort).toBe("medium");
    expect(result.error).toBeNull();
  });

  it("accepts 'high'", () => {
    const result = parseTerminalEffort({ effort: "high" });
    expect(result.effort).toBe("high");
    expect(result.error).toBeNull();
  });

  it("returns error for invalid effort", () => {
    const result = parseTerminalEffort({ effort: "max" });
    expect(result.error).toBe("Terminal effort must be one of 'low', 'medium', 'high'.");
  });
});
