/**
 * tests/promptRoutes.test.ts
 *
 * Unit tests for createApiServer/promptRoutes.ts
 * Covers handlePromptItemRoute — all branches.
 */

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handlePromptItemRoute } from "../src/createApiServer/promptRoutes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentiph-prompts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function makeResponse(): ServerResponse {
  const res = new EventEmitter() as ServerResponse;
  res.writeHead = vi.fn() as unknown as typeof res.writeHead;
  res.end = vi.fn() as unknown as typeof res.end;
  return res;
}

function makeRequest(method = "GET"): IncomingMessage {
  const req = Readable.from([""]) as IncomingMessage;
  req.method = method;
  req.headers = {};
  return req;
}

function makeContext(pathname: string, method = "GET", promptsDir?: string) {
  return {
    request: makeRequest(method),
    response: makeResponse(),
    requestUrl: new URL(`http://localhost${pathname}`),
    corsOrigin: null as string | null,
    promptsDir,
  };
}

const baseDeps = {
  runtime: {} as never,
  workspaceCwd: "/tmp",
  projectStateDir: "/tmp/.sentiph",
  promptsDir: undefined as string | undefined,
  getApiBaseUrl: () => "http://127.0.0.1:8787",
  getApiPort: () => "8787",
  readClaudeUsageSnapshot: async () => ({}) as never,
  readClaudeOauthUsageSnapshot: async () => ({}) as never,
  readClaudeCliUsageSnapshot: async () => ({}) as never,
  readCodexUsageSnapshot: async () => ({}) as never,
  readGithubRepoSummary: async () => ({}) as never,
  scanUsageHeatmap: async () => ({}) as never,
  invalidateClaudeUsageCache: () => undefined,
  metricsStore: {} as never,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("handlePromptItemRoute", () => {
  it("returns false when pathname does not start with /api/prompts/", async () => {
    const ctx = makeContext("/api/other");
    const result = await handlePromptItemRoute(ctx, baseDeps);
    expect(result).toBe(false);
  });

  it("returns false for /api/prompts itself (prefix-only, no trailing name)", async () => {
    // the path starts with /api/prompts/ but name slice is empty
    const ctx = makeContext("/api/prompts/");
    const result = await handlePromptItemRoute(ctx, baseDeps);
    expect(result).toBe(true);
    // name is empty → 404
    expect(ctx.response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("returns 405 for non-GET methods", async () => {
    const ctx = makeContext("/api/prompts/my-prompt", "POST");
    const result = await handlePromptItemRoute(ctx, baseDeps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("returns 405 for DELETE method", async () => {
    const ctx = makeContext("/api/prompts/any-name", "DELETE");
    await handlePromptItemRoute(ctx, baseDeps);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it("returns 404 when name contains a slash (path traversal guard)", async () => {
    const ctx = makeContext("/api/prompts/foo/bar");
    const result = await handlePromptItemRoute(ctx, baseDeps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    const body = JSON.parse(
      (ctx.response.end as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string,
    ) as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when name contains '..' (path traversal guard)", async () => {
    const ctx = makeContext("/api/prompts/..%2fetc%2fpasswd");
    await handlePromptItemRoute(ctx, baseDeps);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("returns 404 when promptsDir is not configured", async () => {
    const ctx = makeContext("/api/prompts/my-prompt");
    const deps = { ...baseDeps, promptsDir: undefined };
    const result = await handlePromptItemRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("returns 404 when the prompt file does not exist", async () => {
    const dir = makeTempDir();
    const ctx = makeContext("/api/prompts/nonexistent");
    const deps = { ...baseDeps, promptsDir: dir };
    const result = await handlePromptItemRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("returns 200 with file content when prompt file exists", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "my-prompt.md"), "# My Prompt\n\nSome content.\n");
    const ctx = makeContext("/api/prompts/my-prompt");
    const deps = { ...baseDeps, promptsDir: dir };
    const result = await handlePromptItemRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const body = JSON.parse(
      (ctx.response.end as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string,
    ) as { name: string; source: string; content: string };
    expect(body.name).toBe("my-prompt");
    expect(body.source).toBe("builtin");
    expect(body.content).toBe("# My Prompt\n\nSome content.");
  });

  it("trims trailing whitespace from file content", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "padded.md"), "Hello world\n\n\n");
    const ctx = makeContext("/api/prompts/padded");
    const deps = { ...baseDeps, promptsDir: dir };
    await handlePromptItemRoute(ctx, deps);
    const body = JSON.parse(
      (ctx.response.end as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string,
    ) as { content: string };
    expect(body.content).toBe("Hello world");
  });

  it("returns 404 when reading the file throws (e.g., directory instead of file)", async () => {
    const dir = makeTempDir();
    // Create a directory named "broken.md" — readFileSync will throw EISDIR
    mkdirSync(join(dir, "broken.md"));
    const ctx = makeContext("/api/prompts/broken");
    const deps = { ...baseDeps, promptsDir: dir };
    const result = await handlePromptItemRoute(ctx, deps);
    expect(result).toBe(true);
    expect(ctx.response.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("passes corsOrigin to response headers", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "cors-prompt.md"), "Prompt content");
    const ctx = makeContext("/api/prompts/cors-prompt");
    ctx.corsOrigin = "https://example.com";
    const deps = { ...baseDeps, promptsDir: dir };
    await handlePromptItemRoute(ctx, deps);
    const headers = (ctx.response.writeHead as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as Record<string, string>;
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("https://example.com");
  });
});
