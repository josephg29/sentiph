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

## A spawned terminal drops to a raw shell instead of launching Claude (Windows)

Symptom: a newly spawned worker shows `The system cannot execute the specified program.` and then echoes the task brief as a shell command (e.g. `'You' is not recognized as an internal or external command`).

Cause: the terminal's shell (`cmd.exe`) could not execute a bare `claude`. This happens when `claude` resolves to a `claude.ps1` shim (common when `PATHEXT` lists `.PS1` ahead of `.CMD`) or to the extensionless `claude` bash script — neither of which `cmd.exe` can run.

Sentiph resolves `claude` to a `cmd.exe`-executable wrapper (`.cmd`/`.exe`/`.bat`) automatically. If your install lives somewhere non-standard, point Sentiph at the exact launcher before starting it:

```powershell
$env:SENTIPH_CLAUDE_PATH = "C:\path\to\claude.cmd"
```

`SENTIPH_CLAUDE_PATH` overrides resolution on every platform. Verify the target runs with `cmd /c "<path>" --version`.

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
