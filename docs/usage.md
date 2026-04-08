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

## Web UI shell layout

The web UI uses a persistent shell with these zones:
- Red top header (`product`, `context | page` breadcrumb, `LIVE`, tentacle actions)
- Runtime/status strip (active context, utilization metric, compact telemetry stats, sparkline)
- Numbered nav bar with eight sections:
  1. **Agents** — Canvas graph view (default)
  2. **Deck** — Agent management dashboard
  3. **Activity** — Usage activity and heatmap
  4. **Code Intel** — Code intelligence event log
  5. **Monitor** — X (Twitter) social monitoring
  6. **Conversations** — Conversation history with search
  7. **Prompts** — Prompt library browser/editor
  8. **Settings** — Workspace settings and toggles
- Main canvas (sidebar + active primary view)
- Bottom telemetry tape

### Sidebar

- The left sidebar shows `Active Agents` listing each terminal individually.
- Each terminal section shows its label and state badge.
- Show/hide from the top bar sidebar icon toggle button.
- Resize on desktop by dragging the sidebar right border.
- The sidebar footer includes retro terminal-style usage sections that refresh every 1 minute:
  - Codex token usage (`5h`, `week`, `credits`)
  - Claude token usage (`5h`, `week`, optional `sonnet`)
- In **Settings**, usage telemetry visibility switches let you show/hide the Codex and Claude footer sections independently.
- Codex usage is sourced from local Codex OAuth credentials (`~/.codex/auth.json` or `CODEX_HOME/auth.json`) through `GET /api/codex/usage`.
- Claude usage is sourced from local Claude OAuth credentials (`~/.claude/.credentials.json`) through `GET /api/claude/usage` and requires the `user:profile` scope.
- If Claude OAuth usage is rate limited by Anthropic (`HTTP 429`), the UI degrades to an unavailable state instead of hard error.
- Usage sections surface backend `message` text for unavailable/error states when provided.
- Sidebar visibility/width, section collapse state, minimized terminals, and pane widths are persisted through `GET/PATCH /api/ui-state` in `.octogent/state/tentacles.json`.

## Create terminals

- Use the top bar `+ Main Tentacle` button for a shared-workspace terminal.
- Use the top bar `+ Worktree Tentacle` button for a terminal in an isolated `.octogent/worktrees/<tentacleId>` worktree.
- Fresh workspaces start with no terminals; create the first one from the top bar.
- Each terminal is a single visual column. A tentacle is a conceptual context/folder that multiple terminals can reference.
- Terminals keep unique incremental ids for internal routing, plus a separate display name you can edit.
- New terminals appear with the default name selected inline so you can type a new name immediately.
- Rename by clicking a terminal header name or the right-side `Rename` button, then edit inline (`Enter` to save, `Escape` to cancel).
- Minimize from the right-side `Minimize` button in the terminal header.
- Maximize minimized terminals from `Maximize` buttons in the `Active Agents` sidebar.
- Delete from the right-side `Delete` button in the terminal header (with an in-app confirmation dialog).
- Isolated worktree terminals require `git` and a git repository at the workspace root.
- Terminal metadata persists across API restarts in `.octogent/state/tentacles.json`.
- Terminal processes are PTY sessions managed by the API process (no `tmux`).
- Reload/reconnect reattaches to the existing live PTY session and replays recent scrollback.
- PTY sessions still do not survive API process restarts.
- Durable conversation history is persisted separately from PTY scrollback in `.octogent/state/transcripts/<sessionId>.jsonl` and survives reconnect/restart.
- The canvas view keeps each terminal column above a minimum width and scrolls horizontally when columns exceed available space.
- Resize neighboring terminals with the divider between columns (drag with pointer or use focused divider with arrow keys).

## Canvas view (Agents)

- The default **Agents** view renders an interactive canvas graph.
- Tentacles and sessions appear as draggable nodes with connections.
- Terminal panels can be opened inline within the canvas for direct interaction.

## Deck (agent management)

- Open **Deck** to manage tentacle agents in a dashboard view.
- Create new tentacles with a name, description, color, and octopus visual customization (animation, expression, accessory, hair color).
- Each tentacle pod shows its todo list parsed from the tentacle's `todo.md` vault file.
- Manage todo items inline: add, edit, toggle done/undone, delete.
- **Swarm execution**: launch parallel agents from a tentacle's incomplete todo items. The swarm spawns one worker terminal per todo item, optionally with a parent coordinator when multiple items are selected.
- Workers can run in `shared` (main workspace) or `worktree` (isolated branch) mode.
- Deck state persists in `.octogent/state/deck.json`.

## Activity

- Open **Activity** to view Claude usage heatmaps.
- Heatmap data is scanned from Claude session logs via `GET /api/analytics/usage-heatmap`.
- Supports `all` and `project` scope.

## Code Intel

- Open **Code Intel** to view which tools accessed which files during agent sessions.
- Events are logged via `POST /api/code-intel/events` (typically from Claude Code hooks).
- Event log is stored in `.octogent/state/code-intel.jsonl`.

## Prompts (library)

- Open **Prompts** to browse, create, edit, and delete prompt templates.
- Core prompts are synced from the repository `prompts/` directory to `.octogent/prompts/core/` on server startup.
- User-created prompts are stored in `.octogent/prompts/` and can be managed via the UI or API.
- Prompts support `{{variable}}` interpolation syntax.

## GitHub telemetry

- The runtime status strip reads from `GET /api/github/summary`.
- The web app auto-refreshes GitHub summary every 60 seconds.
- The GitHub Overview page also provides a manual `Refresh` action.
- If `gh` is unavailable or unauthenticated, UI falls back to an unavailable/error snapshot.

## X monitor

- Open **Monitor** to configure and view social monitoring.
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

- Open **Conversations** to review durable coding-agent conversation history per session.
- Session list is loaded from `GET /api/conversations`.
- Search conversations with `GET /api/conversations/search?q=...`.
- Full conversation details are loaded from `GET /api/conversations/:sessionId`.
- Export actions are available from the Conversations view:
  - JSON export: `GET /api/conversations/:sessionId/export?format=json`
  - Markdown export: `GET /api/conversations/:sessionId/export?format=md`
- Delete all conversation sessions with `DELETE /api/conversations`.
- Conversation turns are assembled from transcript events (submit/output/state transitions), not terminal ANSI rendering.

## Run quality checks

```bash
pnpm test
pnpm lint
pnpm build
```
