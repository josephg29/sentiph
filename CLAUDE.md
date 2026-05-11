# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts API + web in parallel, auto-selects port from 8787)
pnpm dev

# Run all tests
pnpm test

# Run tests for a single package
pnpm --filter @octogent/api test
pnpm --filter @octogent/web test
pnpm --filter @octogent/core test

# Type-check (no emit)
pnpm --filter @octogent/api build
pnpm --filter @octogent/web build

# Full production build (web → API bundle → package assembly)
pnpm build

# Lint / format
pnpm lint
pnpm format
```

The dev script (`scripts/dev.mjs`) auto-discovers a free port starting at 8787, injects `OCTOGENT_API_PORT` and `OCTOGENT_API_ORIGIN` into the environment, and runs `@octogent/api` (tsx watch) and `@octogent/web` (vite) in parallel.

## Architecture

Octogent is a **pnpm monorepo** with three packages:

```
packages/core       — shared domain types and application logic (no runtime deps)
apps/api            — Node.js HTTP + WebSocket server (node-pty, ws)
apps/web            — React 19 SPA (Vite, xterm.js, d3-force)
```

### Core (`@octogent/core`)

Pure TypeScript domain library. Exports `TerminalSnapshot`, `buildTerminalList`, all domain types (terminal, deck, git, monitor, usage, uiState, channel, conversation). Both `api` and `web` depend on this package via workspace path — no build step needed (resolved directly to `src/index.ts`).

### API (`apps/api`)

Entry: `src/server.ts` → `createApiServer()` in `src/createApiServer.ts`.

`createApiServer` wires together:
- **`createTerminalRuntime`** (`src/terminalRuntime.ts`) — manages the terminal registry (persisted to `.octogent/state/tentacles.json`), PTY lifecycle via `createSessionRuntime`, and WebSocket broadcasting. Two WS servers: `/api/terminal-events/ws` (structural events) and per-terminal PTY streams.
- **`createApiRequestHandler`** (`src/createApiServer/requestHandler.ts`) — plain Node.js `http.IncomingMessage` router with route handler modules for terminals, deck, git, usage, monitor, code-intel, and misc (uiState).
- **`createMonitorService`** (`src/monitor/`) — background monitor feed.
- Snapshot readers for Claude and Codex usage, GitHub repo summary, code-intel store.

**Terminal lifecycle states**: `registered → running → exited | stopped | stale`. Stale = was running when the API last shut down and couldn't be reattached.

**Tentacle concept**: A tentacle is a named context container. Multiple terminals can share one `tentacleId`. Tentacle files live in `.octogent/tentacles/<tentacle-id>/` (CONTEXT.md, todo.md, etc.). Worktree terminals create an isolated git worktree under `.octogent/worktrees/<worktree-id>/` on an `octogent/<worktree-id>` branch.

**Session limit**: `OCTOGENT_MAX_TERMINAL_SESSIONS` (default 32). Creating a terminal with `initialPrompt` when at capacity throws `RuntimeInputError`.

**Agent state detection** (`src/agentStateDetection.ts`): parses PTY output to infer Claude Code's runtime state (idle, running, tool use, etc.) and broadcasts `terminal-state-changed` events.

**State directories**:
- Project-local: `.octogent/` (tentacles, worktrees, project.json)
- Global: `~/.octogent/projects/<project-id>/state/` (tentacles.json registry, transcripts, monitor cache)

### Web (`apps/web`)

Entry: `src/main.tsx` → `<App />`.

`App.tsx` is the top-level orchestrator — it owns terminal state, subscribes to the `/api/terminal-events/ws` WebSocket for live updates, and distributes props to:
- `<ConsolePrimaryNav>` — tab-based primary navigation (nav index 0–8)
- `<PrimaryViewRouter>` — renders the active view (Canvas, Deck, Activity, GitHub, Monitor, Settings, CodeIntel)
- `<ActiveAgentsSidebar>` — collapsible sidebar with agent list and action panels
- `<RuntimeStatusStrip>` — top bar with usage sparkline
- `<TelemetryTape>` — bottom monitor feed strip

**Runtime state separation**: `TerminalSnapshot` (structural, persisted to server) is kept in React state. Ephemeral agent runtime states (what Claude is doing right now) are tracked separately in `terminalRuntimeStateStore` (an in-memory ref) so they don't trigger broad re-renders.

**Key hooks**:
- `useTerminalMutations` — create/delete terminal API calls
- `usePersistedUiState` — syncs sidebar widths, active nav, minimized terminals, etc. to the API
- `useTerminalStateReconciliation` — handles lifecycle drift (stale terminals, minimized cleanup)
- `useTentacleGitLifecycle` — git status, commit, push, PR actions for worktree tentacles

**Polling hooks** (`useClaudeUsagePolling`, `useCodexUsagePolling`, `useGithubSummaryPolling`, `useUsageHeatmapPolling`) — each polls its respective `/api/usage/*` endpoint independently.

**Canvas view** (`CanvasPrimaryView`) renders an interactive d3-force graph where nodes are tentacles (OctopusNode) and sessions (SessionNode), with xterm.js terminal columns on the side.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OCTOGENT_API_PORT` | 8787 | API listen port |
| `OCTOGENT_WORKSPACE_CWD` | `process.cwd()` | Project root for tentacles and worktrees |
| `OCTOGENT_PROJECT_STATE_DIR` | `<cwd>/.octogent` | Where runtime state is persisted |
| `OCTOGENT_MAX_TERMINAL_SESSIONS` | 32 | PTY session cap |
| `OCTOGENT_ALLOW_REMOTE_ACCESS` | `0` | Set to `1` to allow non-localhost connections |
| `OCTOGENT_DEBUG_PTY_LOGS` | `0` | Set to `1` to write raw PTY output to files |
| `OCTOGENT_NO_OPEN` | unset | Set to `1` to suppress auto-opening the browser |

## Tooling

- **Biome** for linting and formatting (no ESLint, no Prettier)
- **Vitest** for unit tests across all packages
- **tsx** for API development (watch mode)
- **Vite** for web development and production build
- **pnpm workspaces** — never use `npm` or `yarn` in this repo
