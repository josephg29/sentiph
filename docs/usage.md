# Usage Guide

## Run local app

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:5173`.

`pnpm dev` starts both the web app and API service. The dev runner auto-selects an available API port starting from `127.0.0.1:8787` and passes it to the web proxy automatically.

## Prerequisites and optional integrations

- Node.js `22+`
- `git` for worktree tentacles
- Optional: `gh` CLI (`gh auth login`) for live GitHub telemetry
- Optional: Codex auth at `~/.codex/auth.json` or `CODEX_HOME/auth.json` for usage bars
- Optional: Claude auth at `~/.claude/.credentials.json` for Claude Code usage bars

## Active Agents dashboard deck

- The web UI uses a persistent 5-zone terminal shell:
  - red top header (`product`, `context | page` breadcrumb, `LIVE`, tentacle actions)
  - runtime/status strip (active context, utilization metric, dummy delta, compact telemetry stats, sparkline)
  - blue numbered nav bar (`[0]`..`[4]`)
  - main canvas (context input + sidebar + tentacle board)
  - bottom telemetry tape (compact stream of engineering dummy metrics)
- Keyboard shortcuts in shell:
  - press `0`..`4` to switch primary nav section
  - press `/` to focus the context input
- The left sidebar shows `Active Agents` grouped by tentacle.
- Each tentacle section lists its current agents and state badges.
- Show/hide from the top bar sidebar icon toggle button.
- Resize on desktop by dragging the sidebar right border.
- The `Active Agents` sidebar footer includes retro terminal-style usage sections that refresh every 1 minute:
  - Codex token usage (`5h`, `week`, `credits`)
  - Claude Code token usage (`5h`, `week`, optional `sonnet`)
- In `[3] Settings`, usage telemetry visibility switches let you show/hide the Codex and Claude footer sections independently.
- Codex usage is sourced from local Codex OAuth credentials (`~/.codex/auth.json` or `CODEX_HOME/auth.json`) through `GET /api/codex/usage`.
- Claude usage is sourced from local Claude OAuth credentials (`~/.claude/.credentials.json`) through `GET /api/claude/usage` and requires the `user:profile` scope.
- If Claude OAuth usage is rate limited by Anthropic (`HTTP 429`), the UI degrades to an unavailable state instead of hard error.
- Usage sections surface backend `message` text for unavailable/error states when provided.
- Sidebar visibility/width, section collapse state, minimized tentacles, and pane widths are persisted through `GET/PATCH /api/ui-state` in `.octogent/state/tentacles.json`.

## Create tentacles

- Use the top bar `+ Main Tentacle` button for a shared workspace tentacle.
- Use the top bar `+ Worktree Tentacle` button for a tentacle in `.octogent/worktrees/<tentacleId>`.
- Fresh workspaces start with no tentacles; create the first tentacle from the top bar.
- Tentacles keep unique incremental ids (`tentacle-1`, `tentacle-2`, ...) for internal routing, plus a separate display name you can edit.
- New tentacles appear with the default name selected inline so you can type a new name immediately.
- Rename by clicking a tentacle header name or the right-side `Rename` button, then edit inline (`Enter` to save, `Escape` to cancel).
- Minimize from the right-side `Minimize` button in the tentacle header.
- Maximize minimized tentacles from `Maximize` buttons in the `Active Agents` sidebar.
- Delete from the right-side `Delete` button in the tentacle header (with an in-app confirmation dialog).
- Each new tentacle starts with an initial coding terminal session bootstrapped with `codex`.
- Each terminal header includes compact add icons (`>_↑` and `>_↓`) to spawn another terminal in the same tentacle column above/below that terminal.
- Terminal headers include a trash-icon delete control and every visible terminal is deletable.
- Empty tentacles show a `New Terminal` button in the terminal area to start the first terminal session.
- Child terminal agent order is persisted, so stacked terminal placement survives refreshes and API restarts.
- Isolated worktree tentacles require `git` and a git repository at the workspace root.
- Tentacle metadata persists across API restarts in `.octogent/state/tentacles.json`.
- Terminal processes are PTY sessions managed by the API process (no `tmux`).
- Reload/reconnect reattaches to the existing live PTY session and replays recent scrollback.
- PTY sessions still do not survive API process restarts.
- Durable conversation history is persisted separately from PTY scrollback in `.octogent/state/transcripts/<sessionId>.jsonl` and survives reconnect/restart.
- The board keeps each tentacle column above a minimum width and scrolls horizontally when columns exceed available space.
- Resize neighboring tentacles with the divider between columns (drag with pointer or use focused divider with arrow keys).

## GitHub telemetry

- The runtime status strip and `[1] GitHub` section read from `GET /api/github/summary`.
- The web app auto-refreshes GitHub summary every 60 seconds.
- The GitHub Overview page also provides a manual `Refresh` action.
- If `gh` is unavailable or unauthenticated, UI falls back to an unavailable/error snapshot.

## X monitor

- Open `[2] Monitor` to configure and view social monitoring.
- Monitor has two subtabs:
  - `Resources` for status, usage budget, and ranked posts.
  - `Configure` for X credentials and query-term management.
- Query terms are edited as add/remove chips in memory and persisted with `Save Terms`.
- Max returned post count is configurable from Monitor `Configure` and persisted in monitor config.
- Search timeframe is configurable to `7D`, `3D`, or `1D` from Monitor `Configure`; default is `7D`.
- Save your X bearer token from the `X Connection` panel.
- New workspaces start with no monitor query terms. Add and save terms before expecting feed results.
- Backend runs separate X recent-search requests per configured query term for the configured timeframe, filters retweets, then ranks posts locally by `likeCount`.
- Feed is trimmed to configured max-post count and cached.
- `GET /api/monitor/feed` auto-refreshes when cache age exceeds 24 hours.
- Use the Monitor `Refresh` action for a forced manual refresh (`POST /api/monitor/refresh`).
- Usage metrics in Monitor come from X API usage/cap endpoints (cap, used, remaining, reset), not wallet billing balance.

## Conversations

- Open `[4] Conversations` to review durable coding-agent conversation history per session.
- Session list is loaded from `GET /api/conversations`.
- Full conversation details are loaded from `GET /api/conversations/:sessionId`.
- Export actions are available from the Conversations view:
  - JSON export: `GET /api/conversations/:sessionId/export?format=json`
  - Markdown export: `GET /api/conversations/:sessionId/export?format=md`
- Conversation turns are assembled from transcript events (submit/output/state transitions), not terminal ANSI rendering.

## Run quality checks

```bash
pnpm test
pnpm lint
pnpm build
```
