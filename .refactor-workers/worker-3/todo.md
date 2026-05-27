# Worker 3: Dead Code Removal

## Status: COMPLETE

## Tasks
- [x] Verify branch: demo/refactor-w3-deadcode
- [x] pnpm install
- [x] Run knip analysis
- [x] Run ts-prune analysis (failed — no root tsconfig.json; knip was sufficient)
- [x] Manual grep verification of each candidate
- [x] Remove high-confidence dead code
- [x] Verification (typecheck, tests, build, lint)
- [x] Commit

## Removed Items

### Dead Files (10 deleted)
- `apps/api/src/deck/readDeckAgents.ts` — duplicate of readDeckTentacles.ts with old "Agent" naming; confirmed zero imports with `grep -r "from.*readDeckAgents"`
- `apps/web/src/app/hooks/useTentacleGitLifecycle.ts` — confirmed zero imports; `useAgentGitLifecycle` is the live hook used in App.tsx
- `apps/web/src/components/AgentGitActionsDialog.tsx` — confirmed zero imports (only self-references); TentacleGitActionsDialog.tsx is the live counterpart
- `apps/web/src/components/ClearAllConversationsDialog.tsx` — confirmed zero imports
- `apps/web/src/components/DeleteAgentDialog.tsx` — confirmed zero imports
- `apps/web/src/components/SidebarConversationsList.tsx` — confirmed zero imports
- `apps/web/src/components/canvas/AgentNode.tsx` — confirmed zero imports; OctopusNode.tsx is the live counterpart
- `apps/landing/src/components/screenshots.tsx` — not in page.tsx; landing imports Hero/Features/DemoUI/Install/StarCta only
- `apps/landing/src/components/ui/button.tsx` — confirmed zero imports anywhere; only button import is `copy-button.tsx`
- `apps/api/tests/promptResolver.test.ts` — imports from `../src/prompts` which does not exist (unresolved import flagged by knip); pre-existing test failure on baseline

### Dead Code Removed from Files (26 symbols)
**apps/api/src/claudeSkills.ts**
- Removed `parseSuggestedSkillsFromContext`, `applySuggestedSkillsToContext`, and `renderSuggestedSkillsBlock` — none called internally or externally; confirmed with `grep -rn`
- Removed `SKILL_MARKER_START`, `SKILL_MARKER_END` — only used by the removed functions above

**apps/api/src/deck/readDeckTentacles.ts**
- Removed `readContextTitle` — confirmed not called internally or externally; was only exported as dead API
- Removed `parseTodoProgress` — same; used by readDeckAgents.ts (now deleted) and nowhere else

**apps/api/src/updates.ts**
- Removed `__testing` export — test-only export that was never imported anywhere

**apps/api/src/runtimeMetadata.ts**
- Un-exported `resolveRuntimeMetadataPath` (changed to `const`) — confirmed not imported externally; still used internally by `readRuntimeMetadata`

**apps/api/src/terminalRuntime/constants.ts**
- Un-exported `TERMINAL_REGISTRY_RELATIVE_PATH`, `TERMINAL_TRANSCRIPT_RELATIVE_PATH`, `TENTACLE_WORKTREE_RELATIVE_PATH`, `TENTACLE_WORKTREE_BRANCH_PREFIX`, `CLAUDE_BOOTSTRAP_COMMAND` — none imported externally; confirmed with `grep -rn ... | grep -v constants.ts`

**apps/api/src/terminalRuntime/registry.ts**
- Un-exported `persistTerminalRegistry` — not imported externally

**apps/api/src/terminalRuntime/systemClients.ts**
- Un-exported `createDefaultGitClient` — not imported externally

**apps/web/src/app/conversationNormalizers.ts**
- Un-exported `normalizeConversationSessionDetail` — not imported externally or called internally

**apps/web/src/app/metricsNormalizers.ts**
- Un-exported `normalizeAgentRunSummary` — not imported externally or called internally

**apps/web/src/components/deck/ActionCards.tsx**
- Un-exported `AGENT_PROVIDER_OPTIONS` — not imported externally; used internally

**apps/web/src/components/deck/AddAgentForm.tsx**
- Un-exported `EXPRESSION_OPTIONS`, `ACCESSORY_OPTIONS`, `HAIR_COLORS` — not imported externally; used internally

**apps/web/src/components/deck/AddTentacleForm.tsx**
- Un-exported `EXPRESSION_OPTIONS`, `ACCESSORY_OPTIONS`, `HAIR_COLORS` — not imported externally; used internally

**apps/web/src/components/deck/AgentPod.tsx**
- Un-exported `STATUS_LABELS`, `TodoList` — not imported externally; used internally

**apps/web/src/components/deck/TentaclePod.tsx**
- Un-exported `STATUS_LABELS`, `TodoList` — not imported externally; used internally

**apps/web/src/components/deck/agentVisuals.ts**
- Un-exported `hashString`, `seededRandom`, `deriveAgentVisuals` — none imported externally

**apps/web/src/components/deck/octopusVisuals.ts**
- Un-exported `hashString`, `seededRandom` — not imported externally

**apps/web/src/components/EmptyAgents.tsx**
- Removed `OctopusGlyph` backward-compat alias (2 lines) — never imported from this file; all consumers import from `EmptyOctopus.tsx`

**apps/web/src/runtime/runtimeEndpoints.ts**
- Un-exported `buildConversationSearchUrl`, `buildPromptsUrl`, `buildPromptItemUrl` — not imported externally or internally

### Dead Dependencies (4 removed)
- `apps/web/package.json`: removed `qrcode` (dependency) — no usage in any source file; confirmed with `grep -r "qrcode" apps/web/src`
- `apps/web/package.json`: removed `@types/qrcode` (devDependency) — was only typing `qrcode` which was removed
- `apps/web/package.json`: removed `@types/dompurify` (devDependency) — `dompurify` ships its own types (has `"types"` field in package.json)
- `apps/landing/package.json`: removed `class-variance-authority` (dependency) — only used in `button.tsx` which was deleted
- `apps/landing/package.json`: removed `tw-animate-css` (devDependency) — no usage anywhere in landing

## Preserved Items

### False Positives (kept with reason)
- `apps/api/src/sentiphMcp.ts` — entry point listed in `vite.api.bundle.config.mts` as `"sentiph-mcp"` build entry; spawned as a process, not imported
- `apps/web/vite.api.bundle.config.mts` — referenced by build script: `vite build --config vite.api.bundle.config.mts`
- `node-pty`, `ws` in root `package.json` — runtime dependencies needed when the package is installed; listed as externals in the vite bundle config

### Conservative Keeps (not confident enough to remove)
- `apps/api/src/projectPersistence.ts` — 10 exports flagged as unused, but file has complex internal + external usage (cli.ts imports from it); left in place as the specific unused exports might be part of planned API surface
- All unused exported types in `terminalRuntime/types.ts` — type-only exports are harder to track; may be referenced by JSDoc or future code
- All other unused exported types flagged by knip — kept conservatively

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm install` | PASS | lockfile updated |
| `cd apps/web && tsc --noEmit` | PASS | |
| `cd apps/api && tsc --noEmit` | PASS | |
| `cd packages/core && tsc --noEmit` | PASS | |
| `pnpm -r test` | 11 pre-existing failures | Same 11 failures as baseline; `promptResolver.test.ts` deletion removed 1 pre-existing broken test |
| `pnpm build` | PASS | web + api bundles built successfully |
| `pnpm lint` | 100 pre-existing errors | Same error count as baseline (Biome) |

### Baseline Comparison (git stash → clean branch → run tests)
- Baseline test failures: promptResolver.test.ts (broken) + 11 in createApiServer.test.ts = 12 total failing
- After removals: 11 in createApiServer.test.ts only (promptResolver.test.ts removed) = net improvement
- No new test failures introduced
