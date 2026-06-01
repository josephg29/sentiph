import { describe, expect, it } from "vitest";

import {
  extractBearerToken,
  getRequestCorsOrigin,
  isAllowedHostHeader,
  isAllowedOriginHeader,
  isLoopbackHostHeader,
  readHeaderValue,
  withCors,
} from "../src/createApiServer/security";

describe("isAllowedHostHeader (local-only mode)", () => {
  const local = (host: string | undefined) => isAllowedHostHeader(host, false);

  it("accepts loopback hosts with and without a port", () => {
    expect(local("127.0.0.1")).toBe(true);
    expect(local("127.0.0.1:8787")).toBe(true);
    expect(local("localhost")).toBe(true);
    expect(local("localhost:8787")).toBe(true);
    expect(local("[::1]:8787")).toBe(true);
  });

  it("rejects a missing Host header", () => {
    expect(local(undefined)).toBe(false);
    expect(local("")).toBe(false);
  });

  it("rejects non-loopback hosts (DNS-rebinding defense)", () => {
    expect(local("evil.com")).toBe(false);
    expect(local("attacker.example:8787")).toBe(false);
    expect(local("169.254.169.254")).toBe(false);
    expect(local("0.0.0.0")).toBe(false);
  });

  it("rejects hostnames that merely contain a loopback substring", () => {
    expect(local("localhost.evil.com")).toBe(false);
    expect(local("127.0.0.1.evil.com")).toBe(false);
  });

  it("is case-insensitive for the hostname", () => {
    expect(local("LOCALHOST:8787")).toBe(true);
  });
});

describe("isAllowedHostHeader (remote-access mode)", () => {
  it("accepts any host, including a missing one", () => {
    expect(isAllowedHostHeader("evil.com", true)).toBe(true);
    expect(isAllowedHostHeader(undefined, true)).toBe(true);
  });
});

describe("isAllowedOriginHeader (local-only mode)", () => {
  const local = (origin: string | undefined) => isAllowedOriginHeader(origin, false);

  it("allows an absent Origin (CLI tools, MCP subprocesses)", () => {
    expect(local(undefined)).toBe(true);
  });

  it("allows loopback origins", () => {
    expect(local("http://127.0.0.1:8787")).toBe(true);
    expect(local("http://localhost:5173")).toBe(true);
    expect(local("https://[::1]")).toBe(true);
  });

  it("rejects non-loopback origins", () => {
    expect(local("http://evil.com")).toBe(false);
    expect(local("https://attacker.example")).toBe(false);
  });

  it("rejects malformed origin values", () => {
    expect(local("not a url")).toBe(false);
  });
});

describe("isAllowedOriginHeader (remote-access mode)", () => {
  it("accepts any origin", () => {
    expect(isAllowedOriginHeader("http://evil.com", true)).toBe(true);
    expect(isAllowedOriginHeader(undefined, true)).toBe(true);
  });
});

describe("isLoopbackHostHeader", () => {
  it("detects loopback regardless of access mode", () => {
    expect(isLoopbackHostHeader("127.0.0.1:8787")).toBe(true);
    expect(isLoopbackHostHeader("localhost")).toBe(true);
  });

  it("returns false for missing or remote hosts", () => {
    expect(isLoopbackHostHeader(undefined)).toBe(false);
    expect(isLoopbackHostHeader("example.com")).toBe(false);
  });
});

describe("getRequestCorsOrigin", () => {
  it("returns null when no origin is present", () => {
    expect(getRequestCorsOrigin(undefined, false)).toBeNull();
  });

  it("echoes a loopback origin in local-only mode", () => {
    expect(getRequestCorsOrigin("http://localhost:5173", false)).toBe("http://localhost:5173");
  });

  it("suppresses a non-loopback origin in local-only mode", () => {
    expect(getRequestCorsOrigin("http://evil.com", false)).toBeNull();
  });

  it("echoes any origin in remote-access mode", () => {
    expect(getRequestCorsOrigin("http://evil.com", true)).toBe("http://evil.com");
  });
});

describe("withCors", () => {
  it("adds method and header allowances without an origin", () => {
    const headers = withCors({ "Content-Type": "application/json" }, null);
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers.Vary).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("reflects a specific origin and sets Vary: Origin when provided", () => {
    const headers = withCors({}, "http://localhost:5173");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers.Vary).toBe("Origin");
  });

  it("does not mutate the input headers object", () => {
    const input = { "X-Test": "1" };
    withCors(input, "http://localhost");
    expect(input).toEqual({ "X-Test": "1" });
  });
});

describe("readHeaderValue", () => {
  it("returns a trimmed non-empty string", () => {
    expect(readHeaderValue("  value  ")).toBe("value");
  });

  it("returns undefined for empty, whitespace, array, or missing values", () => {
    expect(readHeaderValue("")).toBeUndefined();
    expect(readHeaderValue("   ")).toBeUndefined();
    expect(readHeaderValue(["a", "b"])).toBeUndefined();
    expect(readHeaderValue(undefined)).toBeUndefined();
  });
});

describe("extractBearerToken", () => {
  it("extracts the token after the Bearer prefix", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns undefined for missing, non-bearer, or empty tokens", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken("Basic abc123")).toBeUndefined();
    expect(extractBearerToken("Bearer    ")).toBeUndefined();
  });
});
