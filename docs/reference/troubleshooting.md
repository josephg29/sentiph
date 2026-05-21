# Troubleshooting

## `pnpm test` fails because of browser APIs

Make sure the workspace dependencies are installed from the repo root:

```bash
pnpm install
```

## Package resolution is broken

Run install from the repository root, not from a subpackage.

## Node version is too old

Use Node.js `22+`.

## Terminal startup fails

Check that your shell environment is available and executable.

If startup fails with `Terminal session limit reached`, Sentiph already has the configured number of live PTY-backed sessions. Stop unused terminals with `sentiph terminal stop <terminal-id>` or prune inactive records with `sentiph terminal prune`. The default cap is 32; set `SENTIPH_MAX_TERMINAL_SESSIONS` to a positive integer before starting Sentiph to adjust it.

## Worktree terminal creation fails

Verify:

- `git --version` works
- the workspace is a git repository
- the current user can create worktrees in `.sentiph/worktrees/`

## GitHub summary is unavailable

Verify:

```bash
gh auth status
```

## Monitor refresh fails

Verify your X bearer token and API access.

## Messages disappear after restart

That is expected. Channel messages are in-memory only and do not persist across API restarts.

## A terminal survived reload but not server restart

That is also expected. PTY sessions can survive a reconnect window, but they do not survive an API restart.

After restart, terminals that were persisted as running are marked `stale` when Sentiph cannot reattach them to an in-memory PTY session. Use `sentiph terminal list` to inspect lifecycle state, `sentiph terminal stop <terminal-id>` or `sentiph terminal kill <terminal-id>` for a recorded process, and `sentiph terminal prune` to remove stale, stopped, or exited records from the UI.
