# CLI Reference

## Start the dashboard

```bash
sentiph
```

Starts the local API for the current project and opens the UI when bundled web assets are present.

If the current directory has not been initialized yet, `sentiph` also creates or updates the local `.sentiph/` scaffold automatically on first run.

## Initialize a project

```bash
sentiph init [project-name]
```

Creates or updates the `.sentiph/` scaffold in the current directory without starting the dashboard.

Use this when you want to initialize the project explicitly or set the project display name ahead of time. In normal use, running `sentiph` inside the codebase is enough to initialize and start the app.

## List registered projects

```bash
sentiph projects
```

## Create a tentacle

```bash
sentiph tentacle create <name> --description "API runtime and routes"
```

Sentiph must already be running for this command.

## List tentacles

```bash
sentiph tentacle list
```

## Create a terminal

```bash
sentiph terminal create [options]
```

Options:

- `--name`, `-n`: terminal display name
- `--workspace-mode`, `-w`: `shared` or `worktree`
- `--initial-prompt`, `-p`: raw initial prompt text
- `--terminal-id`: explicit terminal ID
- `--tentacle-id`: existing tentacle ID to attach to
- `--worktree-id`: explicit worktree ID
- `--parent-terminal-id`: parent terminal ID for child terminals
- `--prompt-template`: prompt template name
- `--prompt-variables`: JSON object of prompt template variables

## List terminals

```bash
sentiph terminal list
```

Shows each terminal ID, lifecycle state, recorded process ID when available, lifecycle reason, and display name.

## Stop or kill a terminal

```bash
sentiph terminal stop <terminal-id>
sentiph terminal kill <terminal-id>
```

`stop` closes an active session or sends `SIGTERM` to the recorded process for a stale terminal. `kill` uses `SIGKILL`.

## Prune inactive terminal records

```bash
sentiph terminal prune
```

Removes terminal records whose lifecycle state is `stale`, `stopped`, or `exited`. It does not remove active sessions.

## Send a message

```bash
sentiph channel send <terminal-id> "message"
```

Use `--from <terminal-id>` when sending on behalf of a worker or parent terminal. If `--from` is omitted, the CLI falls back to `SENTIPH_SESSION_ID` when the command is running inside an Sentiph-managed terminal.

## List messages

```bash
sentiph channel list <terminal-id>
```
