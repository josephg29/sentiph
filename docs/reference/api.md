# API Reference

Sentiph exposes a local HTTP and WebSocket API.

The API has two different kinds of state:

- persisted project state, such as terminal records, UI state, and transcripts
- in-memory runtime state, such as live PTYs, attached WebSockets, scrollback, and channel queues

Most HTTP routes either read/write persisted files or create runtime records. WebSocket routes attach clients to live PTY sessions owned by the API process.

## Terminals

- `GET /api/terminal-snapshots` - returns the current terminal list and snapshot state for the UI
- `POST /api/terminals` - creates a new terminal session
- `POST /api/terminals/prune` - removes terminal records with `stale`, `stopped`, or `exited` lifecycle state
- `PATCH /api/terminals/:terminalId` - updates terminal metadata such as the display name
- `DELETE /api/terminals/:terminalId` - removes a terminal and closes its active session
- `POST /api/terminals/:terminalId/stop` - stops an active session or recorded stale process
- `POST /api/terminals/:terminalId/kill` - kills an active session or recorded stale process
- `WS /api/terminals/:terminalId/ws` - streams live terminal IO over WebSocket

Terminal snapshots include `lifecycleState` when known. Supported lifecycle states are `registered`, `running`, `stopped`, `exited`, and `stale`. Stale terminals are records that were persisted as running but could not be reattached to a live Sentiph PTY agent session after startup.

Creating a terminal registers metadata first. A PTY starts immediately only when an initial prompt is provided, a WebSocket attaches, or an internal direct listener starts the session. Worktree terminals also create their worktree before the terminal record is exposed.

## Tentacles (sessions)

- `GET /api/tentacles` - lists tentacle (session) summaries
- `POST /api/tentacles` - creates a tentacle (session) folder and `CONTEXT.md`

The POST body provides `name` and optional `description` and `tentacleId`. When
`tentacleId` is omitted, the id is a slug of the name.

## Git and worktrees

Worktree-backed sessions are addressed by tentacle id:

- `GET /api/tentacles/:tentacleId/git/status` - reads git status for a worktree-backed session
- `POST /api/tentacles/:tentacleId/git/commit` - creates a commit from the session worktree
- `POST /api/tentacles/:tentacleId/git/push` - pushes the session branch
- `POST /api/tentacles/:tentacleId/git/sync` - syncs the session worktree with its base branch
- `GET /api/tentacles/:tentacleId/git/pr` - reads pull request information for the session branch
- `POST /api/tentacles/:tentacleId/git/pr/merge` - merges the session pull request

## Prompts

- `GET /api/prompts` - lists available prompt templates
- `POST /api/prompts` - creates a user prompt
- `GET /api/prompts/:promptId` - reads one prompt
- `PUT /api/prompts/:promptId` - updates one prompt
- `DELETE /api/prompts/:promptId` - deletes one prompt

## Channels

- `GET /api/channels/:terminalId/messages` - lists messages for one terminal channel
- `POST /api/channels/:terminalId/messages` - sends a message to one terminal channel

Channel messages are queued in memory. The POST body provides `fromTerminalId` and `content`; delivery injects pending messages into the target terminal input when the target session is idle.

## Hooks

- `POST /api/hooks/:hookName` - ingests lifecycle events coming from Claude Code hooks

Current hook names:

- `session-start`
- `user-prompt-submit`
- `pre-tool-use`
- `notification`
- `stop`

## Usage and telemetry

- `GET /api/codex/usage` - returns Codex usage data when available
- `GET /api/claude/usage` - returns Claude usage data when available
- `GET /api/github/summary` - returns GitHub summary and repo telemetry data
- `GET /api/analytics/usage-heatmap?scope=all|project` - returns heatmap data from Claude session history

## UI state

- `GET /api/ui-state` - reads the persisted UI state for the current project
- `PATCH /api/ui-state` - updates the persisted UI state

## Conversations

- `GET /api/conversations` - lists stored conversations
- `DELETE /api/conversations` - deletes all stored conversations
- `GET /api/conversations/search?q=...` - searches conversations by text
- `GET /api/conversations/:sessionId` - reads one conversation in full
- `GET /api/conversations/:sessionId/export?format=json|md` - exports one conversation as JSON or Markdown

## Request limits and defaults

- JSON request bodies are capped at `1 MiB`
- invalid JSON returns `400`
- unsupported methods return `405`
- the server binds to loopback by default
