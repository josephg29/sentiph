# Architecture

Sentiph is a TypeScript monorepo with three packages and a strict, one-directional
dependency rule. Everything points *inward* toward the framework-agnostic domain
core; nothing points back out.

## Package dependency graph

```
        ┌─────────────────────────────────────────────┐
        │                 apps/web                      │
        │   Vite + React SPA — canvas, activity,        │
        │   observability, settings, xterm.js terminals │
        └───────────────────────┬───────────────────────┘
                                 │ HTTP (CRUD, snapshots, prompts)
                                 │ WebSocket (terminal I/O + list events)
                                 ▼
        ┌─────────────────────────────────────────────┐
        │                 apps/api                      │
        │   Node HTTP/WS server, node-pty lifecycle,    │
        │   Claude hook ingestion, git worktrees,       │
        │   transcript persistence, channel queues      │
        └───────────────────────┬───────────────────────┘
                                 │ imports types + pure logic
                                 ▼
        ┌─────────────────────────────────────────────┐
        │               packages/core                   │
        │   Framework-agnostic domain layer:            │
        │   domain · application · ports · adapters      │
        │   NO react / node / ws / pty / fs / http       │
        └─────────────────────────────────────────────┘
```

Both `apps/web` and `apps/api` depend on `@sentiph/core`. `core` depends on nothing
runtime-specific. `web` and `api` never import each other directly — they
communicate only over HTTP and two WebSocket endpoints.

## The core boundary

`packages/core` is the portable heart of the system. It is organized in a
hexagonal style:

- **`domain/`** — pure types and value logic (terminals, sessions, usage, channel,
  git status, agent runtime state).
- **`application/`** — use-case logic composed from domain types (e.g. building the
  terminal list view model).
- **`ports/`** — interfaces the outside world must implement (e.g.
  `TerminalSnapshotReader`).
- **`adapters/`** — in-memory / test implementations of those ports.

Because `core` has no dependency on React, the DOM, Node builtins, `node-pty`,
`ws`, HTTP, or the filesystem, it is trivially unit-testable and reusable by both
apps. This boundary is **enforced in CI** by
[`packages/core/tests/architecture.test.ts`](../../packages/core/tests/architecture.test.ts),
which fails the build if a forbidden import is introduced.

## Why this shape

- **Testability** — domain logic is exercised without spinning up a server, a
  browser, or a PTY. `core` executable code is covered to 100%.
- **Replaceable infrastructure** — the PTY/HTTP/git concerns in `apps/api` sit
  behind the `ports` interfaces, so they can be swapped or mocked.
- **Clear ownership** — `apps/api` owns *all* infrastructure; `apps/web` owns
  presentation; `core` owns the rules. A change rarely needs to cross more than
  one of these.

See [Runtime and API](runtime-and-api.md) for the terminal lifecycle and
WebSocket/hook details, and the [Mental Model](mental-model.md) for the
session/terminal/worktree boundaries.
