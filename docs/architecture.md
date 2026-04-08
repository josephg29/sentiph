# Architecture Overview

Octogent is a pnpm monorepo with three runtime layers:

- `apps/web` - Vite + React operator UI
- `apps/api` - HTTP/WS runtime service for tentacles and telemetry
- `packages/core` - framework-agnostic domain/application logic

## Core boundaries

- Domain model lives in `packages/core/src/domain`.
- Application logic lives in `packages/core/src/application` (currently `buildTerminalList`).
- Boundary interfaces live in `packages/core/src/ports`.
- Test/local adapters live in `packages/core/src/adapters`.

The web and API apps both depend on `@octogent/core`.

## Frontend structure (`apps/web`)

- `src/App.tsx` is orchestration-only: state wiring, polling hooks, and page-level composition.
- `src/app/*` holds pure app logic:
  - `constants.ts`, `types.ts`, `normalizers.ts`, `githubMetrics.ts`
  - hooks (`usePersistedUiState`, `useTerminalMutations`, `useTerminalBoardInteractions`, telemetry + monitor polling hooks)
- `src/components/*` holds UI sections organized by feature:
  - `PrimaryViewRouter.tsx` dispatches the active nav section to the correct primary view.
  - sidebar, board, terminal, status strip, GitHub view, dialogs.
  - `canvas/` — Interactive graph view showing tentacles and sessions as draggable nodes with terminal panels.
  - `deck/` — Agent management dashboard (`TentaclePod`, `AddTentacleForm`, `ActionCards`, `DeckBottomActions`, `octopusVisuals`).
  - `MonitorPrimaryView` — X (Twitter) social monitoring.
  - `ConversationsPrimaryView` — Durable conversation history viewer.
  - `PromptsPrimaryView` — Prompt library browser and editor.
  - `CodeIntelPrimaryView` — Code intelligence event viewer.
  - `ActivityPrimaryView` — Usage activity and heatmap view.
  - `SettingsPrimaryView` — Workspace settings and visibility toggles.
- `src/components/ui/*` holds reusable primitives (`ActionButton`, `StatusBadge`).
- `src/runtime/*` holds runtime adapters and endpoint builders.
- `src/styles.css` is an import manifest for modular style files in `src/styles/*`.

### Primary navigation sections

The top nav bar provides eight numbered sections:
1. **Agents** — Canvas graph view (default) with interactive terminal columns.
2. **Deck** — Agent management dashboard for creating, configuring, and swarming tentacles.
3. **Activity** — Usage activity and heatmap visualization.
4. **Code Intel** — Code intelligence event log (which tools accessed which files).
5. **Monitor** — X (Twitter) social monitoring and feed.
6. **Conversations** — Durable conversation history viewer with search and export.
7. **Prompts** — Prompt library browser and editor (core + user prompts).
8. **Settings** — Workspace settings and visibility toggles.

## API structure (`apps/api`)

- `src/createApiServer.ts` is orchestration-only.
- `src/createApiServer/*` isolates request concerns:
  - `requestHandler.ts` (route dispatch)
  - `requestParsers.ts` (JSON/body parsing and validation)
  - `security.ts` (host/origin/CORS rules)
  - `upgradeHandler.ts` (WebSocket upgrade gate)
- `src/terminalRuntime.ts` is orchestration-only for tentacle lifecycle and state.
- `src/terminalRuntime/*` isolates runtime concerns:
  - registry persistence, worktree lifecycle, PTY session runtime, git system clients, protocol/constants/ids, channel messaging.
- `src/codexUsage.ts`, `src/claudeUsage.ts`, and `src/githubRepoSummary.ts` provide sidebar/status telemetry snapshots.
- `src/claudeSessionScanner.ts` scans Claude session logs for usage heatmap data.
- `src/codeIntelStore.ts` provides append-only event logging for code intelligence tracking.
- `src/deck/*` manages deck tentacle state (`readDeckTentacles.ts`): CRUD, todo item management, vault file access.
- `src/prompts/*` manages prompt template resolution, listing, and user prompt CRUD.
- `src/monitor/*` isolates monitor concerns:
  - provider contracts and service orchestration (`service.ts`)
  - provider adapter implementation (`xProvider.ts`)
  - file-backed persistence (`repository.ts`)
- `src/createApiServer/deckRoutes.ts` handles deck tentacle CRUD, todo management, vault files, and swarm execution.
- `src/createApiServer/miscRoutes.ts` handles prompt library, channel messaging, hook ingestion, and UI state routes.

## Runtime API surface

### Terminals & snapshots
- `GET /api/terminal-snapshots`
- `POST /api/terminals` (`{ "workspaceMode"?: "shared" | "worktree", "agentProvider"?: string }`)
- `PATCH /api/terminals/:terminalId` (`{ "name": string }`)
- `DELETE /api/terminals/:terminalId`
- `WS /api/terminals/:terminalId/ws`

### Git (worktree tentacles)
- `GET /api/tentacles/:tentacleId/git/status`
- `POST /api/tentacles/:tentacleId/git/commit`
- `POST /api/tentacles/:tentacleId/git/push`
- `POST /api/tentacles/:tentacleId/git/sync`
- `GET /api/tentacles/:tentacleId/git/pr`
- `POST /api/tentacles/:tentacleId/git/pr/merge`

### Deck (agent management & swarm)
- `GET /api/deck/tentacles`
- `POST /api/deck/tentacles` (`{ "name", "description", "color", "octopus" }`)
- `DELETE /api/deck/tentacles/:tentacleId`
- `POST /api/deck/tentacles/:tentacleId/todo` (add item)
- `PATCH /api/deck/tentacles/:tentacleId/todo/toggle`
- `PATCH /api/deck/tentacles/:tentacleId/todo/edit`
- `POST /api/deck/tentacles/:tentacleId/todo/delete`
- `GET /api/deck/tentacles/:tentacleId/files/:filename` (vault file)
- `POST /api/deck/tentacles/:tentacleId/swarm` (spawn parallel agents from incomplete todos)

### Prompts (library)
- `GET /api/prompts`
- `POST /api/prompts` (`{ "name", "content" }`)
- `GET /api/prompts/:promptId`
- `PUT /api/prompts/:promptId`
- `DELETE /api/prompts/:promptId`

### Channels (inter-agent messaging)
- `GET /api/channels/:terminalId/messages`
- `POST /api/channels/:terminalId/messages` (`{ "fromTerminalId", "content" }`)

### Code intelligence
- `POST /api/code-intel/events` (record tool access)
- `GET /api/code-intel/events`

### Hooks (agent lifecycle)
- `POST /api/hooks/:hookName` (session-start, user-prompt-submit, pre-tool-use, notification, stop)

### Usage & telemetry
- `GET /api/codex/usage`
- `GET /api/claude/usage`
- `GET /api/github/summary`
- `GET /api/analytics/usage-heatmap?scope=all|project`

### UI state
- `GET /api/ui-state`
- `PATCH /api/ui-state`

### Monitor
- `GET /api/monitor/config`
- `PATCH /api/monitor/config`
- `GET /api/monitor/feed`
- `POST /api/monitor/refresh`

### Conversations
- `GET /api/conversations`
- `DELETE /api/conversations` (delete all)
- `GET /api/conversations/search?q=...`
- `GET /api/conversations/:sessionId`
- `GET /api/conversations/:sessionId/export?format=json|md`

## Persistence and runtime model

- Tentacle and UI state persist in `.octogent/state/tentacles.json`.
- Deck tentacle state persists in `.octogent/state/deck.json`.
- Conversation transcripts persist in `.octogent/state/transcripts/<sessionId>.jsonl`.
- Monitor config persists in `.octogent/state/monitor-config.json`.
- Monitor cache persists in `.octogent/state/monitor-cache.json`.
- Code intelligence events persist in `.octogent/state/code-intel.jsonl`.
- Prompts: core prompts synced from `prompts/` to `.octogent/prompts/core/` on startup; user prompts stored in `.octogent/prompts/`.
- Registry document is versioned (`version: 3`, auto-migrates from v2) and stores terminals plus `uiState`.
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
