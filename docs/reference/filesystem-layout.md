# Filesystem Layout

Sentiph splits files by ownership. Agent-facing project files stay in the workspace. Runtime-owned state stays in the per-project global state directory.

## Project-local files

`.sentiph/` is created in the workspace.

Main paths:

- `.sentiph/project.json`
- `.sentiph/tentacles/`
- `.sentiph/worktrees/`

`project.json` holds the stable project ID used to find global state. The sessions folder is intended for agent-readable markdown. Worktrees are generated execution checkouts and should not be treated as state storage.

Session example:

```text
.sentiph/
  sessions/
    api-backend/
      CONTEXT.md
      routes.md
```

`CONTEXT.md` may end with a managed `Suggested Skills` block when the operator or planner attaches Claude Code skills to that session.

Project-local Claude Code skills, when present, live under:

```text
.claude/
  skills/
    some-skill/
      SKILL.md
```

## Global state

Per-project runtime state is stored under:

```text
~/.sentiph/projects/<project-id>/state/
```

Notable files:

- `sessions.json`
- `transcripts/<sessionId>.jsonl`

`sessions.json` is the terminal registry despite the historical name. It stores terminal records, lifecycle state, UI state, parent-child links, workspace mode, worktree IDs, and display names.

`transcripts/*.jsonl` stores conversation transcript events separately from PTY scrollback. Scrollback is in memory and bounded; transcripts are persisted.

## Prompt storage

- core prompts are synced from `prompts/`
- synced copies live in `.sentiph/prompts/core/`
- user prompts live in `.sentiph/prompts/`

## Practical rule

If something is agent-facing state, keep it in the session folder.

If something is runtime-owned state, expect it under the global project state directory.

If something is an isolated execution checkout, expect it under `.sentiph/worktrees/` and treat its branch lifecycle as part of the terminal that created it.
