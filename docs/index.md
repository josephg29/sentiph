# Sentiph Docs

These docs are written for contributors and future coding agents. They explain how Sentiph is put together, where state lives, and how local terminal agents are coordinated.

Sentiph has three main layers:

- **agent-facing files** in `.sentiph/sessions/<session-id>/`, which hold context, todos, and handoff notes
- **runtime state** under `~/.sentiph/projects/<project-id>/state/`, which tracks terminals, UI state, transcripts, and app metadata
- **live sessions** in the API process, where WebSocket connections are attached to PTY-backed Claude Code terminals

## Start here

- [Installation](getting-started/installation.md)
- [Quickstart](getting-started/quickstart.md)
- [Mental Model](concepts/mental-model.md) explains the boundaries between sessions, terminals, worktrees, and runtime state

## Concepts

- [Sessions](concepts/sessions.md) explains the file-backed context model and how Deck reads it
- [Runtime and API](concepts/runtime-and-api.md) explains terminal lifecycle, WebSockets, hooks, persistence, and restart behavior

## Guides

- [Working With Todos](guides/working-with-todos.md) explains how checkbox lines become progress and worker inputs
- [Orchestrating Child Agents](guides/orchestrating-child-agents.md) explains parent/worker spawning, shared mode, and worktree mode
- [Inter-Agent Messaging](guides/inter-agent-messaging.md) explains the in-memory channel queue and delivery rules

## Reference

- [CLI](reference/cli.md)
- [Filesystem Layout](reference/filesystem-layout.md)
- [API](reference/api.md)
- [Experimental Features](reference/experimental-features.md)
- [Troubleshooting](reference/troubleshooting.md)

## Contributor policy

- [Contributing](../CONTRIBUTING.md)
