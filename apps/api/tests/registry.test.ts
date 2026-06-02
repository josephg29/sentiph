import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTerminalRegistryPersistence,
  loadTerminalRegistry,
  pruneUiStateTerminalReferences,
} from "../src/terminalRuntime/registry";
import type { PersistedTerminal, PersistedUiState } from "../src/terminalRuntime/types";

const makePT = (overrides: Partial<PersistedTerminal> = {}): PersistedTerminal => ({
  terminalId: "t1",
  tentacleId: "t1",
  tentacleName: "Agent 1",
  createdAt: new Date().toISOString(),
  workspaceMode: "shared",
  ...overrides,
});

const v3Doc = (terminals: PersistedTerminal[], uiState: PersistedUiState = {}) =>
  JSON.stringify({ version: 3, terminals, uiState });

describe("pruneUiStateTerminalReferences", () => {
  it("removes minimized ids that no longer exist in terminals", () => {
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT({ terminalId: "t1" })]]);
    const uiState: PersistedUiState = { minimizedTerminalIds: ["t1", "t2", "t3"] };
    const result = pruneUiStateTerminalReferences(uiState, terminals);
    expect(result.minimizedTerminalIds).toEqual(["t1"]);
  });

  it("removes stale terminal widths", () => {
    const terminals = new Map<string, PersistedTerminal>([["t1", makePT({ terminalId: "t1" })]]);
    const uiState: PersistedUiState = { terminalWidths: { t1: 300, t2: 200, t99: 100 } };
    const result = pruneUiStateTerminalReferences(uiState, terminals);
    expect(result.terminalWidths).toEqual({ t1: 300 });
  });

  it("is a no-op when no minimized ids or widths are set", () => {
    const terminals = new Map<string, PersistedTerminal>();
    const uiState: PersistedUiState = { sidebarWidth: 240 };
    const result = pruneUiStateTerminalReferences(uiState, terminals);
    expect(result.sidebarWidth).toBe(240);
    expect(result.minimizedTerminalIds).toBeUndefined();
    expect(result.terminalWidths).toBeUndefined();
  });

  it("keeps all ids when every id is still active", () => {
    const terminals = new Map<string, PersistedTerminal>([
      ["t1", makePT({ terminalId: "t1" })],
      ["t2", makePT({ terminalId: "t2" })],
    ]);
    const uiState: PersistedUiState = {
      minimizedTerminalIds: ["t1", "t2"],
      terminalWidths: { t1: 100, t2: 200 },
    };
    const result = pruneUiStateTerminalReferences(uiState, terminals);
    expect(result.minimizedTerminalIds).toEqual(["t1", "t2"]);
    expect(result.terminalWidths).toEqual({ t1: 100, t2: 200 });
  });

  it("returns empty arrays when all ids are stale", () => {
    const terminals = new Map<string, PersistedTerminal>();
    const uiState: PersistedUiState = {
      minimizedTerminalIds: ["deleted1", "deleted2"],
      terminalWidths: { deleted1: 100 },
    };
    const result = pruneUiStateTerminalReferences(uiState, terminals);
    expect(result.minimizedTerminalIds).toEqual([]);
    expect(result.terminalWidths).toEqual({});
  });
});

describe("loadTerminalRegistry", () => {
  const tmpDirs: string[] = [];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "registry-test-"));
    tmpDirs.push(tmpDir);
  });

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("returns empty registry when file does not exist", () => {
    const path = join(tmpDir, "nonexistent.json");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
    expect(result.uiState).toEqual({});
  });

  it("parses a valid v3 registry with one terminal", () => {
    const terminal = makePT({ terminalId: "t1", tentacleId: "t1" });
    const path = join(tmpDir, "registry.json");
    writeFileSync(path, v3Doc([terminal]), "utf8");

    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(1);
    expect(result.terminals.get("t1")?.tentacleName).toBe("Agent 1");
  });

  it("parses a v3 registry with worktreeId, parentTerminalId, and isGroupLeader", () => {
    const terminal = makePT({
      terminalId: "t2",
      tentacleId: "t2",
      worktreeId: "wt-t2",
      parentTerminalId: "t1",
      isGroupLeader: true,
      agentProvider: "claude-code",
      lifecycleState: "stopped",
      processId: 1234,
    });
    const path = join(tmpDir, "registry2.json");
    writeFileSync(path, v3Doc([terminal]), "utf8");

    const result = loadTerminalRegistry(path);
    const t = result.terminals.get("t2");
    expect(t?.worktreeId).toBe("wt-t2");
    expect(t?.parentTerminalId).toBe("t1");
    expect(t?.isGroupLeader).toBe(true);
    expect(t?.agentProvider).toBe("claude-code");
    expect(t?.lifecycleState).toBe("stopped");
    expect(t?.processId).toBe(1234);
  });

  it("infers nameOrigin 'generated' for default-named terminals", () => {
    const terminal = makePT({ terminalId: "t1", tentacleName: "Sentiph Terminal 1" });
    const path = join(tmpDir, "registry3.json");
    writeFileSync(path, v3Doc([terminal]), "utf8");

    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.nameOrigin).toBe("generated");
  });

  it("infers nameOrigin 'user' for custom-named terminals", () => {
    const terminal = makePT({ terminalId: "t1", tentacleName: "My Special Agent" });
    const path = join(tmpDir, "registry4.json");
    writeFileSync(path, v3Doc([terminal]), "utf8");

    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t1")?.nameOrigin).toBe("user");
  });

  it("migrates a v1 registry (tentacles array) to v3 terminal format", () => {
    const v1Doc = JSON.stringify({
      version: 1,
      tentacles: [
        {
          tentacleId: "legacy-1",
          tentacleName: "Old Agent",
          createdAt: "2024-01-01T00:00:00.000Z",
          workspaceMode: "shared",
        },
      ],
    });
    const path = join(tmpDir, "v1registry.json");
    writeFileSync(path, v1Doc, "utf8");

    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(1);
    expect(result.terminals.get("legacy-1")?.tentacleName).toBe("Old Agent");
  });

  it("migrates a v2 registry to v3 format", () => {
    const v2Doc = JSON.stringify({
      version: 2,
      tentacles: [
        {
          tentacleId: "legacy-2",
          tentacleName: "Old Agent 2",
          createdAt: "2024-01-01T00:00:00.000Z",
          workspaceMode: "worktree",
        },
      ],
    });
    const path = join(tmpDir, "v2registry.json");
    writeFileSync(path, v2Doc, "utf8");

    const result = loadTerminalRegistry(path);
    const t = result.terminals.get("legacy-2");
    expect(t?.workspaceMode).toBe("worktree");
  });

  it("returns empty registry and warns on invalid JSON", () => {
    const path = join(tmpDir, "bad.json");
    writeFileSync(path, "not json {{{{", "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry on unsupported version number", () => {
    const path = join(tmpDir, "future.json");
    writeFileSync(path, JSON.stringify({ version: 999, terminals: [] }), "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry when registry has non-object shape", () => {
    const path = join(tmpDir, "arr.json");
    writeFileSync(path, JSON.stringify([1, 2, 3]), "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("throws and returns empty registry on duplicate terminal id in v3", () => {
    const terminal = makePT({ terminalId: "dup", tentacleId: "dup" });
    const path = join(tmpDir, "dup.json");
    writeFileSync(path, v3Doc([terminal, { ...terminal }]), "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("parses uiState fields correctly", () => {
    const uiState: PersistedUiState = {
      isAgentsSidebarVisible: true,
      sidebarWidth: 280,
      terminalCompletionSound: "soft-chime",
      minimizedTerminalIds: ["t1"],
      terminalWidths: { t1: 400 },
    };
    const terminal = makePT({ terminalId: "t1" });
    const path = join(tmpDir, "ui.json");
    writeFileSync(path, v3Doc([terminal], uiState), "utf8");

    const result = loadTerminalRegistry(path);
    expect(result.uiState.isAgentsSidebarVisible).toBe(true);
    expect(result.uiState.sidebarWidth).toBe(280);
    expect(result.uiState.terminalCompletionSound).toBe("soft-chime");
    expect(result.uiState.minimizedTerminalIds).toEqual(["t1"]);
    expect(result.uiState.terminalWidths?.t1).toBe(400);
  });

  it("ignores invalid uiState fields gracefully", () => {
    const path = join(tmpDir, "bad-ui.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 3,
        terminals: [],
        uiState: {
          sidebarWidth: "not-a-number",
          isAgentsSidebarVisible: "yes",
          terminalCompletionSound: "invalid-sound-id",
        },
      }),
      "utf8",
    );
    const result = loadTerminalRegistry(path);
    expect(result.uiState.sidebarWidth).toBeUndefined();
    expect(result.uiState.isAgentsSidebarVisible).toBeUndefined();
    expect(result.uiState.terminalCompletionSound).toBeUndefined();
  });

  it("handles v3 terminal with exitCode and exitSignal", () => {
    const terminal = makePT({
      terminalId: "t-exit",
      tentacleId: "t-exit",
      exitCode: 1,
      exitSignal: "SIGTERM",
      claudeSessionId: "abc-uuid",
    });
    const path = join(tmpDir, "exit.json");
    writeFileSync(path, v3Doc([terminal]), "utf8");

    const result = loadTerminalRegistry(path);
    const t = result.terminals.get("t-exit");
    expect(t?.exitCode).toBe(1);
    expect(t?.exitSignal).toBe("SIGTERM");
    expect(t?.claudeSessionId).toBe("abc-uuid");
  });

  it("ignores claudeSessionId that is an empty string", () => {
    const terminal = makePT({
      terminalId: "t-nosess",
      tentacleId: "t-nosess",
      claudeSessionId: "",
    });
    const path = join(tmpDir, "nosess.json");
    writeFileSync(path, v3Doc([terminal]), "utf8");

    const result = loadTerminalRegistry(path);
    expect(result.terminals.get("t-nosess")?.claudeSessionId).toBeUndefined();
  });
});

describe("createTerminalRegistryPersistence", () => {
  const tmpDirs: string[] = [];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "registry-persist-test-"));
    tmpDirs.push(tmpDir);
  });

  afterEach(async () => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  const makeState = (terminals: PersistedTerminal[] = []) => ({
    terminals: new Map(terminals.map((t) => [t.terminalId, t])),
    uiState: {} as PersistedUiState,
  });

  it("flushes state to disk on close", async () => {
    const path = join(tmpDir, "reg.json");
    const persistence = createTerminalRegistryPersistence(path);
    persistence.schedulePersist(makeState([makePT({ terminalId: "t1" })]));
    await persistence.close();

    const reloaded = loadTerminalRegistry(path);
    expect(reloaded.terminals.has("t1")).toBe(true);
  });

  it("deduplicates rapid consecutive schedulePersist calls", async () => {
    const path = join(tmpDir, "dedup.json");
    const persistence = createTerminalRegistryPersistence(path);
    const state = makeState([makePT({ terminalId: "t1" })]);

    // Schedule the same serialized content multiple times — should collapse
    persistence.schedulePersist(state);
    persistence.schedulePersist(state);
    persistence.schedulePersist(state);
    await persistence.close();

    const reloaded = loadTerminalRegistry(path);
    expect(reloaded.terminals.size).toBe(1);
  });

  it("skips write when serialized content matches last persisted value", async () => {
    const path = join(tmpDir, "noop.json");
    const persistence = createTerminalRegistryPersistence(path);
    const state = makeState([makePT({ terminalId: "t1" })]);

    // First write
    persistence.schedulePersist(state);
    await persistence.flush();

    // Schedule the same state again — should not trigger another write
    persistence.schedulePersist(state);
    await persistence.close();

    const reloaded = loadTerminalRegistry(path);
    expect(reloaded.terminals.size).toBe(1);
  });

  it("creates parent directories when writing to a nested path", async () => {
    const nested = join(tmpDir, "deep", "nested", "reg.json");
    const persistence = createTerminalRegistryPersistence(nested);
    persistence.schedulePersist(makeState([makePT()]));
    await persistence.close();

    const reloaded = loadTerminalRegistry(nested);
    expect(reloaded.terminals.size).toBe(1);
  });

  it("persists multiple distinct states sequentially", async () => {
    const path = join(tmpDir, "seq.json");
    const persistence = createTerminalRegistryPersistence(path);

    persistence.schedulePersist(makeState([makePT({ terminalId: "t1" })]));
    await persistence.flush();

    persistence.schedulePersist(
      makeState([makePT({ terminalId: "t1" }), makePT({ terminalId: "t2", tentacleId: "t2" })]),
    );
    await persistence.close();

    const reloaded = loadTerminalRegistry(path);
    expect(reloaded.terminals.size).toBe(2);
  });

  it("triggers runWriteLoop via debounce timer path", async () => {
    const path = join(tmpDir, "debounce.json");
    const persistence = createTerminalRegistryPersistence(path);

    // Schedule but don't manually flush — rely on the debounce timer
    persistence.schedulePersist(makeState([makePT({ terminalId: "t1" })]));

    // Wait beyond the 100ms debounce window
    await new Promise((resolve) => setTimeout(resolve, 200));

    const reloaded = loadTerminalRegistry(path);
    expect(reloaded.terminals.size).toBe(1);
    await persistence.close();
  });

  it("handles concurrent schedulePersist calls during an in-progress write", async () => {
    const path = join(tmpDir, "concurrent.json");
    const persistence = createTerminalRegistryPersistence(path);

    // Trigger multiple rapid updates to exercise the write loop queuing
    for (let i = 0; i < 5; i++) {
      persistence.schedulePersist(
        makeState([makePT({ terminalId: `t${i}`, tentacleId: `t${i}` })]),
      );
    }
    await persistence.close();

    // The last scheduled state should win
    const reloaded = loadTerminalRegistry(path);
    expect(reloaded.terminals.size).toBe(1);
  });
});

describe("loadTerminalRegistry — v1/v2 error branches", () => {
  const tmpDirs2: string[] = [];
  let tmpDir2: string;

  beforeEach(() => {
    tmpDir2 = mkdtempSync(join(tmpdir(), "registry-v2err-test-"));
    tmpDirs2.push(tmpDir2);
  });

  afterEach(() => {
    for (const d of tmpDirs2) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs2.length = 0;
  });

  it("returns empty registry when v2 tentacles array is not an array", () => {
    const doc = JSON.stringify({ version: 1, tentacles: "not-an-array" });
    const path = join(tmpDir2, "bad-v1.json");
    writeFileSync(path, doc, "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry when a v1 tentacle entry is null", () => {
    const doc = JSON.stringify({ version: 1, tentacles: [null] });
    const path = join(tmpDir2, "null-entry.json");
    writeFileSync(path, doc, "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry when a v1 tentacle entry is incomplete", () => {
    const doc = JSON.stringify({
      version: 1,
      tentacles: [{ tentacleId: "t1" }], // missing tentacleName and createdAt
    });
    const path = join(tmpDir2, "incomplete-v1.json");
    writeFileSync(path, doc, "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry when v3 terminals is not an array", () => {
    const doc = JSON.stringify({ version: 3, terminals: "nope" });
    const path = join(tmpDir2, "bad-v3.json");
    writeFileSync(path, doc, "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry when a v3 terminal entry is null", () => {
    const doc = JSON.stringify({ version: 3, terminals: [null] });
    const path = join(tmpDir2, "null-v3.json");
    writeFileSync(path, doc, "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });

  it("returns empty registry when a v3 terminal entry is incomplete", () => {
    const doc = JSON.stringify({
      version: 3,
      terminals: [{ terminalId: "t1" }], // missing tentacleId, tentacleName, createdAt
    });
    const path = join(tmpDir2, "incomplete-v3.json");
    writeFileSync(path, doc, "utf8");
    const result = loadTerminalRegistry(path);
    expect(result.terminals.size).toBe(0);
  });
});
