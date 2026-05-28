# Worker 1 – File Structure Audit & Cleanup

## Findings

### Files > 800 lines (hard cap violations)
- `apps/api/tests/createApiServer.test.ts` – 3419 lines (note for Worker 3: dead code candidate; test file may need split but out of scope)
- `apps/web/src/components/CanvasPrimaryView.tsx` – 1457 lines (candidate for split, out of scope here)
- `apps/api/tests/sessionRuntime.test.ts` – 1352 lines (test file)
- `apps/api/src/terminalRuntime.ts` – 1194 lines (partially split already into terminalRuntime/ dir; the entry file still holds MCP-config write helpers + main createTerminalRuntime)
- `apps/api/src/terminalRuntime/sessionRuntime.ts` – 1037 lines (candidate for split)
- `apps/api/src/claudeUsage.ts` – 922 lines (candidate for split)

### Files 400–800 lines (consider splitting)
- `apps/web/src/components/EmptyAgents.tsx` – 722 (large inline SVG/animation – may just be inherently large)
- `apps/web/src/components/EmptyOctopus.tsx` – 715 (same)
- `apps/web/src/components/UsageHeatmap.tsx` – 702
- `apps/web/src/App.tsx` – 618
- `apps/web/src/components/DeckPrimaryView.tsx` – 613
- `apps/api/src/monitor/xProvider.ts` – 587
- `apps/web/src/app/hooks/usePersistedUiState.ts` – 540
- `apps/web/src/app/hooks/useCanvasGraphData.ts` – 533
- `apps/web/src/app/hooks/useTentacleGitLifecycle.ts` / `useAgentGitLifecycle.ts` – 530 each
- `apps/web/src/components/GitHubPrimaryView.tsx` – 494
- `apps/web/src/components/Terminal.tsx` – 488
- `apps/web/src/components/MonitorPrimaryView.tsx` – 475
- `apps/api/src/terminalRuntime/registry.ts` – 473
- `apps/api/src/cli.ts` – 464

### Misplaced utility files in components/
- `apps/web/src/components/terminalReplay.ts` – pure logic utility, no JSX, should be in `app/`
- `apps/web/src/components/terminalWheel.ts` – pure logic utility, no JSX, should be in `app/`

### Naming inconsistencies in test files (apps/web/tests/)
Dominant pattern is kebab-case. Outliers:
- `CanvasPrimaryView.test.tsx` → should be `canvas-primary-view.test.tsx`
- `HttpTerminalSnapshotReader.test.tsx` → should be `http-terminal-snapshot-reader.test.tsx`
- `RuntimeStatusStrip.test.tsx` → should be `runtime-status-strip.test.tsx`
- `Terminal.test.tsx` → should be `terminal.test.tsx`
- `terminalReplay.test.ts` → should be `terminal-replay.test.tsx` (also fix extension: currently excluded from test run!)
- `terminalState.test.tsx` → should be `terminal-state.test.tsx`
- `terminalWheel.test.tsx` → should be `terminal-wheel.test.tsx`
- `useAgentRuntimeStates.test.tsx` → should be `use-agent-runtime-states.test.tsx`
- `uiPrimitives.test.tsx` → should be `ui-primitives.test.tsx`
- `runtimeEndpoints.test.tsx` → should be `runtime-endpoints.test.tsx`
- `githubMetrics.test.tsx` → should be `github-metrics.test.tsx`

### Bug found: terminalReplay.test.ts excluded from test run
`apps/web/vite.config.ts` includes only `tests/**/*.test.tsx` but `terminalReplay.test.ts` has `.ts` extension.
This test is silently never run. Fixed by renaming to `.tsx`.

### Barrel exports (missing index.ts)
- `apps/web/src/app/hooks/` – no barrel (each hook imported directly, which is fine)
- `apps/web/src/components/ui/` – no barrel (acceptable)
- `apps/web/src/components/canvas/` – no barrel
- `apps/web/src/components/deck/` – no barrel
- `apps/web/src/components/obs/` – no barrel
Note: Barrels introduce tree-shaking concerns. Not adding them unless clearly beneficial.

### Candidates for other workers
- Worker 2 (docs): AGENTS.md files in apps/api, apps/web, packages/core could be reviewed
- Worker 3 (dead code): `pairingRoutes.ts` is only 9 lines – may be vestigial
- Worker 3 (dead code): `apps/api/src/pairing.ts` – check if used
- Worker 4 (docs): `createTerminalRuntime` in terminalRuntime.ts is complex and would benefit from JSDoc

## Actions Taken

- [x] Move `terminalReplay.ts` → `apps/web/src/app/terminalReplay.ts`
- [x] Move `terminalWheel.ts` → `apps/web/src/app/terminalWheel.ts`
- [x] Update imports in Terminal.tsx and test files
- [x] Rename test files to kebab-case (fix naming inconsistency + fix the excluded .ts test)

## Verification

| Command | Result | Notes |
|---|---|---|
| `pnpm install` | PASS | Already up to date, 408ms |
| `tsc --noEmit` (apps/web) | PASS | No errors |
| `tsc --noEmit` (packages/core) | PASS | No errors |
| `tsc --noEmit` (apps/api) | FAIL (pre-existing) | `tests/promptResolver.test.ts` imports missing `../src/prompts` — existed before my changes |
| `pnpm -r test` (apps/web) | PASS | 25 test files, 90 tests all passed |
| `pnpm -r test` (apps/api) | FAIL (pre-existing) | 2 test files failed, 11 tests failed — same failures on baseline without my changes |
| `pnpm lint` | FAIL (pre-existing) | 102 biome errors — same on baseline |
| `vite build` (apps/web) | PASS | Built in 1.48s, 1880 modules transformed |

All failures are pre-existing and were confirmed by reverting my changes and re-running the same checks.
