<div align="center">

<strong>multi-agent orchestration for Claude Code</strong>
<br />
<br />

![Last Update](https://img.shields.io/github/last-commit/josephg29/sentiph?label=Last%20Update&style=flat-square)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

# Sentiph

Running ten Claude Code sessions at once gets chaotic fast — constantly switching windows, losing track of what each one was doing, and having no shared source of truth between them. **Sentiph** fixes that by giving each job its own scoped context, notes, and task list, while making it possible for one Claude Code session to **spawn and coordinate other Claude Code sessions**.

## What it does

- **Runs multiple full Claude Code terminals** so one developer can manage several sessions at once from a single view
- **Scopes each job** with its own `CONTEXT.md`, `todo.md`, and notes so agents don't need to reconstruct context from chat history
- **Lets one agent coordinate others** — a parent session can spawn workers, assign them todo items, and receive status back
- **Tracks token usage, cost, and run time** across every session and project
- **Provides a canvas view** showing all running sessions as nodes, plus a deck view, activity view, and observability dashboard
- **Supports inter-agent messaging** so workers can report completion, blockers, and handoffs back to a coordinator

## How it works

Sentiph separates three concerns that usually get tangled together across a pile of terminals:

1. **Context** lives in `.sentiph/sessions/<session-id>/`. `CONTEXT.md` explains the area of the codebase, `todo.md` holds executable work items, and extra markdown files store notes or handoffs.
2. **Execution** is managed by a local API that runs PTY sessions, handles terminal lifecycle, and streams state to the UI over WebSocket.
3. **Isolation** is optional. Sessions can share the main workspace or run in a dedicated worktree under `.sentiph/worktrees/<worktree-id>/`.

The deck reads session files directly, parses checkbox items from `todo.md`, and uses incomplete items to generate worker prompts. Claude hooks feed the API with agent state, transcript, and idle events so the UI can show more than raw terminal output.

## Claude Code coordinating Claude Code

One of the core ideas is that Claude Code should not just be a single terminal waiting on a human. In Sentiph, one Claude Code session can act as a coordinator — spawning worker sessions, giving each one a scoped job, and collecting status back while you stay at the orchestration layer.

This is different from Claude Code's built-in subagent spawning because you can directly see, intervene in, and track what each worker is doing.

For more, see [Orchestrating Child Agents](docs/guides/orchestrating-child-agents.md) and [Inter-Agent Messaging](docs/guides/inter-agent-messaging.md).

## Quick start

<details open>
<summary><strong>Install from source</strong></summary>

```bash
git clone https://github.com/josephg29/sentiph
cd sentiph && pnpm install && pnpm build
npm install -g .
sentiph
```

</details>

<details>
<summary><strong>Local development</strong></summary>

```bash
pnpm install
pnpm dev
```

</details>

On first run, Sentiph creates the `.sentiph/` scaffold, assigns a stable project ID, picks an available port starting at `8787`, and opens the UI.

## Requirements

- Node.js `22+`
- `claude` CLI installed
- `git` (for worktree sessions)
- `gh` (for GitHub pull request features)
- `curl` (for Claude hook callbacks)

## What persists

- `.sentiph/` — project scaffold, worktrees, and session context files
- `~/.sentiph/projects/<project-id>/state/` — runtime state, transcripts, and metadata

PTY sessions survive browser reloads during the idle grace period but do not survive an API restart. Use `sentiph terminal list`, `stop`, `kill`, and `prune` to inspect and clean up stale records. Sentiph caps live PTY sessions at 32 by default; set `SENTIPH_MAX_TERMINAL_SESSIONS` to tune that limit.

## Docs

- [Docs Home](docs/index.md)
- [Installation](docs/getting-started/installation.md)
- [Quickstart](docs/getting-started/quickstart.md)
- [Mental Model](docs/concepts/mental-model.md)
- [Sessions](docs/concepts/sessions.md)
- [Runtime and API](docs/concepts/runtime-and-api.md)
- [Working With Todos](docs/guides/working-with-todos.md)
- [Orchestrating Child Agents](docs/guides/orchestrating-child-agents.md)
- [Inter-Agent Messaging](docs/guides/inter-agent-messaging.md)
- [CLI Reference](docs/reference/cli.md)
- [Filesystem Layout](docs/reference/filesystem-layout.md)
- [API Reference](docs/reference/api.md)
- [Experimental Features](docs/reference/experimental-features.md)
- [Troubleshooting](docs/reference/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Issues and pull requests are welcome. Before opening a PR, please read [CONTRIBUTING.md](CONTRIBUTING.md). If any code was written with an AI coding agent, please disclose which agent and model in the PR description.

## License

Sentiph is released under the [MIT License](LICENSE).
