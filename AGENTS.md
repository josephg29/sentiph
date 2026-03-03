# AGENTS.md

**This is a living project guide.** Record user preferences, development style, and workflows here. After solving tasks, add or refine guidance when it would help future work. Prefer concrete, reusable notes over one-off task details. Keep entries concise, actionable, and specific. Remove stale guidance and avoid duplicating information that already exists in canonical docs.

**This file is for general principles and preferences.** Project-specific context (what's implemented, architecture decisions, roadmap) belongs in `context/`. See [Long-term Project Context](#long-term-project-context) below. 

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
- **Biome** — Linting and formatting.

## Rules

### Don't Jump Right to Coding

Before writing any code, have a conversation to understand the developer's intent and approach. If anything about the task is ambiguous, ask clarifying questions. Once the approach is agreed upon, start small and iterate (see [Progressive Implementation](#progressive-implementation)).

### Close the Loop

**Bug fixes:** Write a test that reproduces the issue first. Implement the fix. Run the test again to confirm it passes.

**New features:** Write tests before changing the codebase. The tests are your roadmap. Implement incrementally, running tests as you go.

### Take To-do Lists Seriously

To avoid forgetting parts of the implementation and missing important steps, maintain a to-do list, update it frequently, and check items off as you go.

### Think in Systems

When implementing features, identify shared parent components rather than creating variations. If multiple UI components share similar structure (windows, panels, cards), implement the base component once and compose variations from it. The same applies to programmatic logic — extract common patterns into shared utilities or base classes. Before writing new code, check if existing components can be extended or composed to achieve the same goal.

### Frontend File Modularity Preference

Keep top-level React containers focused on orchestration. Move pure constants/types/parsers into `src/app/*` modules and move large JSX blocks into dedicated `src/components/*` files with typed props. Avoid growing single files into multi-responsibility modules.

### Stylesheet Modularity Preference

Keep `src/styles.css` as an import manifest and split CSS into focused modules under `src/styles/*` (foundation, chrome, sidebar, board, terminal, console overrides). Use semantic file names (not numbered prefixes) and preserve import order to avoid unintended cascade changes.

### Tentacle Layout Preference

For pane-based UI layout, keep each tentacle as a full-height column. Spawned agents for that tentacle should stack vertically within the same column (below the tentacle/root pane), while other tentacle columns remain on the left and right sides.

### Tentacle Focus Mode Preference

For focused/selected tentacles, use border-color change only as the visual cue. Avoid glow halos, pulsing effects, and lift/translate effects.

### Main Board Consistency Preference

In major UI redesigns, keep the main content board as identical side-by-side tentacle windows. Preserve horizontal scrolling and divider-based resizing behavior across redesigns.

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

### Tentacle ID Allocation Preference

Allocate new tentacle IDs by computing the smallest available numeric suffix from live state (persisted tentacles, existing worktree directories, and active terminal sessions). Do not rely on a persisted monotonic counter.

### Confirmation UX Preference

Do not use browser alert/confirm dialogs for destructive actions. Use in-app confirmation UI that matches the retro terminal visual style.

### Sidebar Resize Preference

Do not render a dedicated resize strip between the Active Agents sidebar and the main board. The sidebar should remain resizable by dragging its own right border.

### Sidebar Status Badge Preference

In the Active Agents sidebar, root agent rows should use the same `idle`/`processing` badge style and state semantics as the terminal window header.

### Sidebar Section UX Preference

Structure the left sidebar as reusable sections with collapsible headers. Keep section headers visually prominent and use slightly roomier paddings to improve scanability.

### Sidebar Action Panel Preference

For tentacle action workflows (for example worktree Git actions and delete/cleanup confirmations), render the interaction inside the left sidebar as an action panel instead of modal/backdrop overlays. The action panel should replace the default sidebar sections while active and include a close control at the top that returns the sidebar to its default state.

### Sidebar Visual Contrast Preference

Keep the left sidebar mostly neutral (deep slate/gray surfaces) and reserve accent color for active/focus indicators, meter fills, and warning/error states instead of large header backgrounds.

### Sidebar Padding Preference

Keep the left sidebar container flush with no outer padding (body, action panel, and footer wrappers should be edge-to-edge).

### Frontend UI Persistence Preference

Persist frontend layout/preferences in the runtime registry JSON (`.octogent/state/tentacles.json`, `uiState`) via API endpoints, not browser-only storage.

### Monitor Query-Term Source Preference

Do not hardcode monitor search/query terms in code. Keep query terms operator-defined and persisted in `.octogent/state/monitor-config.json`, with runtime behavior loading/changing terms only through that filesystem-backed config.
Run monitor retrieval as separate provider searches per configured query term, and keep returned-post count configurable via persisted monitor refresh policy (not hardcoded top-N in code).
Keep monitor search timeframe operator-configurable (`7D`/`3D`/`1D`) with `7D` as the persisted default in monitor refresh policy.

### Codex Usage Placement Preference

Show Codex usage in the `Active Agents` sidebar footer (bottom of the left sidebar), not in the top chrome bar. Keep it visually consistent with existing terminal/sidebar chrome styling.
Use a retro terminal-style token usage bar presentation (meter rows for short-window and weekly usage plus credits).

### Settings Visibility Controls Preference

Expose runtime status strip visibility, monitor workspace visibility, and bottom telemetry ticker visibility as explicit toggles in the Settings page, and persist all in frontend `uiState`.
When toggling optional shell sections (status strip/telemetry), anchor shell regions to explicit CSS grid rows to avoid layout shifts from DOM-order auto-placement.

### Preserve Existing Patterns

Before implementing a feature, read similar existing code to understand established patterns (component structure, state management, API design). Match the existing style and architecture unless there's a compelling reason to deviate.

### UI Prototyping Baseline

When refining the web visual system in `test-page.html`, keep using shared design tokens and reusable primitives (chrome, badges, tabs, input bars, density presets) rather than ad hoc one-off styles.

### Brand Typography Preference

Use `PP Neue Machina Plain` as the primary UI font for web chrome, controls, and headers. Keep terminal/session output on readable monospace fonts for alignment-sensitive content.

### UI Legibility Preference

Avoid tiny control text. Keep the global web UI base font size and terminal font size large enough for comfortable reading, and scale from shared tokens instead of ad hoc per-component overrides.

### Monitor Configure UX Preference

Keep Monitor Configure controls in a single unified view (not split into separate cards), with one primary save action and compact grouped fields/chips to reduce visual clutter.
Use column-based layout to fill the available panel width while keeping individual controls readable, and show token state as a green `Saved` badge (without displaying token hints/previews).
For option picking (like timeframe), prefer custom in-app segmented selectors over native browser `<select>` dropdown popups.

### Scrollbar Consistency Preference

Treat scrollbar styling as a universal console concern: apply it through shared shell-level selectors so new scrollable surfaces (including monitor resources) inherit automatically without per-view overrides.

### Terminal Surface Preference

Keep the terminal surface dark but not pure black; prefer a deep slate background for long-session readability.

### Terminal Gutter Preference

For tentacle window terminals, keep the window surface flush with no inner mount padding.

### Chrome Density Preference

Keep the top chrome bar compact: smaller vertical padding and tighter control spacing over roomy header sizing.
Keep top chrome action button labels comfortably legible (avoid tiny CTA text); prefer slightly larger label size even in dense mode.

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

## Documentation

This is an open-source project. Actively maintain documentation in a `docs/` folder following standard documentation practices. This includes:

- **README** at repo root with project purpose, quickstart, and common workflows.
- **CONTRIBUTING** guide covering local setup, testing, and PR expectations.
- **Usage guides** for end users.
- **API documentation** where applicable.
- **Architecture overview** for developers working on the codebase.
- **Operational docs** for maintainers (runbooks/troubleshooting/known limitations).
- **Agent-facing docs** explaining repository conventions, task workflows, and coding/testing expectations for automated coding agents.

Keep docs in sync with the code — when a feature changes, update its documentation in the same PR.
Treat missing or stale docs as a quality issue, not optional cleanup.

## Long-term Project Context

Maintain an `context/` folder as your persistent notepad for project-specific development context. This folder is your memory across sessions — use it to track what's been implemented, architectural decisions and their rationale, known issues and workarounds, planned work for future releases, and anything else you'll need to recall in later sessions.

- Keep an `index.md` in this folder as a table of contents for easy navigation.
- Create separate markdown files for distinct topics (e.g., `auth_issue.md`, `architecture.md`, `roadmap.md`, `decisions.md`).
- Update these files proactively as the project evolves — don't wait to be asked.
