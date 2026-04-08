# CLAUDE.md

**This is a living project guide.** Record user preferences, development style, and workflows here. After solving tasks, add or refine guidance when it would help future work. Prefer concrete, reusable notes over one-off task details. Keep entries concise, actionable, and specific. Remove stale guidance and avoid duplicating information that already exists in canonical docs.

**This file is authoritative for development rules, conventions, and preferences.** High-level product principles live in `context/principles.md`. Project-specific context (what's implemented, architecture decisions, roadmap) belongs in `context/`. See [Long-term Project Context](#long-term-project-context) below.

## Tech Stack & Environment

### Language & Runtime
- **TypeScript** — Primary project language.
- **Node.js 22+** — Runtime target.

### Current Direction
- **Web-first product direction** with a **Vite + React** frontend as the default UI approach.
- **Backend organization:** use a ports-and-adapters separation for testability:
  - pure core/application logic
  - interface-based ports for system boundaries
  - adapters for real implementations and test fakes
  - thin API and UI layers that depend on use-cases, not infrastructure internals

### Build & Dev
- **pnpm** — Package manager.
- **tsx** — Run TypeScript directly in development.

### Testing
- **Vitest** — Test runner.

### Linting & Formatting
- **Biome** — Linting and formatting (100-char line width, 2-space indent, organize imports).

### TypeScript Strictness
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are enabled in `tsconfig.base.json`.

## Rules

### Don't Jump Right to Coding

Before writing any code, have a conversation to understand the developer's intent and approach. If anything about the task is ambiguous, ask clarifying questions. Once the approach is agreed upon, start small and iterate (see [Progressive Implementation](#progressive-implementation)).

### Close the Loop

**Bug fixes:** Write a test that reproduces the issue first. Implement the fix. Run the test again to confirm it passes.

**New features:** Write tests before changing the codebase. The tests are your roadmap. Implement incrementally, running tests as you go.

### Think in Systems

When implementing features, identify shared parent components rather than creating variations. If multiple UI components share similar structure (windows, panels, cards), implement the base component once and compose variations from it. The same applies to programmatic logic — extract common patterns into shared utilities or base classes. Before writing new code, check if existing components can be extended or composed to achieve the same goal.

### Frontend File Modularity Preference

Keep top-level React containers focused on orchestration. Move pure constants/types/parsers into `src/app/*` modules and move large JSX blocks into dedicated `src/components/*` files with typed props. Avoid growing single files into multi-responsibility modules.

### Stylesheet Modularity Preference

Keep `src/styles.css` as an import manifest and split CSS into focused modules under `src/styles/*` (foundation, chrome, sidebar, board, terminal, console overrides). Use semantic file names (not numbered prefixes) and preserve import order to avoid unintended cascade changes.

### Terminal Layout Preference

Each terminal is a full-height column (1:1 terminal-to-column). A tentacle is a conceptual context/folder that multiple terminals can reference — it is no longer the visual column unit. Terminal columns are arranged side by side and scroll horizontally when they exceed available space.

### Product Domain Copy Preference

UI language should match an agent coding/engineering dashboard (agents, sessions, worktrees, logs, pipelines), not finance-specific terminology. If a shell section needs live-like telemetry that is not yet wired to real backend data, use clearly dummy placeholder values.

### Tentacle Naming Preference

Treat `tentacleId` as a stable internal identifier (routing, keys, websocket paths) and keep user-facing labels editable via a separate display name field.

### Tentacle Workspace Isolation Preference

Tentacle creation should offer two explicit modes: shared main codebase (`workspaceMode: "shared"`) and isolated git worktree (`workspaceMode: "worktree"`). Keep shared as the compatibility default when no mode is provided.

### Worktree Git Lifecycle UX Preference

For `workspaceMode: "worktree"` tentacles, keep git lifecycle operations in the tentacle header behind a single `Git` action that opens in-app controls (commit/push/sync and status), instead of scattering multiple standalone header buttons or using browser-native dialogs.
Keep worktree git badges (dirty/ahead-behind/PR state) visually grouped with the `Git` button in a centered tentacle-header cluster for quick scanning.
Keep the Worktree Git Actions status block compact and high-contrast as a dense definition list (label/value rows), not tile cards.
Prefer line-diff totals (`+insertions/-deletions`) over changed-file count in Worktree Git Actions stats, and render ahead/behind as colored numbers separated by `/`.
Structure the Worktree Git Actions dialog around action rows where each input lives beside its action button, and show blocked reasons inline per action instead of a global disabled-reasons list.
Model commit UX after VSCode Source Control: message composer plus a split commit button with a dropdown for secondary actions (`commit & push`, `push`, `sync`).
Keep the split commit control full-width with a filled green primary button, and anchor the dropdown directly under the split control row.
Do not create pull requests in-app; keep PR creation user-driven in GitHub, while still surfacing PR state and allowing merge when a branch PR exists.
Keep pull-request lifecycle controls (`merge` and current PR state) in that same in-app Git actions surface for worktree tentacles.
Surface pull-request state in the worktree tentacle header badges (`open`/`merged`/`closed` with PR number when available) so operators can scan lifecycle state without opening dialogs.
When git actions are disabled in the worktree Git dialog, render explicit in-dialog blocked-action reasons instead of leaving disabled states unexplained.
Reject duplicate pull-request creation server-side when the branch already has an open PR (returning conflict), rather than silently creating/replacing PR state.
For destructive worktree cleanup, require explicit in-app confirmation by asking the user to type the tentacle ID before enabling the final action.

### Confirmation UX Preference

Do not use browser alert/confirm dialogs for destructive actions. Use in-app confirmation UI that matches the retro terminal visual style.

### Sidebar Action Panel Preference

For tentacle action workflows (for example worktree Git actions and delete/cleanup confirmations), render the interaction inside the left sidebar as an action panel instead of modal/backdrop overlays. The action panel should replace the default sidebar sections while active and include a close control at the top that returns the sidebar to its default state.

### Frontend UI Persistence Preference

Persist frontend layout/preferences in the runtime registry JSON (`.octogent/state/tentacles.json`, `uiState`) via API endpoints, not browser-only storage.

### Monitor Query-Term Source Preference

Do not hardcode monitor search/query terms in code. Keep query terms operator-defined and persisted in `.octogent/state/monitor-config.json`, with runtime behavior loading/changing terms only through that filesystem-backed config.
Run monitor retrieval as separate provider searches per configured query term, and keep returned-post count configurable via persisted monitor refresh policy (not hardcoded top-N in code).
Keep monitor search timeframe operator-configurable (`7D`/`3D`/`1D`) with `7D` as the persisted default in monitor refresh policy.

### Preserve Existing Patterns

Before implementing a feature, read similar existing code to understand established patterns (component structure, state management, API design). Match the existing style and architecture unless there's a compelling reason to deviate.

### Brand Typography Preference

Use `PP Neue Machina Plain` as the primary UI font for web chrome, controls, and headers. Keep terminal/session output on readable monospace fonts for alignment-sensitive content.

### UI Legibility Preference

Avoid tiny control text. Keep the global web UI base font size and terminal font size large enough for comfortable reading, and scale from shared tokens instead of ad hoc per-component overrides.

### Terminal Header Controls Preference

Use compact icon-first controls in terminal headers: add actions should stay glyph-based (`>_↑`/`>_↓`) with readable sizing/padding, delete should use a trash icon, and all user-visible terminals should be peer-level and deletable.
Render each terminal header title from the terminal's agent label/ID (for example `tentacle-1-agent-1`) rather than a generic `terminal` placeholder.

### Terminal Focus Mode Preference

Highlight the active terminal by switching only that terminal header to the accent orange styling (no pane glow, halo, lift, or extra badge).

### Progressive Implementation

Implement features incrementally — get the simplest version working first, then iterate and enhance. Avoid big-bang implementations that try to do everything at once. This makes debugging easier, allows for early feedback, and reduces the risk of major refactoring.

### Implement Features Atomically

Follow an atomic test-driven plan. Start with a simple test to pin down the approach, then develop further. Each increment should leave the codebase in a working state.

### Question Your Assumptions

When debugging, verify your mental model matches reality. Read the actual code being executed, check logs, and reproduce issues before proposing fixes. Don't assume you know what's happening. Act like a senior developer.

### Think About Edge Cases

Before implementing or modifying code, explicitly consider edge cases and future scenarios: empty arrays, null values, concurrent requests, large datasets, network failures. Handle error states gracefully. Design with extensibility in mind without over-engineering.

### Security First

Always consider security implications before implementing features. Think about input validation, authentication, authorization boundaries, SQL injection, XSS, CSRF, and other common vulnerabilities. If you identify a potential security issue, flag it explicitly and propose secure alternatives.

### Comments Explain Why, Not What

Never write comments that repeat what the code does — the code should be self-explanatory. Add comments only to explain non-obvious reasoning, document why a particular approach was chosen, or note important constraints and edge cases.

### Leave Breadcrumbs

When implementing complex logic, add concise comments explaining why decisions were made. Link to relevant issues, RFCs, or documentation. This helps future maintainers understand constraints and avoid "fixing" intentional behavior.

## Documentation & Context

- **`CLAUDE.md` (this file)** — Authoritative source for development rules, coding conventions, architecture details, and agent behavior preferences. All agents read this first.
- **`docs/`** — End-user and contributor documentation. Keep in sync with the code; update docs in the same PR as feature changes.
- **`context/`** — Your (the coding agent's) persistent notepad across sessions: decisions, recipes, and open work. See `context/index.md` for navigation.
  - **`context/principles.md`** — High-level product vision and project-level principles (what we build and why). Does not duplicate the development rules in this file.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Run API + web dev servers (auto-discovers port from 8787)
pnpm build            # Build all packages
pnpm test             # Run all tests (Vitest)
pnpm lint             # Lint with Biome
pnpm format           # Format with Biome
```

Run a single test file:
```bash
pnpm --filter @octogent/api exec vitest run tests/requestParsers.test.ts
pnpm --filter @octogent/core exec vitest run tests/buildTentacleColumns.test.ts
```

## Architecture

Octogent is a web-first command surface for running multiple coding agents in parallel. It's a **pnpm monorepo** (Node.js 22+, TypeScript strict mode) with three packages:

- **`packages/core`** — Framework-agnostic domain types and application logic (ports-and-adapters pattern). No React/HTTP dependencies. Both apps depend on this.
- **`apps/api`** — Node.js HTTP/WebSocket server managing PTY sessions via node-pty, tentacle lifecycle, git worktrees, conversation transcripts, and monitor service.
- **`apps/web`** — Vite + React 19 operator UI with modular CSS.

### Key domain concepts

- **TerminalSnapshot**: Immutable terminal state (`live`/`idle`/`queued`/`blocked`) with `terminalId`, `tentacleId`, and optional `workspaceMode`.
- **Terminal**: A single visual column. A tentacle is a conceptual context/folder that multiple terminals can reference.

### Runtime layers

- **Orchestration** (`createApiServer.ts`, `terminalRuntime.ts`, `App.tsx`): Thin entry points wiring dependencies.
- **Core logic** in `packages/core/src/` (domain types, application functions like `buildTerminalList`).
- **API adapters** in `apps/api/src/` (request handler, PTY session runtime, registry, worktree manager, conversation storage).
- **UI modules** in `apps/web/src/` — pure app logic in `app/` (hooks, normalizers, constants), components organized by feature in `components/` (sidebar, board, terminal, dialogs), reusable primitives in `components/ui/`.

### Persistence

All runtime state lives under `.octogent/`:
- `state/tentacles.json` — Tentacle registry + UI state (source of truth)
- `state/transcripts/<sessionId>.jsonl` — Conversation events
- `worktrees/<tentacleId>` — Git worktree directories

### Security model

- **Local-only by default**: Binds to 127.0.0.1; remote access requires `OCTOGENT_ALLOW_REMOTE_ACCESS=1`.
