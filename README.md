# Sentiph

[![CI](https://github.com/josephg29/sentiph/actions/workflows/ci.yml/badge.svg)](https://github.com/josephg29/sentiph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)

**Multi-agent orchestration for Claude Code.**

Running several Claude Code sessions at once gets unwieldy fast — context gets lost, windows multiply, and there is no shared source of truth between sessions. Sentiph wraps each job in a durable file-based session, shows every active session on a visual canvas, and lets one Claude Code session spawn and coordinate others, all from a local web UI backed by a WebSocket/PTY API.


## Highlights

- **Parallel terminals on a canvas** — every Claude Code session appears as a node in an interactive D3 force-graph canvas; terminal I/O streams through an embedded xterm.js terminal
- **File-backed sessions** — each session keeps its own `CONTEXT.md` and notes under `.sentiph/sessions/<session-id>/`; agents read and update these files directly
- **Parent/worker orchestration** — a parent terminal can spawn up to nine child workers; shared-workspace or worktree-isolated execution modes are both supported
- **In-memory channel messaging** — terminals exchange short messages via `sentiph channel send`; delivery is queued until the target session is idle
- **Claude hook integration** — PTY sessions write hook callbacks that feed state transitions (active, waiting, idle, stop) back to the API and drive transcript capture and channel delivery
- **Usage and cost tracking** — per-session token usage and cost are surfaced in the observability view

## Architecture

```
apps/
  api/   — Node.js HTTP + WebSocket server, PTY lifecycle, hooks, worktrees
  web/   — Vite + React UI: canvas, deck, activity, observability, settings
packages/
  core/  — framework-agnostic domain types and application logic
```

**`apps/api`** owns all infrastructure concerns: terminal registry, node-pty sessions, WebSocket upgrades, Claude hook ingestion, git worktree creation, transcript persistence, and in-memory channel queues. It binds to `127.0.0.1` by default and enforces loopback `Host` and `Origin` checks.

**`apps/web`** is a Vite + React single-page application. The canvas view uses a D3 force layout. The deck view reads session files. Other views cover activity, code intelligence, GitHub, observability, and settings.

**`packages/core`** defines domain types and pure application logic shared by both apps. It has no dependency on React, HTTP, PTY, or filesystem concerns.

The two apps communicate over HTTP (CRUD, snapshots, prompt resolution) and two WebSocket endpoints: one for terminal I/O and one for terminal list events. Port defaults to `8787` and auto-increments if that port is taken.

## Prerequisites

- Node.js `22+`
- pnpm `10+`
- `claude` CLI (Claude Code)
- `git` (required for worktree-isolated sessions)
- `gh` (required for GitHub pull-request features)
- `curl` (required for Claude hook callbacks)

## Installation

Install from source:

```bash
git clone https://github.com/josephg29/sentiph
cd sentiph
pnpm install
pnpm build
npm install -g .
```

Then run Sentiph from any project directory:

```bash
sentiph
```

On first run, Sentiph initialises a `.sentiph/` scaffold in the current directory, assigns a stable project ID, and opens the UI in the browser.

> Sentiph is not yet published to npm, so `npm install -g sentiph` is not a valid install path.

## Running in development

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts `@sentiph/api` and `@sentiph/web` in parallel. The dev runner picks an available port starting at `8787` and passes it to both processes as `SENTIPH_API_PORT`.

## Building

```bash
pnpm build
```

Builds the web bundle, runs the API bundle step, and assembles the distributable package under `dist/`.

## Project structure

```
bin/          CLI entry point (bin/sentiph)
apps/
  api/        Node.js API and PTY runtime
  web/        Vite + React operator UI
packages/
  core/       Shared domain types and logic
scripts/      Dev runner and build helpers
docs/         Contributor and agent documentation
static/       Static assets served by the API
```

## Key concepts

### Sessions

A session is a folder under `.sentiph/sessions/<session-id>/`. The minimum useful content is `CONTEXT.md` (area description). Additional markdown files are surfaced as session vault files.

Deck derives the session display name from the first heading in `CONTEXT.md` and the description from the first non-empty paragraph.

### Terminals

A terminal is a runtime record that can hold one active PTY-backed Claude Code session. Multiple terminals can reference the same session — for example, swarm workers all read the same `CONTEXT.md` but each has its own terminal ID, transcript, lifecycle state, and optional worktree.

PTY sessions do not survive an API restart. Terminal records do. Records that were `running` at the time of a restart are reconciled to `stale`.

### Workspace modes

- **shared** — the terminal's PTY runs in the main workspace; fast to set up but all active terminals share the same checkout
- **worktree** — the API creates an isolated git worktree under `.sentiph/worktrees/<terminal-id>/` on branch `sentiph/<terminal-id>`; preferred when tasks touch overlapping files

### Parent/worker orchestration

A parent terminal can spawn child worker terminals (up to 32 per parent). Each worker is given a generated prompt that includes the session path, workspace mode, API port, and parent terminal ID. A parent coordinator terminal is added automatically when a swarm targets more than one item.

Workers report progress via `sentiph channel send` and by writing to session markdown files. Merge and review are the parent's responsibility.

### Channels

Channels are in-memory message queues. Messages are queued until the target terminal is idle, then injected. They do not persist across API restarts — durable handoffs belong in session markdown files.

## CLI reference

```bash
# Start the dashboard for the current project
sentiph

# Initialise the .sentiph/ scaffold without starting the UI
sentiph init [project-name]

# List registered projects
sentiph projects

# Session management
sentiph tentacle create <name> --description "description"
sentiph tentacle list

# Terminal management
sentiph terminal create [--name <name>] [--workspace-mode shared|worktree] [--tentacle-id <id>]
sentiph terminal list
sentiph terminal stop <terminal-id>
sentiph terminal kill <terminal-id>
sentiph terminal prune

# Inter-agent messaging
sentiph channel send <terminal-id> "message"
sentiph channel list <terminal-id>
```

Full option descriptions are in [docs/reference/cli.md](docs/reference/cli.md).

## Persistence

| Location | Contents |
|---|---|
| `.sentiph/project.json` | Stable project ID |
| `.sentiph/sessions/<id>/` | Agent-facing markdown |
| `.sentiph/worktrees/<id>/` | Isolated git worktrees |
| `~/.sentiph/projects/<id>/state/sessions.json` | Terminal registry |
| `~/.sentiph/projects/<id>/state/transcripts/*.jsonl` | Conversation transcripts |
| `~/.sentiph/projects/<id>/state/deck.json` | Deck UI metadata |

By default the API allows up to 32 simultaneous PTY sessions. Set `SENTIPH_MAX_TERMINAL_SESSIONS` to change that limit.

## Development

**Test**

```bash
pnpm test
```

Runs vitest in every workspace package.

**Lint**

```bash
pnpm lint
```

Runs Biome checks across the repository.

**Format**

```bash
pnpm format
```

Rewrites formatting with Biome.

Before opening a pull request, run `pnpm test`, `pnpm lint`, and `pnpm build`.

## Docs

- [Docs home](docs/index.md)
- [Installation](docs/getting-started/installation.md)
- [Quickstart](docs/getting-started/quickstart.md)
- [Mental model](docs/concepts/mental-model.md)
- [Sessions](docs/concepts/sessions.md)
- [Runtime and API](docs/concepts/runtime-and-api.md)
- [Orchestrating child agents](docs/guides/orchestrating-child-agents.md)
- [Inter-agent messaging](docs/guides/inter-agent-messaging.md)
- [CLI reference](docs/reference/cli.md)
- [Filesystem layout](docs/reference/filesystem-layout.md)
- [API reference](docs/reference/api.md)
- [Experimental features](docs/reference/experimental-features.md)
- [Troubleshooting](docs/reference/troubleshooting.md)

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, required checks, and pull request expectations. If any code was written with an AI coding agent, disclose which agent and model in the PR description.

## License

Sentiph is released under the [MIT License](LICENSE).
