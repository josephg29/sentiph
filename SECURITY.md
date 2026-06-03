# Security Policy

## Threat model

Sentiph is a **local-first developer tool**. The API server binds to the loopback
interface (`127.0.0.1`) by default and is not intended to be exposed to untrusted
networks. Its security posture is built around that assumption:

- **Loopback binding by default** — the HTTP/WebSocket server listens on
  `127.0.0.1`. Remote exposure requires an explicit opt-in.
- **Host-header gating** — requests whose `Host` header does not resolve to a
  loopback address are rejected, defending against DNS-rebinding attacks where a
  remote page targets `localhost`.
- **Origin-header gating** — browser requests must carry a loopback `Origin`;
  non-browser clients (CLI tools, the MCP subprocess) that omit `Origin` are
  permitted because the Host check already gates them.
- **Scoped CORS** — `Access-Control-Allow-Origin` reflects only the specific
  allowed origin and sets `Vary: Origin`, never a blanket `*`.

These checks live in [`apps/api/src/createApiServer/security.ts`](apps/api/src/createApiServer/security.ts)
and are covered by [`apps/api/tests/security.test.ts`](apps/api/tests/security.test.ts).

When remote access is explicitly enabled, the operator is responsible for placing
Sentiph behind their own authentication and transport security (e.g. an
authenticating reverse proxy or tunnel).

## Supported versions

This project is pre-1.0. Security fixes are applied to the `main` branch and the
latest published release.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public
issue:

- Use GitHub's **"Report a vulnerability"** flow under the repository's
  **Security** tab (private advisory).

Include a description, reproduction steps, and the affected version or commit.
You can expect an initial acknowledgement within a few business days. Please give
us a reasonable window to ship a fix before any public disclosure.

## Dependency hygiene

- CI runs `pnpm audit --audit-level high` and fails on high/critical advisories.
- Transitive versions are pinned via `pnpm.overrides` in `package.json` where a
  patched release is needed ahead of upstream.
