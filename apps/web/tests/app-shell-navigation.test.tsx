import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { jsonResponse, resetAppTestHarness } from "./test-utils/appTestHarness";

describe("App shell and navigation", () => {
  afterEach(() => {
    cleanup();
    resetAppTestHarness();
  });

  it("renders empty view when API returns no active agents", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "[9] Board" }));

    expect(await screen.findByText("No active terminals")).toBeInTheDocument();
    expect(screen.getByText("When agents start, terminals will appear here.")).toBeInTheDocument();
    expect(screen.getByTestId("empty-octopus")).toBeInTheDocument();
  });

  it("renders the persistent 5-zone shell with navigation hints", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);

    await screen.findByLabelText("Active Agents sidebar");
    expect(screen.getByLabelText("Runtime status strip")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByLabelText("Main content canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Telemetry ticker tape")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Context search input" })).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Runtime")).not.toBeInTheDocument();
    expect(await screen.findByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("Press 1-9 to navigate")).toBeInTheDocument();
  });

  it("supports keyboard-first primary navigation with number keys 1-9", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);
    await screen.findByLabelText("Active Agents sidebar");

    fireEvent.keyDown(window, { key: "4" });

    expect(
      screen.getByRole("button", {
        name: "[4] Monitor",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("renders settings panel when navigating to settings tab", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);
    await screen.findByLabelText("Active Agents sidebar");

    fireEvent.click(
      screen.getByRole("button", {
        name: "[6] Settings",
      }),
    );

    expect(await screen.findByLabelText("Settings primary view")).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Tentacle completion notification sound" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show Codex token usage in sidebar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show Claude token usage in sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show runtime status strip" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show Monitor workspace view" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show bottom telemetry tape" })).toBeInTheDocument();
  });

  it("renders conversations panel when navigating to conversations tab", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);
    await screen.findByLabelText("Active Agents sidebar");

    fireEvent.click(
      screen.getByRole("button", {
        name: "[5] Conversations",
      }),
    );

    expect(await screen.findByLabelText("Conversations primary view")).toBeInTheDocument();
  });

  it("previews completion sound when a settings option is selected", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const MockAudio = vi.fn(() => ({
      currentTime: 0,
      play,
      preload: "auto",
    }));
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse([]));

    render(<App />);
    await screen.findByLabelText("Active Agents sidebar");

    fireEvent.click(screen.getByRole("button", { name: "[6] Settings" }));
    fireEvent.click(screen.getByRole("radio", { name: /Retro beep/i }));

    expect(MockAudio).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shows OFFLINE when backend requests fail", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    render(<App />);

    const loadErrors = await screen.findAllByText("Agent data is currently unavailable.");
    expect(loadErrors.length).toBeGreaterThan(0);
    expect(await screen.findByText("OFFLINE")).toBeInTheDocument();
  });
});
