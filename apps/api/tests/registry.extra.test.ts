/**
 * Supplementary tests for terminalRuntime/registry.ts — targets uncovered
 * branches in parsePersistedUiState and parseV3Terminals not reached by
 * the existing registry.test.ts.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadTerminalRegistry } from "../src/terminalRuntime/registry";
import type { PersistedTerminal, PersistedUiState } from "../src/terminalRuntime/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

const makePT = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
  ...overrides,
});

const v3Doc = (terminals: PersistedTerminal[], uiState: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 3, terminals, uiState });

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "registry-extra-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const write = (name: string, content: string) => {
  const path = join(tmpDir, name);
  writeFileSync(path, content, "utf8");
  return path;
};

// ─── parsePersistedUiState — uncovered boolean fields ────────────────────────

describe("loadTerminalRegistry — parsePersistedUiState uncovered fields", () => {
  it("parses isActiveAgentsSectionExpanded", () => {
    const path = write("ui1.json", v3Doc([], { isActiveAgentsSectionExpanded: true }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isActiveAgentsSectionExpanded).toBe(true);
  });

  it("parses isRuntimeStatusStripVisible", () => {
    const path = write("ui2.json", v3Doc([], { isRuntimeStatusStripVisible: false }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isRuntimeStatusStripVisible).toBe(false);
  });

  it("parses isBottomTelemetryVisible", () => {
    const path = write("ui3.json", v3Doc([], { isBottomTelemetryVisible: true }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isBottomTelemetryVisible).toBe(true);
  });

  it("parses isCodexUsageVisible", () => {
    const path = write("ui4.json", v3Doc([], { isCodexUsageVisible: false }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isCodexUsageVisible).toBe(false);
  });

  it("parses isClaudeUsageVisible", () => {
    const path = write("ui5.json", v3Doc([], { isClaudeUsageVisible: true }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isClaudeUsageVisible).toBe(true);
  });

  it("parses isClaudeUsageSectionExpanded", () => {
    const path = write("ui6.json", v3Doc([], { isClaudeUsageSectionExpanded: false }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isClaudeUsageSectionExpanded).toBe(false);
  });

  it("parses isCodexUsageSectionExpanded", () => {
    const path = write("ui7.json", v3Doc([], { isCodexUsageSectionExpanded: true }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.isCodexUsageSectionExpanded).toBe(true);
  });

  it("parses canvasOpenTerminalIds array", () => {
    const path = write("ui8.json", v3Doc([], { canvasOpenTerminalIds: ["t1", "t2"] }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.canvasOpenTerminalIds).toEqual(["t1", "t2"]);
  });

  it("filters non-string entries from canvasOpenTerminalIds", () => {
    const path = write("ui9.json", v3Doc([], { canvasOpenTerminalIds: ["t1", 42, null, "t2"] }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.canvasOpenTerminalIds).toEqual(["t1", "t2"]);
  });

  it("parses canvasOpenTentacleIds array", () => {
    const path = write("ui10.json", v3Doc([], { canvasOpenTentacleIds: ["tent-1"] }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.canvasOpenTentacleIds).toEqual(["tent-1"]);
  });

  it("parses canvasTerminalsPanelWidth", () => {
    const path = write("ui11.json", v3Doc([], { canvasTerminalsPanelWidth: 320 }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.canvasTerminalsPanelWidth).toBe(320);
  });

  it("ignores non-finite canvasTerminalsPanelWidth", () => {
    const path = write("ui12.json", v3Doc([], { canvasTerminalsPanelWidth: Number.NaN }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.canvasTerminalsPanelWidth).toBeUndefined();
  });

  it("ignores non-finite sidebarWidth", () => {
    const path = write("ui13.json", v3Doc([], { sidebarWidth: Number.POSITIVE_INFINITY }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState.sidebarWidth).toBeUndefined();
  });

  it("ignores non-finite terminalWidths entries", () => {
    // terminalWidths are pruned to active terminal IDs, so we need a terminal with id "good"
    const terminal = makePT({ terminalId: "good", tentacleId: "good" });
    const path = write(
      "ui14.json",
      v3Doc([terminal], { terminalWidths: { good: 300, bad: "not-a-number" } }),
    );
    const result = loadTerminalRegistry(path);
    // 'bad' should be excluded since it's not a finite number
    expect(result.uiState.terminalWidths?.good).toBe(300);
    expect(result.uiState.terminalWidths?.bad).toBeUndefined();
  });

  it("returns empty uiState when uiState is null", () => {
    const path = write("ui15.json", JSON.stringify({ version: 3, terminals: [], uiState: null }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState).toEqual({});
  });

  it("returns empty uiState when uiState is a primitive", () => {
    const path = write("ui16.json", JSON.stringify({ version: 3, terminals: [], uiState: 42 }));
    const result = loadTerminalRegistry(path);
    expect(result.uiState).toEqual({});
  });

  it("deduplicates minimizedTerminalIds", () => {
    const path = write(
      "ui17.json",
      v3Doc([makePT({ terminalId: "t1" })], { minimizedTerminalIds: ["t1", "t1", "t1"] }),
    );
    const result = loadTerminalRegistry(path);
    // Set deduplication — should only contain one "t1"
    expect(result.uiState.minimizedTerminalIds).toEqual(["t1"]);
  });

  it("filters non-string entries from minimizedTerminalIds", () => {
    const path = write(
      "ui18.json",
      v3Doc([makePT({ terminalId: "t1" })], { minimizedTerminalIds: ["t1", 99, null, "t1"] }),
    );
    const result = loadTerminalRegistry(path);
    expect(result.uiState.minimizedTerminalIds).toEqual(["t1"]);
  });
});

// ─── parseV3Terminals — uncovered optional fields ────────────────────────────

describe("loadTerminalRegistry — parseV3Terminals optional fields", () => {
  it("parses initialPrompt field", () => {
    const terminal = makePT({
      terminalId: "t1",
      tentacleId: "t1",
      initialPrompt: "Write a report.",
    });
    const path = write("v3-prompt.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.initialPrompt).toBe("Write a report.");
  });

  it("parses initialInputDraft field", () => {
    const terminal = makePT({
      terminalId: "t1",
      tentacleId: "t1",
      initialInputDraft: "Draft text.",
    });
    const path = write("v3-draft.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.initialInputDraft).toBe("Draft text.");
  });

  it("parses autoRenamePromptContext field", () => {
    const terminal = makePT({
      terminalId: "t1",
      tentacleId: "t1",
      autoRenamePromptContext: "context-value",
    });
    const path = write("v3-rename.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.autoRenamePromptContext).toBe("context-value");
  });

  it("parses lastActiveAt field", () => {
    const ts = new Date().toISOString();
    const terminal = makePT({ terminalId: "t1", tentacleId: "t1", lastActiveAt: ts });
    const path = write("v3-active.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.lastActiveAt).toBe(ts);
  });

  it("parses lifecycleReason field", () => {
    const terminal = makePT({
      terminalId: "t1",
      tentacleId: "t1",
      lifecycleState: "stopped",
      lifecycleReason: "operator stop",
    });
    const path = write("v3-reason.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.lifecycleReason).toBe("operator stop");
  });

  it("parses lifecycleUpdatedAt field", () => {
    const ts = new Date().toISOString();
    const terminal = makePT({
      terminalId: "t1",
      tentacleId: "t1",
      lifecycleUpdatedAt: ts,
    });
    const path = write("v3-lcupdate.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.lifecycleUpdatedAt).toBe(ts);
  });

  it("parses startedAt field", () => {
    const ts = new Date().toISOString();
    const terminal = makePT({ terminalId: "t1", tentacleId: "t1", startedAt: ts });
    const path = write("v3-started.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.startedAt).toBe(ts);
  });

  it("parses endedAt field", () => {
    const ts = new Date().toISOString();
    const terminal = makePT({ terminalId: "t1", tentacleId: "t1", endedAt: ts });
    const path = write("v3-ended.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.endedAt).toBe(ts);
  });

  it("parses numeric exitSignal field", () => {
    const terminal = makePT({ terminalId: "t1", tentacleId: "t1", exitSignal: 9 });
    const path = write("v3-signal.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.exitSignal).toBe(9);
  });

  it("parses nameOrigin field when valid", () => {
    const terminal = makePT({ terminalId: "t1", tentacleId: "t1", nameOrigin: "prompt" });
    const path = write("v3-name-origin.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.nameOrigin).toBe("prompt");
  });

  it("infers nameOrigin when field is invalid", () => {
    // Inject an invalid nameOrigin — should fall back to inferred value
    const raw = JSON.stringify({
      version: 3,
      terminals: [
        {
          terminalId: "t1",
          tentacleId: "t1",
          tentacleName: "My Custom Name",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          nameOrigin: "not-valid",
        },
      ],
    });
    const path = write("v3-bad-origin.json", raw);
    const result = loadTerminalRegistry(path);
    // Custom name → inferred as "user"
    expect(result.terminals.get("t1")?.nameOrigin).toBe("user");
  });

  it("ignores processId that is zero or negative", () => {
    const raw = JSON.stringify({
      version: 3,
      terminals: [
        {
          terminalId: "t1",
          tentacleId: "t1",
          tentacleName: "Agent",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          processId: 0,
        },
      ],
    });
    const path = write("v3-pid-zero.json", raw);
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.processId).toBeUndefined();
  });

  it("ignores processId that is not an integer", () => {
    const raw = JSON.stringify({
      version: 3,
      terminals: [
        {
          terminalId: "t1",
          tentacleId: "t1",
          tentacleName: "Agent",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          processId: 12.5,
        },
      ],
    });
    const path = write("v3-pid-float.json", raw);
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.processId).toBeUndefined();
  });

  it("ignores non-finite exitCode", () => {
    const raw = JSON.stringify({
      version: 3,
      terminals: [
        {
          terminalId: "t1",
          tentacleId: "t1",
          tentacleName: "Agent",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
          exitCode: Number.NaN,
        },
      ],
    });
    const path = write("v3-exitcode-nan.json", raw);
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.exitCode).toBeUndefined();
  });

  it("defaults workspaceMode to 'shared' for unknown values in v3", () => {
    const raw = JSON.stringify({
      version: 3,
      terminals: [
        {
          terminalId: "t1",
          tentacleId: "t1",
          tentacleName: "Agent",
          createdAt: new Date().toISOString(),
          workspaceMode: "unknown-mode",
        },
      ],
    });
    const path = write("v3-workspacemode.json", raw);
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.workspaceMode).toBe("shared");
  });

  it("defaults workspaceMode to 'shared' for unknown values in v1 migration", () => {
    const raw = JSON.stringify({
      version: 1,
      tentacles: [
        {
          tentacleId: "legacy-1",
          tentacleName: "Old Agent",
          createdAt: new Date().toISOString(),
          workspaceMode: "unknown-mode",
        },
      ],
    });
    const path = write("v1-workspacemode.json", raw);
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("legacy-1")?.workspaceMode).toBe("shared");
  });

  it("returns empty registry when v1 has duplicate tentacle ids", () => {
    const raw = JSON.stringify({
      version: 1,
      tentacles: [
        {
          tentacleId: "dup",
          tentacleName: "First",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
        {
          tentacleId: "dup",
          tentacleName: "Second",
          createdAt: new Date().toISOString(),
          workspaceMode: "shared",
        },
      ],
    });
    const path = write("v1-dup.json", raw);
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });
});

// ─── inferTerminalNameOrigin ──────────────────────────────────────────────────

describe("loadTerminalRegistry — inferTerminalNameOrigin patterns", () => {
  it("infers 'generated' for Octogent Terminal N naming pattern", () => {
    const terminal = makePT({ terminalId: "t1", tentacleName: "Octogent Terminal 42" });
    const path = write("octogent.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.nameOrigin).toBe("generated");
  });

  it("infers 'generated' when tentacleName equals terminalId", () => {
    const terminal = makePT({
      terminalId: "abc-123",
      tentacleId: "abc-123",
      tentacleName: "abc-123",
    });
    const path = write("same-name.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("abc-123")?.nameOrigin).toBe("generated");
  });

  it("infers 'user' for custom tentacle names", () => {
    const terminal = makePT({ terminalId: "t1", tentacleName: "Backend Refactor Agent" });
    const path = write("user-name.json", v3Doc([terminal]));
    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.nameOrigin).toBe("user");
  });
});
