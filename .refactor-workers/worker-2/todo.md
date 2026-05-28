# Worker 2: README Rewrite

## Status: Complete

## Tasks
- [x] Verify branch (demo/refactor-w2-readme)
- [x] pnpm install
- [x] Research project files
- [x] Write README.md
- [x] Verify all commands/paths
- [x] Commit

## Research Notes
- Monorepo: apps/api (Node/WS/PTY), apps/web (Vite/React), packages/core
- Port default: 8787 (confirmed in scripts/dev.mjs)
- Max PTY sessions: 32 (confirmed in apps/api/src/terminalRuntime/constants.ts)
- Max children per parent: 32 (confirmed in apps/api/src/terminalRuntime.ts)
- CLI entry: bin/sentiph (delegates to dist/api/cli.js or scripts/dev.mjs)
- sessions.json is terminal registry (confirmed in docs and runtime-and-api.md)

## Verification

### Scripts verified against root package.json
- `pnpm dev` ✓ (node scripts/dev.mjs)
- `pnpm build` ✓ (filter web + vite bundle + build-package.mjs)
- `pnpm test` ✓ (pnpm -r test)
- `pnpm lint` ✓ (biome check .)
- `pnpm format` ✓ (biome format --write .)
- `npm install -g .` — not a package.json script but valid npm CLI; verified bin field points to ./bin/sentiph

### Paths verified to exist in worktree
- bin/ ✓
- apps/api/ ✓
- apps/web/ ✓
- packages/core/ ✓
- scripts/ ✓
- docs/ ✓
- static/ ✓
- CONTRIBUTING.md ✓
- LICENSE ✓
- docs/index.md ✓
- docs/getting-started/installation.md ✓
- docs/getting-started/quickstart.md ✓
- docs/concepts/mental-model.md ✓
- docs/concepts/sessions.md ✓
- docs/concepts/runtime-and-api.md ✓
- docs/guides/working-with-todos.md ✓
- docs/guides/orchestrating-child-agents.md ✓
- docs/guides/inter-agent-messaging.md ✓
- docs/reference/cli.md ✓
- docs/reference/filesystem-layout.md ✓
- docs/reference/api.md ✓
- docs/reference/experimental-features.md ✓
- docs/reference/troubleshooting.md ✓

### CLI commands verified against docs/reference/cli.md
All commands in the README CLI reference block match exactly with docs/reference/cli.md.

### Intentional omissions
- `prompts/` — referenced in scripts/dev.mjs but directory does not exist in the repo; removed from project structure table
- "up to nine child workers" — changed to "up to 32" matching MAX_CHILDREN_PER_PARENT constant; the "9" referenced in orchestrating-child-agents.md refers to a system-prompt recommendation, not the hard limit
- `smoke:public-install` script — not relevant to end users, omitted from README
- `sentiph terminal create --session-id` flag — quickstart doc uses --session-id but CLI reference uses --tentacle-id; README defers to CLI reference doc for full options
