# Operations Notes

## Troubleshooting

- If `pnpm test` fails with missing browser APIs, ensure the `jsdom` dependency is installed.
- If workspace package resolution fails, run `pnpm install` from the repository root (not inside a subpackage).
- If Node version is older than 22, switch runtime before running commands.
- If terminal startup fails, verify your shell environment (`$SHELL` or `/bin/bash`) is available and executable.
- If worktree tentacle creation fails, verify:
  - `git --version` works
  - workspace root is a git repository (`git rev-parse --is-inside-work-tree`)
- If GitHub telemetry is unavailable, verify `gh auth status`.
- If Monitor refresh fails with auth errors, verify your X bearer token and API app access.
- If Monitor usage metrics are unavailable, verify X API usage endpoints are enabled for your plan.

## Quality gates

- CI workflow: `.github/workflows/ci.yml`
- Triggered on push to `main` and on pull requests.
- Runs `pnpm lint`, `pnpm test`, and `pnpm build`.

## Runtime persistence notes

- Tentacle metadata is persisted at `.octogent/state/tentacles.json`.
- Frontend UI preference state is persisted in the same registry under `uiState`.
- Monitor config is persisted at `.octogent/state/monitor-config.json`.
- Monitor feed cache is persisted at `.octogent/state/monitor-cache.json`.
- Deck tentacle state is persisted at `.octogent/state/deck.json`.
- Code intelligence events are persisted at `.octogent/state/code-intel.jsonl`.
- Core prompts are synced from `prompts/` to `.octogent/prompts/core/` on server startup.
- User-created prompts are persisted at `.octogent/prompts/`.
- Runtime restores tentacles from that registry on startup and does not auto-create a default tentacle.
- Runtime restores UI state from that registry on startup and serves it via `GET /api/ui-state`.
- Runtime serves monitor config/feed from monitor state files via `GET/PATCH /api/monitor/config`, `GET /api/monitor/feed`, and `POST /api/monitor/refresh`.
- Each terminal maps to an in-process PTY session when a terminal websocket is connected.
- Session disconnects enter an idle grace window (`5 minutes` by default) so browser reloads can reconnect without killing the PTY.
- Reconnected websockets receive bounded server-side scrollback replay (up to `512 KiB` by default) before live output resumes.
- `workspaceMode: "shared"` tentacles run in the main workspace root.
- `workspaceMode: "worktree"` tentacles run in `.octogent/worktrees/<tentacleId>`.
- PTY sessions do not persist across API restarts.
- `DELETE /api/terminals/:terminalId` removes registry state and closes any active PTY session for that terminal.
- Deleting a worktree tentacle removes both its worktree directory (`git worktree remove --force`) and its tentacle branch (`git branch -D octogent/<tentacleId>`).
- `PATCH /api/ui-state` updates and persists frontend UI preferences.

## Local security defaults

- API defaults to `HOST=127.0.0.1`.
- HTTP and WebSocket requests are restricted to loopback `Host` and browser `Origin` values by default.
- For intentionally remote setups, set `OCTOGENT_ALLOW_REMOTE_ACCESS=1`.

## API parsing and limits

- JSON bodies are capped at `1 MiB` (`413 Request body too large` beyond limit).
- Invalid JSON and validation failures return `400` with structured error messages.
- Unsupported methods return `405`.
- Monitor config responses are sanitized and redact stored secrets.

## Inter-agent channels

- Agents can send and receive messages via `GET/POST /api/channels/:terminalId/messages`.
- Channel messages are in-memory only and do not persist across API restarts.

## Agent lifecycle hooks

- Claude Code agent hooks (`session-start`, `user-prompt-submit`, `pre-tool-use`, `notification`, `stop`) are ingested via `POST /api/hooks/:hookName`.
- Hooks drive terminal state detection (idle/processing/blocked) and code intelligence tracking.
- The `session-start` and `stop` hooks also trigger Claude usage cache invalidation.

## Known limitations (scratch baseline)

- Full multi-user auth/session model is not implemented yet.
