# Octogent

Octogent is a web-first command surface for running and coordinating multiple coding agents in parallel.

This repository is currently a scratch baseline built with:

- TypeScript + Node.js 22+
- pnpm workspace
- Vite + React frontend
- ports-and-adapters core package
- Vitest and Biome

## Quickstart

```bash
pnpm install
pnpm start
```

Open `http://localhost:5173`.

The default screen is an empty operational view until a backend serves `GET /api/agent-snapshots`.

## Common workflows

```bash
pnpm test
pnpm lint
pnpm build
pnpm format
```

## Repo layout

- `apps/web` - web UI shell
- `packages/core` - application/domain/ports/adapters core logic
- `docs` - contributor and architecture documentation
- `context` - long-term project context and decisions
