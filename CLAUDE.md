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

Octogent is a **pnpm monorepo** with four packages:

```
packages/core       — shared domain types and application logic (no runtime deps)
apps/api            — Node.js HTTP + WebSocket server (node-pty, ws)
apps/web            — React 19 SPA (Vite, xterm.js, d3-force)
apps/mobile         — Expo (React Native) iOS companion app (expo-router, expo-camera, zustand)
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

**Mobile pairing & auth** (`src/pairing.ts`, `src/createApiServer/pairingRoutes.ts`):
- A 256-bit hex token is auto-generated on first start and persisted to `<projectStateDir>/state/pairing.json`.
- When `OCTOGENT_ALLOW_REMOTE_ACCESS=1`, the server binds to `0.0.0.0` and requires `Authorization: Bearer <token>` (or `?token=<token>` query param for WebSocket upgrades) on any non-loopback request.
- Loopback requests are never auth-gated — the web UI keeps working.
- `GET /api/pair/info` (loopback-only) returns `{token, port, lanCandidates, createdAt, remoteAccessEnabled}`. `POST /api/pair/rotate` (loopback-only) regenerates the token.

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

**Pair Mobile panel** (`PairMobilePanel.tsx`) lives inside `SettingsPrimaryView` and shows a QR code (`qrcode` npm package, rendered on canvas) with `octogent://pair?host=…:…&token=…&name=Octogent`. The mobile app scans it to bootstrap a paired connection.

### Mobile (`@octogent/mobile`)

Expo SDK 54 + React Native 0.81 + React 19.1. Uses `expo-router` v6 for file-based routing, `react-native-svg` for the octopus and sparkline.

The mobile app is a full Octogent companion (not just a terminal viewer). Six bottom tabs map to the desktop's primary views: Canvas, Deck, Terminals, GitHub, Monitor, More (Activity / Code Intel / Settings).

Entry: `app/_layout.tsx` loads Monocraft via `expo-font` and hydrates the connection store, then `app/index.tsx` redirects to `(tabs)/canvas` if paired or `/pair` if not.

- **Visual identity** (`src/theme.ts`): ports the desktop's foundation tokens — light surfaces, `--term-green` `#25a244` accent, hairline borders, Monocraft mono, uppercase chrome. Terminal output area keeps the dark `--terminal-bg` `#111`.
- **Octopus** (`src/components/octopus/`): pixel-perfect port of `EmptyOctopus.tsx`. Sprite grids (`octopusSprites.ts`) are copied verbatim; `Octopus.tsx` renders them via `react-native-svg` `<Rect>` cells with `setInterval`-driven frame swaps. All five expressions, six animations (idle/sway/walk/jog/swim-up/bounce/float), five accessories (none/long/mohawk/side-sweep/curly), and the ZZZ overlay are supported. `deriveOctopusVisuals.ts` mirrors the web's seeded RNG so a given `tentacleId` always renders the same octopus on web and mobile.
- **State** (`src/state/`): `useConnectionStore` persists `{host, port, token, name, pairedAt}` in `expo-secure-store`. `useTerminalsStore` keeps snapshots + per-terminal runtime state. `useActivityStore` records terminal lifecycle events for the Activity tab. `useUsageStore` + `useUsagePolling()` poll `/api/claude/usage`, `/api/codex/usage`, `/api/github/summary` on intervals.
- **API** (`src/api/`): `client.ts` (terminals REST), `deck.ts` (tentacles + todos + vault), `misc.ts` (usage, github, monitor, code-intel, tentacle git), `eventsSocket.ts` (`/api/terminal-events/ws`), `ptySocket.ts` (per-terminal PTY). Bearer-token auth on REST, `?token=` on WS.
- **Terminal rendering** (`src/components/terminal-webview/`): xterm.js inside `react-native-webview`. `scripts/vendor-xterm.mjs` reads xterm.js + xterm.css + addon-fit out of the workspace's `node_modules` and inlines them as escaped strings into `xtermVendor.ts`. `xtermHost.ts` builds the bootstrap HTML; `TerminalWebView.tsx` exposes a ref API (`write`, `history`, `clear`, `fit`, `scrollToBottom`). PTY output flows in via `injectJavaScript`; no ANSI parsing on the RN side, so cursor moves / alt-screen / sticky footers / boxes render correctly. The fallback ANSI parser in `src/utils/ansi.ts` is unused by screens but retained for tests and potential reuse.
- **Shared components** (`src/components/`): `Card`, `Button`, `StatusBadge` + `AgentStateBadge`, `ConnectionBanner`, `Octopus`, `OctopusTile`, `TentaclePodCard`, `TerminalRow`, `TerminalInputBar`, `Sparkline`, `MarkdownLite` (small markdown renderer for vault file previews), `RuntimeStatusStrip`, `TabsTopBar`, `ActiveAgentsSheet` (bottom-sheet modal with quick replies for every running terminal).

The `(tabs)/_layout.tsx` mounts `useUsagePolling()` and renders a persistent `<TabsTopBar />` above the tab content with the runtime status strip and the "ACTIVE AGENTS" sheet trigger.

The tentacle detail screen (`app/tentacle/[id].tsx`) is the heart of the deck experience: vault file picker with `MarkdownLite` preview, todos (toggle/edit/delete/add), suggested-skill chips, attached terminals list, and a worktree git lifecycle section (commit message → commit → push → open PR via the `/api/tentacles/{id}/git/*` endpoints).

Targets iOS only via Expo. Install on a real device with Expo Go (Metro QR) for dev or EAS Build for a standalone `.ipa`.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OCTOGENT_API_PORT` | 8787 | API listen port |
| `OCTOGENT_WORKSPACE_CWD` | `process.cwd()` | Project root for tentacles and worktrees |
| `OCTOGENT_PROJECT_STATE_DIR` | `<cwd>/.octogent` | Where runtime state is persisted |
| `OCTOGENT_MAX_TERMINAL_SESSIONS` | 32 | PTY session cap |
| `OCTOGENT_ALLOW_REMOTE_ACCESS` | `0` | Set to `1` to allow non-localhost connections |
| `OCTOGENT_BYPASS_PERMISSIONS` | `1` | Set to `0` to launch Claude Code without `--dangerously-skip-permissions` (Claude will prompt for each tool call) |
| `OCTOGENT_DEBUG_PTY_LOGS` | `0` | Set to `1` to write raw PTY output to files |
| `OCTOGENT_NO_OPEN` | unset | Set to `1` to suppress auto-opening the browser |
| `HOST` | `127.0.0.1` (or `0.0.0.0` when `OCTOGENT_ALLOW_REMOTE_ACCESS=1`) | Listen interface override |

## Tooling

- **Biome** for linting and formatting (no ESLint, no Prettier)
- **Vitest** for unit tests across all packages
- **tsx** for API development (watch mode)
- **Vite** for web development and production build
- **pnpm workspaces** — never use `npm` or `yarn` in this repo
