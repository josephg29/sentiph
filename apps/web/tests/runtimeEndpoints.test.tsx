import { describe, expect, it } from "vitest";

import {
  buildAgentSnapshotsUrl,
  buildTentacleRenameUrl,
  buildTentaclesUrl,
  buildTerminalSocketUrl,
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
