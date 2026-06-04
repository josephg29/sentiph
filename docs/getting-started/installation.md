# Installation

Sentiph is a local Node.js project with a local API and web UI.

## Requirements

- Node.js `22+`
- pnpm `10+` — required for workspace dependency management
- `claude` for the supported workflow
- `git` for worktree terminals
- `gh` for GitHub pull request features
- `curl` for the current Claude hook callback flow

The current docs are Claude Code-first. Some provider plumbing exists in the codebase, but it is not the supported story yet.

## Local development install

Install dependencies with pnpm (required — npm alone cannot resolve workspace packages):

```bash
pnpm install
```

Start the dev server. Either command works:

```bash
pnpm dev
# or
npm run dev
```

## Local global CLI install from a clone

```bash
pnpm install
pnpm build
npm install -g .
```

The final `npm install -g .` step uses npm to link the built package globally — this is intentional and does not require pnpm.

## npm registry install

Sentiph is not published to the npm registry yet, so `npm install -g sentiph` will fail with `404`.

## First run behavior

Running `sentiph` inside a project directory will:

- create `.sentiph/` if it does not exist
- add `.sentiph` to `.gitignore` or create `.gitignore` when it is missing
- write a stable project ID to `.sentiph/project.json`
- register the project under `~/.sentiph/projects.json`
- move runtime state to `~/.sentiph/projects/<project-id>/state/`
- choose an open local API port starting at `8787`
- open the browser unless `SENTIPH_NO_OPEN=1`


## Startup rules

- startup fails if neither `claude` nor another supported provider binary is available
- startup warns when optional integrations like `git`, `gh`, or `curl` are missing

## Next step

- [Quickstart](quickstart.md)
