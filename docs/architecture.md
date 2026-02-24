# Architecture Overview

Octogent is organized with a ports-and-adapters approach.

## Layers

- Domain and application logic live in `packages/core/src/domain` and `packages/core/src/application`.
- System boundaries are expressed as interfaces in `packages/core/src/ports`.
- Concrete implementations for tests/local execution live in `packages/core/src/adapters`.
- API runtime service in `apps/api` handles HTTP/WS transport and runtime orchestration (`node-pty` sessions).
- UI in `apps/web` consumes use-cases from `@octogent/core` and calls runtime APIs through dedicated adapters.

## Current scratch scope

- One use-case: `buildTentacleColumns`
- One adapter: `InMemoryAgentSnapshotReader`
- One runtime HTTP adapter in `apps/web/src/runtime/HttpAgentSnapshotReader.ts` that loads snapshots from API and validates payload shape
- One React shell rendering tentacle columns with per-tentacle full-height terminals (`xterm`) plus a grouped active-agent sidebar
- One API service in `apps/api` exposing:
  - `GET /api/agent-snapshots` (dev snapshots)
  - `WS /api/terminals/:tentacleId/ws` (interactive shell stream via `node-pty`)
- Shared runtime endpoint builders in `apps/web/src/runtime/runtimeEndpoints.ts` with optional `VITE_OCTOGENT_API_ORIGIN` override for external backends
- Vite dev proxy in `apps/web/vite.config.ts` forwards `/api` traffic to `apps/api`
