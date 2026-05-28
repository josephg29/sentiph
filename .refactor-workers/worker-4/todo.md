# Worker 4 – JSDoc TODO

## Scope
Add tasteful JSDoc to exported functions where the WHY is non-obvious. Per coding rules: only add a comment when the WHY is non-obvious. Skip trivial getters/setters and self-explanatory utilities.

## Files to touch

### apps/web/src/app/codeIntelAggregation.ts
- [x] `heatColor` — thermal MRI gradient math is non-obvious; maxValue=0 guard

### apps/web/src/app/hooks/useForceSimulation.ts
- [x] `useForceSimulation` — D3-force topology-key vs content-key separation to avoid reheat

### apps/web/src/app/terminalRuntimeStateStore.ts
- [x] `stripTerminalRuntimeState` — removes agentRuntimeState from structural comparisons
- [x] `createTerminalRuntimeStateStore` — pub-sub with per-terminal subscriptions
- [x] `useTerminalRuntimeStates` — stable Map identity to avoid spurious re-renders

### apps/web/src/app/hotkeys.ts
- [x] `normalizeTickerQueryInput` — strips non-alphanum chars, caps at 16 chars

### apps/web/src/app/terminalState.ts
- [x] `retainActiveTerminalIds` — returns original array reference when nothing removed
- [x] `retainActiveTerminalEntries` — same identity preservation for Record

### apps/web/src/app/githubMetrics.ts
- [x] `buildGitHubCommitSeries` — trims leading zero-commit padding
- [x] `buildGitHubCommitSparkPoints` — y-axis inverted (canvas coords)

### apps/web/src/app/hooks/useCanvasGraphData.ts
- [x] `useCanvasGraphData` — merges 3 data sources; demo mode; position cache

### apps/api/src/sentiphSystemPrompt.ts
- [x] `assertSentiphSystemPromptIsShellSafe` — validates bash double-quote safety

### apps/api/src/startupPrerequisites.ts
- [x] `isCommandAvailable` — cross-platform which/where; accepts options for testing
- [x] `collectStartupPrerequisiteReport` — errors vs warnings by CLI tier

### apps/api/src/projectPersistence.ts
- [x] `deriveProjectIdFromWorkspace` — SHA1 hash for stable ID
- [x] `ensureProjectConfig` — fallback chain for display name
- [x] `registerProject` — upserts registry by project ID
- [x] `resolveProjectStateDir` — side-effecting: registers + creates dir
- [x] `migrateStateToGlobal` — copies from 2 legacy locations
- [x] `ensureSentiphGitignoreEntry` — appends or creates .gitignore entry

### apps/api/src/updates.ts
- [x] `detectInstallation` — .git dir → git; node_modules/package name → npm
- [x] `checkForUpdates` — npm registry vs git remote HEAD
- [x] `applyUpdate` — npm install -g or git pull + pnpm build
- [x] `scheduleSelfRestart` — detached spawn then process.exit

### apps/api/src/claudeUsage.ts
- [x] `parseCliUsageOutput` — handles "used" vs "remaining" pct inversion
- [x] `readClaudeOauthUsageSnapshot` — reads OAuth creds from ~/.claude/.credentials.json
- [x] `readClaudeCliUsageSnapshot` — spawns PTY to capture /usage output
- [x] `readClaudeUsageSnapshot` — CLI-first, OAuth fallback, cache under TTL

### apps/api/src/createApiServer/security.ts
- [x] `withCors` — Vary:Origin only when reflecting specific origin
- [x] `isAllowedOriginHeader` — allows absent Origin (CLI/MCP tools)
- [x] `isAllowedHostHeader` — blocks non-loopback in local mode
- [x] `isLoopbackHostHeader` — strict loopback check, no allowRemoteAccess toggle
- [x] `getRequestCorsOrigin` — returns null to suppress header for blocked origins

### apps/api/src/terminalRuntime/protocol.ts
- [x] `getTerminalId` — parses terminal ID from WS upgrade URL path
- [x] `sendMessage` — guards readyState === 1 (OPEN)
- [x] `broadcastMessage` — sends to WS clients AND internal directListeners

### apps/api/src/terminalRuntime/registry.ts
- [x] `pruneUiStateTerminalReferences` — removes stale terminal refs after deletion
- [x] `loadTerminalRegistry` — handles missing file + auto-migrates v1/v2→v3
- [x] `createTerminalRegistryPersistence` — debounced async write, skips no-op writes

### apps/web/src/components/deck/octopusVisuals.ts
- [x] `seededRandom` — Park-Miller LCG for deterministic appearance
- [x] `deriveOctopusVisuals` — stored fields override random; fallback only when null

### apps/api/src/monitor/service.ts
- [x] `isMonitorCacheStale` — immediate stale on query-term change
- [x] `rankAndLimitPostsByLikes` — deduplicates overlapping provider results

### packages/core/src/util/typeCoercion.ts
- [x] `asRecord` — explicitly rejects arrays (typeof null/array both "object")
- [x] `asNumber` — coerces numeric strings; rejects Infinity/NaN

## Skipped functions (with reasons)

- All `build*Url` functions in runtimeEndpoints.ts — self-explanatory from name/path string
- All `handle*Route` functions in createApiServer/* — obvious HTTP handler wrappers
- `buildTreemapTree`, `layoutTreemap`, `buildCouplingData` — already have JSDoc in source
- `isEditableEventTarget` — name explains it
- `parsePrimaryNavKey` — name and signature explain it
- `formatGitHubCommitHoverLabel`, `buildGitHubStatusPill`, `buildGitHubSparkPolylinePoints`, `buildGitHubCommitCount` — obvious from names
- `ensureGlobalSentiphDir`, `loadProjectsRegistry`, `saveProjectsRegistry`, `resolveProjectConfigPath`, `resolveGlobalProjectDir`, `resolveEphemeralProjectStateDir`, `ensureProjectScaffold`, `hasSentiphGitignoreEntry` — obvious from names
- `stripAnsiCodes`, `resetCliSession`, `invalidateUsageCache` — already have JSDoc in source
- `extractBearerToken`, `readHeaderValue` — obvious
- `isAgentRuntimeState`, `isTerminalAgentProvider`, `isTerminalModel`, `isTerminalEffort` — obvious type guards
- `hashString` in octopusVisuals — obvious djb2-style hash
- `formatStartupPrerequisiteReport` — obvious formatter
- `getTerminalRuntimeStateInfo`, `stripTerminalRuntimeStates` — obvious from surrounding context
- `loadProjectConfig` — obvious
- `createMonitorService`, `createFileMonitorRepository`, `createAgentMetricsStore`, `createCodeIntelStore`, `createSessionRuntime`, `createAgentMetricsCollector` — obvious factory functions
- `SENTIPH_ID` constant — already has clear name
- Constants files — no functions, just constant values
- React components and hooks where the name + props tell the story
- `asString` — completely self-explanatory
- `readClaudeOauthUsageSnapshot`, `readClaudeCliUsageSnapshot` already explained; see final count

## Verification

### JSDoc blocks added per package

| Package | File | Blocks |
|---------|------|--------|
| apps/api | claudeUsage.ts | 4 |
| apps/api | createApiServer/security.ts | 5 |
| apps/api | monitor/service.ts | 2 |
| apps/api | projectPersistence.ts | 6 |
| apps/api | sentiphSystemPrompt.ts | 1 |
| apps/api | startupPrerequisites.ts | 2 |
| apps/api | terminalRuntime/protocol.ts | 3 |
| apps/api | terminalRuntime/registry.ts | 3 |
| apps/api | updates.ts | 4 |
| apps/web | app/codeIntelAggregation.ts | 1 |
| apps/web | app/githubMetrics.ts | 2 |
| apps/web | app/hooks/useCanvasGraphData.ts | 1 |
| apps/web | app/hooks/useForceSimulation.ts | 1 |
| apps/web | app/hotkeys.ts | 1 |
| apps/web | app/terminalRuntimeStateStore.ts | 3 |
| apps/web | app/terminalState.ts | 2 |
| apps/web | components/deck/octopusVisuals.ts | 2 |
| packages/core | util/typeCoercion.ts | 2 |
| **TOTAL** | **18 files** | **45 blocks** |

### Skipped count
~80+ exported functions skipped (all `build*Url` in runtimeEndpoints.ts, all `handle*Route` handlers,
trivial constants, obvious type guards, obvious formatters, and functions that already had JSDoc).

Sample skipped with reasons:
- `buildTerminalsUrl` — self-explanatory URL builder
- `handleTerminalSnapshotsRoute` — obvious HTTP route handler
- `isAgentRuntimeState` — obvious type guard
- `formatStartupPrerequisiteReport` — obvious formatter
- `loadProjectsRegistry` / `saveProjectsRegistry` — obvious CRUD
- `asString` — completely self-explanatory
- All constants in `constants.ts` files — values, not functions

### Command results

**TypeScript typecheck:**
- Only pre-existing error: `tests/promptResolver.test.ts` can't find `'../src/prompts'` module
- Zero new TS errors introduced by JSDoc

**Tests (`pnpm -r test`):**
- apps/web: 88/88 passed ✓
- apps/api: 147/158 passed — 11 failures are pre-existing (confirmed by running on clean branch)
- No new test failures introduced

**Lint (`pnpm lint`):**
- 101 errors before and after — no new lint errors introduced by JSDoc
- Errors are pre-existing Biome issues unrelated to this branch
