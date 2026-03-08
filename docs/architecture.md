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
  - hooks (`usePersistedUiState`, `useTentacleMutations`, `useTentacleBoardInteractions`, telemetry + monitor polling hooks)
- `src/components/*` holds UI sections (sidebar, board, terminal, status strip, GitHub view, Monitor view, dialogs).
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
  - registry persistence, worktree lifecycle, PTY session runtime, git system clients, protocol/constants/ids.
- `src/codexUsage.ts`, `src/claudeUsage.ts`, and `src/githubRepoSummary.ts` provide sidebar/status telemetry snapshots.
- `src/monitor/*` isolates monitor concerns:
  - provider contracts and service orchestration (`service.ts`)
  - provider adapter implementation (`xProvider.ts`)
  - file-backed persistence (`repository.ts`)

## Runtime API surface

- `GET /api/agent-snapshots`
- `GET /api/codex/usage`
- `GET /api/claude/usage`
- `GET /api/github/summary`
- `GET /api/ui-state`
- `PATCH /api/ui-state`
- `GET /api/monitor/config`
- `PATCH /api/monitor/config`
- `GET /api/monitor/feed`
- `POST /api/monitor/refresh`
- `GET /api/conversations`
- `GET /api/conversations/:sessionId`
- `GET /api/conversations/:sessionId/export?format=json|md`
- `POST /api/tentacles` (`{ "name"?: string, "workspaceMode"?: "shared" | "worktree" }`)
- `PATCH /api/tentacles/:tentacleId` (`{ "name": string }`)
- `DELETE /api/tentacles/:tentacleId`
- `WS /api/terminals/:tentacleId/ws`

## Persistence and runtime model

- Tentacle and UI state persist in `.octogent/state/tentacles.json`.
- Conversation transcripts persist in `.octogent/state/transcripts/<sessionId>.jsonl`.
- Monitor config persists in `.octogent/state/monitor-config.json`.
- Monitor cache persists in `.octogent/state/monitor-cache.json`.
- Registry document is versioned (`version: 2`) and stores tentacles plus `uiState`.
- Startup restores tentacles from the registry; no implicit default tentacle is created.
- Tentacle terminals run as in-process PTY sessions created on websocket demand (no tmux dependency).
- Disconnecting a terminal websocket does not immediately kill the PTY; sessions remain alive through an idle grace window for reload/reconnect continuity.
- Reconnect attaches to the same PTY and receives bounded replay of recent output before live stream resumes.
- Worktree tentacles run in `.octogent/worktrees/<tentacleId>` and are created via `git worktree`.
- UI state persistence is server-backed (`GET/PATCH /api/ui-state`), not browser-local only.
- Persisted UI state includes sidebar usage footer visibility/collapse preferences for both Codex and Claude sections.
- Transcript capture is runtime-event-first (`session_start`, `input_submit`, `output_chunk`, `state_change`, `session_end`) with output normalization that strips ANSI/control sequences.
- Conversation assembly is deterministic: user turns on submit, assistant turns from processing/output, assistant finalization on `processing -> idle` or `session_end`.

## Security and transport defaults

- API binds to `127.0.0.1` by default.
- HTTP and WebSocket requests enforce loopback `Host` and `Origin` headers by default.
- Set `OCTOGENT_ALLOW_REMOTE_ACCESS=1` to disable local-only host/origin checks.
- JSON request bodies are capped at `1 MiB` (`413` when exceeded).
