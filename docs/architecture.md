# Architecture Overview

Octogent is a pnpm monorepo with three runtime layers:

- `apps/web` - Vite + React operator UI
- `apps/api` - HTTP/WS runtime service for tentacles and telemetry
- `packages/core` - framework-agnostic domain/application logic

## Core boundaries

- Domain model lives in `packages/core/src/domain`.
- Application logic lives in `packages/core/src/application` (currently `buildTentacleColumns`).
- Boundary interfaces live in `packages/core/src/ports`.
- Test/local adapters live in `packages/core/src/adapters`.

The web and API apps both depend on `@octogent/core`.

## Frontend structure (`apps/web`)

- `src/App.tsx` is orchestration-only: state wiring, polling hooks, and page-level composition.
- `src/app/*` holds pure app logic:
  - `constants.ts`, `types.ts`, `normalizers.ts`, `githubMetrics.ts`
  - hooks (`usePersistedUiState`, `useTentacleMutations`, `useTentacleBoardInteractions`, polling hooks)
- `src/components/*` holds UI sections (sidebar, board, terminal, status strip, GitHub view, dialogs).
- `src/components/ui/*` holds reusable primitives (`ActionButton`, `StatusBadge`).
- `src/runtime/*` holds runtime adapters and endpoint builders.
- `src/styles.css` is an import manifest for modular style files in `src/styles/*`.

## API structure (`apps/api`)

- `src/createApiServer.ts` is orchestration-only.
- `src/createApiServer/*` isolates request concerns:
  - `requestHandler.ts` (route dispatch)
  - `requestParsers.ts` (JSON/body parsing and validation)
  - `security.ts` (host/origin/CORS rules)
  - `upgradeHandler.ts` (WebSocket upgrade gate)
- `src/terminalRuntime.ts` is orchestration-only for tentacle lifecycle and state.
- `src/terminalRuntime/*` isolates runtime concerns:
  - registry persistence, worktree lifecycle, session runtime, tmux/git system clients, protocol/constants/ids.
- `src/codexUsage.ts` and `src/githubRepoSummary.ts` provide sidebar/status telemetry snapshots.

## Runtime API surface

- `GET /api/agent-snapshots`
- `GET /api/codex/usage`
- `GET /api/github/summary`
- `GET /api/ui-state`
- `PATCH /api/ui-state`
- `POST /api/tentacles` (`{ "name"?: string, "workspaceMode"?: "shared" | "worktree" }`)
- `PATCH /api/tentacles/:tentacleId` (`{ "name": string }`)
- `DELETE /api/tentacles/:tentacleId`
- `WS /api/terminals/:tentacleId/ws`

## Persistence and runtime model

- Tentacle and UI state persist in `.octogent/state/tentacles.json`.
- Registry document is versioned (`version: 2`) and stores tentacles plus `uiState`.
- Startup restores tentacles from the registry; no implicit default tentacle is created.
- Tentacles map to stable tmux sessions: `octogent_<tentacleId>`.
- Worktree tentacles run in `.octogent/worktrees/<tentacleId>` and are created via `git worktree`.
- UI state persistence is server-backed (`GET/PATCH /api/ui-state`), not browser-local only.

## Security and transport defaults

- API binds to `127.0.0.1` by default.
- HTTP and WebSocket requests enforce loopback `Host` and `Origin` headers by default.
- Set `OCTOGENT_ALLOW_REMOTE_ACCESS=1` to disable local-only host/origin checks.
- JSON request bodies are capped at `1 MiB` (`413` when exceeded).
