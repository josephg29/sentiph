# Octogent

Octogent is a web-first command surface for running and coordinating multiple coding agents in parallel.

This repository is currently a scratch baseline built with:

- TypeScript + Node.js 22+
- pnpm workspace
- Vite + React frontend
- ports-and-adapters core package
- Vitest and Biome

Current UI baseline includes:

- a left dashboard deck for `Active Agents`
- tentacle-grouped agent listings in that deck
- keyboard/mouse-resizable and toggleable sidebar behavior
- top-bar `+ Main Tentacle` and `+ Worktree Tentacle` creation actions
- immediate inline naming after tentacle creation
- in-place tentacle rename from each column header (stable id + editable name)
- tentacle delete action from each column header
- tentacle minimize from header and maximize from the `Active Agents` sidebar
- minimum-width tentacle columns with horizontal scrolling when space is constrained
- draggable tentacle splitters that resize adjacent panes
- `[4] Monitor` tab for X topic monitoring (credentials, usage/cap metrics, top posts)

## Quickstart

```bash
pnpm install
pnpm start
```

Open `http://localhost:5173`.

In dev mode:

- `pnpm dev` auto-selects an available API port (starting at `8787`) and injects it into both apps.
- `apps/web` may auto-select a free Vite port (`5173`, `5174`, `5175`, ...), and still proxies `/api` and terminal websocket traffic to the selected API port.
- `apps/api` runs tentacle terminals as native PTY processes via `node-pty` (no `tmux` dependency).
- Isolated worktree tentacles require `git` and a git repository at the workspace root.
- Optional: X developer bearer token/API credentials for Monitor data.
- Runtime endpoints:
  - `GET /api/agent-snapshots`
  - `GET /api/monitor/config`
  - `PATCH /api/monitor/config`
  - `GET /api/monitor/feed`
  - `POST /api/monitor/refresh`
  - `POST /api/tentacles` (`{ "name"?: string, "workspaceMode"?: "shared" | "worktree" }`)
  - `PATCH /api/tentacles/:tentacleId` (`{ "name": string }`)
  - `DELETE /api/tentacles/:tentacleId`
  - `WS /api/terminals/:tentacleId/ws`

Set `VITE_OCTOGENT_API_ORIGIN` to route runtime calls directly to an external backend.

## Common workflows

```bash
pnpm test
pnpm lint
pnpm build
pnpm format
```

GitHub Actions runs the same `lint`, `test`, and `build` checks on pushes to `main` and on pull requests.

## Repo layout

- `apps/web` - web UI shell
- `apps/api` - runtime API service with PTY-backed tentacle terminals
- `packages/core` - application/domain/ports/adapters core logic
- `docs` - contributor and architecture documentation
- `context` - long-term project context and decisions
