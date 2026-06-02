import { describe, expect, it } from "vitest";

import { parseUiStatePatch } from "../src/createApiServer/uiStateParsers";

describe("parseUiStatePatch", () => {
  it("returns error when payload is null", () => {
    const result = parseUiStatePatch(null);
    expect(result.patch).toBeNull();
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns error when payload is undefined", () => {
    const result = parseUiStatePatch(undefined);
    expect(result.patch).toBeNull();
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns error when payload is a string", () => {
    const result = parseUiStatePatch("hello");
    expect(result.patch).toBeNull();
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns error when payload is a number", () => {
    const result = parseUiStatePatch(42);
    expect(result.patch).toBeNull();
    expect(result.error).toBe("Expected a JSON object body.");
  });

  it("returns empty patch for an empty object", () => {
    const result = parseUiStatePatch({});
    expect(result.error).toBeNull();
    expect(result.patch).toEqual({});
  });

  // activePrimaryNav
  it("accepts activePrimaryNav as positive integer", () => {
    const result = parseUiStatePatch({ activePrimaryNav: 2 });
    expect(result.patch?.activePrimaryNav).toBe(2);
    expect(result.error).toBeNull();
  });

  it("rejects activePrimaryNav of 0", () => {
    const result = parseUiStatePatch({ activePrimaryNav: 0 });
    expect(result.error).toBe("activePrimaryNav must be a positive integer.");
  });

  it("rejects activePrimaryNav that is negative", () => {
    const result = parseUiStatePatch({ activePrimaryNav: -1 });
    expect(result.error).toBe("activePrimaryNav must be a positive integer.");
  });

  it("rejects activePrimaryNav that is a float", () => {
    const result = parseUiStatePatch({ activePrimaryNav: 1.5 });
    expect(result.error).toBe("activePrimaryNav must be a positive integer.");
  });

  it("rejects activePrimaryNav that is a string", () => {
    const result = parseUiStatePatch({ activePrimaryNav: "1" });
    expect(result.error).toBe("activePrimaryNav must be a positive integer.");
  });

  // isAgentsSidebarVisible
  it("accepts isAgentsSidebarVisible true", () => {
    const result = parseUiStatePatch({ isAgentsSidebarVisible: true });
    expect(result.patch?.isAgentsSidebarVisible).toBe(true);
    expect(result.error).toBeNull();
  });

  it("accepts isAgentsSidebarVisible false", () => {
    const result = parseUiStatePatch({ isAgentsSidebarVisible: false });
    expect(result.patch?.isAgentsSidebarVisible).toBe(false);
    expect(result.error).toBeNull();
  });

  it("rejects isAgentsSidebarVisible that is not boolean", () => {
    const result = parseUiStatePatch({ isAgentsSidebarVisible: 1 });
    expect(result.error).toBe("isAgentsSidebarVisible must be a boolean.");
  });

  // sidebarWidth
  it("accepts sidebarWidth as finite number", () => {
    const result = parseUiStatePatch({ sidebarWidth: 380 });
    expect(result.patch?.sidebarWidth).toBe(380);
    expect(result.error).toBeNull();
  });

  it("rejects sidebarWidth that is Infinity", () => {
    const result = parseUiStatePatch({ sidebarWidth: Number.POSITIVE_INFINITY });
    expect(result.error).toBe("sidebarWidth must be a finite number.");
  });

  it("rejects sidebarWidth that is NaN", () => {
    const result = parseUiStatePatch({ sidebarWidth: Number.NaN });
    expect(result.error).toBe("sidebarWidth must be a finite number.");
  });

  it("rejects sidebarWidth that is a string", () => {
    const result = parseUiStatePatch({ sidebarWidth: "380" });
    expect(result.error).toBe("sidebarWidth must be a finite number.");
  });

  // isActiveAgentsSectionExpanded
  it("accepts isActiveAgentsSectionExpanded", () => {
    const result = parseUiStatePatch({ isActiveAgentsSectionExpanded: false });
    expect(result.patch?.isActiveAgentsSectionExpanded).toBe(false);
    expect(result.error).toBeNull();
  });

  it("rejects isActiveAgentsSectionExpanded non-boolean", () => {
    const result = parseUiStatePatch({ isActiveAgentsSectionExpanded: "yes" });
    expect(result.error).toBe("isActiveAgentsSectionExpanded must be a boolean.");
  });

  // isRuntimeStatusStripVisible
  it("accepts isRuntimeStatusStripVisible", () => {
    const result = parseUiStatePatch({ isRuntimeStatusStripVisible: true });
    expect(result.patch?.isRuntimeStatusStripVisible).toBe(true);
    expect(result.error).toBeNull();
  });

  it("rejects isRuntimeStatusStripVisible non-boolean", () => {
    const result = parseUiStatePatch({ isRuntimeStatusStripVisible: 0 });
    expect(result.error).toBe("isRuntimeStatusStripVisible must be a boolean.");
  });

  // isBottomTelemetryVisible
  it("accepts isBottomTelemetryVisible", () => {
    const result = parseUiStatePatch({ isBottomTelemetryVisible: false });
    expect(result.patch?.isBottomTelemetryVisible).toBe(false);
    expect(result.error).toBeNull();
  });

  it("rejects isBottomTelemetryVisible non-boolean", () => {
    const result = parseUiStatePatch({ isBottomTelemetryVisible: null });
    expect(result.error).toBe("isBottomTelemetryVisible must be a boolean.");
  });

  // isCodexUsageVisible
  it("accepts isCodexUsageVisible", () => {
    const result = parseUiStatePatch({ isCodexUsageVisible: true });
    expect(result.patch?.isCodexUsageVisible).toBe(true);
    expect(result.error).toBeNull();
  });

  it("rejects isCodexUsageVisible non-boolean", () => {
    const result = parseUiStatePatch({ isCodexUsageVisible: "true" });
    expect(result.error).toBe("isCodexUsageVisible must be a boolean.");
  });

  // isClaudeUsageVisible
  it("accepts isClaudeUsageVisible", () => {
    const result = parseUiStatePatch({ isClaudeUsageVisible: false });
    expect(result.patch?.isClaudeUsageVisible).toBe(false);
    expect(result.error).toBeNull();
  });

  it("rejects isClaudeUsageVisible non-boolean", () => {
    const result = parseUiStatePatch({ isClaudeUsageVisible: 1 });
    expect(result.error).toBe("isClaudeUsageVisible must be a boolean.");
  });

  // isClaudeUsageSectionExpanded
  it("accepts isClaudeUsageSectionExpanded", () => {
    const result = parseUiStatePatch({ isClaudeUsageSectionExpanded: true });
    expect(result.patch?.isClaudeUsageSectionExpanded).toBe(true);
    expect(result.error).toBeNull();
  });

  it("rejects isClaudeUsageSectionExpanded non-boolean", () => {
    const result = parseUiStatePatch({ isClaudeUsageSectionExpanded: "false" });
    expect(result.error).toBe("isClaudeUsageSectionExpanded must be a boolean.");
  });

  // isCodexUsageSectionExpanded
  it("accepts isCodexUsageSectionExpanded", () => {
    const result = parseUiStatePatch({ isCodexUsageSectionExpanded: false });
    expect(result.patch?.isCodexUsageSectionExpanded).toBe(false);
    expect(result.error).toBeNull();
  });

  it("rejects isCodexUsageSectionExpanded non-boolean", () => {
    const result = parseUiStatePatch({ isCodexUsageSectionExpanded: 0 });
    expect(result.error).toBe("isCodexUsageSectionExpanded must be a boolean.");
  });

  // terminalCompletionSound
  it("accepts a valid terminalCompletionSound", () => {
    const result = parseUiStatePatch({ terminalCompletionSound: "double-beep" });
    expect(result.patch?.terminalCompletionSound).toBe("double-beep");
    expect(result.error).toBeNull();
  });

  it("rejects invalid terminalCompletionSound", () => {
    const result = parseUiStatePatch({ terminalCompletionSound: "laser-zap" });
    expect(result.error).toBe(
      "terminalCompletionSound must be one of the supported sound identifiers.",
    );
  });

  // minimizedTerminalIds
  it("accepts minimizedTerminalIds as array of strings", () => {
    const result = parseUiStatePatch({ minimizedTerminalIds: ["terminal-1", "terminal-2"] });
    expect(result.patch?.minimizedTerminalIds).toEqual(["terminal-1", "terminal-2"]);
    expect(result.error).toBeNull();
  });

  it("deduplicates minimizedTerminalIds", () => {
    const result = parseUiStatePatch({ minimizedTerminalIds: ["a", "a", "b"] });
    expect(result.patch?.minimizedTerminalIds).toEqual(["a", "b"]);
  });

  it("rejects minimizedTerminalIds that is not an array", () => {
    const result = parseUiStatePatch({ minimizedTerminalIds: "terminal-1" });
    expect(result.error).toBe("minimizedTerminalIds must be an array of strings.");
  });

  it("rejects minimizedTerminalIds with non-string entries", () => {
    const result = parseUiStatePatch({ minimizedTerminalIds: ["a", 2] });
    expect(result.error).toBe("minimizedTerminalIds must be an array of strings.");
  });

  // terminalWidths
  it("accepts terminalWidths as object map of numbers", () => {
    const result = parseUiStatePatch({ terminalWidths: { "terminal-1": 420 } });
    expect(result.patch?.terminalWidths).toEqual({ "terminal-1": 420 });
    expect(result.error).toBeNull();
  });

  it("rejects terminalWidths that is not an object", () => {
    const result = parseUiStatePatch({ terminalWidths: "wide" });
    expect(result.error).toBe("terminalWidths must be an object map of numbers.");
  });

  it("rejects terminalWidths that is null", () => {
    const result = parseUiStatePatch({ terminalWidths: null });
    expect(result.error).toBe("terminalWidths must be an object map of numbers.");
  });

  it("rejects terminalWidths that is an array", () => {
    const result = parseUiStatePatch({ terminalWidths: [420] });
    expect(result.error).toBe("terminalWidths must be an object map of numbers.");
  });

  it("rejects terminalWidths with non-number values", () => {
    const result = parseUiStatePatch({ terminalWidths: { "terminal-1": "wide" } });
    expect(result.error).toBe("terminalWidths must be an object map of numbers.");
  });

  it("rejects terminalWidths with Infinity values", () => {
    const result = parseUiStatePatch({
      terminalWidths: { "terminal-1": Number.POSITIVE_INFINITY },
    });
    expect(result.error).toBe("terminalWidths must be an object map of numbers.");
  });

  // canvasOpenTerminalIds
  it("accepts canvasOpenTerminalIds as array of strings", () => {
    const result = parseUiStatePatch({ canvasOpenTerminalIds: ["terminal-1"] });
    expect(result.patch?.canvasOpenTerminalIds).toEqual(["terminal-1"]);
    expect(result.error).toBeNull();
  });

  it("rejects canvasOpenTerminalIds that is not an array", () => {
    const result = parseUiStatePatch({ canvasOpenTerminalIds: "terminal-1" });
    expect(result.error).toBe("canvasOpenTerminalIds must be an array of strings.");
  });

  it("rejects canvasOpenTerminalIds with non-string entries", () => {
    const result = parseUiStatePatch({ canvasOpenTerminalIds: [1, 2] });
    expect(result.error).toBe("canvasOpenTerminalIds must be an array of strings.");
  });

  // canvasOpenTentacleIds
  it("accepts canvasOpenTentacleIds as array of strings", () => {
    const result = parseUiStatePatch({ canvasOpenTentacleIds: ["docs"] });
    expect(result.patch?.canvasOpenTentacleIds).toEqual(["docs"]);
    expect(result.error).toBeNull();
  });

  it("rejects canvasOpenTentacleIds that is not an array", () => {
    const result = parseUiStatePatch({ canvasOpenTentacleIds: {} });
    expect(result.error).toBe("canvasOpenTentacleIds must be an array of strings.");
  });

  it("rejects canvasOpenTentacleIds with non-string entries", () => {
    const result = parseUiStatePatch({ canvasOpenTentacleIds: [true] });
    expect(result.error).toBe("canvasOpenTentacleIds must be an array of strings.");
  });

  // canvasTerminalsPanelWidth
  it("accepts canvasTerminalsPanelWidth as finite number", () => {
    const result = parseUiStatePatch({ canvasTerminalsPanelWidth: 500 });
    expect(result.patch?.canvasTerminalsPanelWidth).toBe(500);
    expect(result.error).toBeNull();
  });

  it("rejects canvasTerminalsPanelWidth that is Infinity", () => {
    const result = parseUiStatePatch({ canvasTerminalsPanelWidth: Number.POSITIVE_INFINITY });
    expect(result.error).toBe("canvasTerminalsPanelWidth must be a finite number.");
  });

  it("rejects canvasTerminalsPanelWidth that is a string", () => {
    const result = parseUiStatePatch({ canvasTerminalsPanelWidth: "500" });
    expect(result.error).toBe("canvasTerminalsPanelWidth must be a finite number.");
  });

  // terminalInactivityThresholdMs
  it("accepts terminalInactivityThresholdMs as positive number", () => {
    const result = parseUiStatePatch({ terminalInactivityThresholdMs: 5000 });
    expect(result.patch?.terminalInactivityThresholdMs).toBe(5000);
    expect(result.error).toBeNull();
  });

  it("rejects terminalInactivityThresholdMs of 0", () => {
    const result = parseUiStatePatch({ terminalInactivityThresholdMs: 0 });
    expect(result.error).toBe("terminalInactivityThresholdMs must be a positive number.");
  });

  it("rejects terminalInactivityThresholdMs that is negative", () => {
    const result = parseUiStatePatch({ terminalInactivityThresholdMs: -1 });
    expect(result.error).toBe("terminalInactivityThresholdMs must be a positive number.");
  });

  it("rejects terminalInactivityThresholdMs that is Infinity", () => {
    const result = parseUiStatePatch({ terminalInactivityThresholdMs: Number.POSITIVE_INFINITY });
    expect(result.error).toBe("terminalInactivityThresholdMs must be a positive number.");
  });

  it("rejects terminalInactivityThresholdMs that is a string", () => {
    const result = parseUiStatePatch({ terminalInactivityThresholdMs: "5000" });
    expect(result.error).toBe("terminalInactivityThresholdMs must be a positive number.");
  });

  // Multiple fields at once (happy path)
  it("accepts multiple valid fields together", () => {
    const result = parseUiStatePatch({
      isAgentsSidebarVisible: false,
      sidebarWidth: 380,
      minimizedTerminalIds: ["terminal-1"],
      terminalWidths: { "terminal-1": 420 },
      terminalCompletionSound: "double-beep",
    });
    expect(result.error).toBeNull();
    expect(result.patch?.isAgentsSidebarVisible).toBe(false);
    expect(result.patch?.sidebarWidth).toBe(380);
    expect(result.patch?.minimizedTerminalIds).toEqual(["terminal-1"]);
    expect(result.patch?.terminalWidths).toEqual({ "terminal-1": 420 });
    expect(result.patch?.terminalCompletionSound).toBe("double-beep");
  });
});
