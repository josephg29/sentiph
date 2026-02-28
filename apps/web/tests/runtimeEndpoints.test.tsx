import { describe, expect, it } from "vitest";

import {
  buildAgentSnapshotsUrl,
  buildCodexUsageUrl,
  buildGithubSummaryUrl,
  buildMonitorConfigUrl,
  buildMonitorFeedUrl,
  buildMonitorRefreshUrl,
  buildTentacleRenameUrl,
  buildTentaclesUrl,
  buildTerminalSocketUrl,
  buildUiStateUrl,
} from "../src/runtime/runtimeEndpoints";

describe("runtimeEndpoints", () => {
  it("returns same-origin API path when runtime base URL is not configured", () => {
    expect(buildAgentSnapshotsUrl()).toBe("/api/agent-snapshots");
  });

  it("builds absolute API URL when runtime base URL is configured", () => {
    expect(buildAgentSnapshotsUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/agent-snapshots",
    );
  });

  it("builds tentacle creation URL on same origin by default", () => {
    expect(buildTentaclesUrl()).toBe("/api/tentacles");
  });

  it("builds absolute tentacle creation URL when runtime base URL is configured", () => {
    expect(buildTentaclesUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles",
    );
  });

  it("builds codex usage URL on same origin by default", () => {
    expect(buildCodexUsageUrl()).toBe("/api/codex/usage");
  });

  it("builds absolute codex usage URL when runtime base URL is configured", () => {
    expect(buildCodexUsageUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/codex/usage",
    );
  });

  it("builds github summary URL on same origin by default", () => {
    expect(buildGithubSummaryUrl()).toBe("/api/github/summary");
  });

  it("builds absolute github summary URL when runtime base URL is configured", () => {
    expect(buildGithubSummaryUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/github/summary",
    );
  });

  it("builds monitor config URL on same origin by default", () => {
    expect(buildMonitorConfigUrl()).toBe("/api/monitor/config");
  });

  it("builds monitor feed URL on same origin by default", () => {
    expect(buildMonitorFeedUrl()).toBe("/api/monitor/feed");
  });

  it("builds monitor refresh URL on same origin by default", () => {
    expect(buildMonitorRefreshUrl()).toBe("/api/monitor/refresh");
  });

  it("builds absolute monitor URLs when runtime base URL is configured", () => {
    expect(buildMonitorConfigUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/monitor/config",
    );
    expect(buildMonitorFeedUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/monitor/feed",
    );
    expect(buildMonitorRefreshUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/monitor/refresh",
    );
  });

  it("builds ui state URL on same origin by default", () => {
    expect(buildUiStateUrl()).toBe("/api/ui-state");
  });

  it("builds absolute ui state URL when runtime base URL is configured", () => {
    expect(buildUiStateUrl("https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/ui-state",
    );
  });

  it("builds tentacle rename URL on same origin by default", () => {
    expect(buildTentacleRenameUrl("tentacle-main")).toBe("/api/tentacles/tentacle-main");
  });

  it("builds absolute tentacle rename URL when runtime base URL is configured", () => {
    expect(buildTentacleRenameUrl("tentacle-main", "https://runtime.example.com")).toBe(
      "https://runtime.example.com/api/tentacles/tentacle-main",
    );
  });

  it("builds same-origin websocket URL by default", () => {
    expect(
      buildTerminalSocketUrl(
        "tentacle-main",
        undefined,
        new URL("https://workspace.example.com/dashboard") as unknown as Location,
      ),
    ).toBe("wss://workspace.example.com/api/terminals/tentacle-main/ws");
  });

  it("builds websocket URL from configured runtime base URL", () => {
    expect(
      buildTerminalSocketUrl(
        "tentacle-main",
        "http://127.0.0.1:8787",
        new URL("https://workspace.example.com/dashboard") as unknown as Location,
      ),
    ).toBe("ws://127.0.0.1:8787/api/terminals/tentacle-main/ws");
  });
});
