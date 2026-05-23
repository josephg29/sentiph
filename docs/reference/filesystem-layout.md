# Filesystem Layout

Sentiph splits files by ownership. Agent-facing project context stays in the workspace. Runtime-owned state stays in the per-project global state directory.

## Project-local files

`.sentiph/` is created in the workspace.

Main paths:

- `.sentiph/project.json`
- `.sentiph/sessions/`
- `.sentiph/worktrees/`

`project.json` holds the stable project ID used to find global state. The sessions folder is intended for agent-readable markdown. Worktrees are generated execution checkouts and should not be treated as context storage.

Session example:

```text
.sentiph/
  sessions/
    api-backend/
      CONTEXT.md
      todo.md
      routes.md
```

`CONTEXT.md` may end with a managed `Suggested Skills` block when the operator or planner attaches Claude Code skills to that session.

Deck also writes UI metadata for sessions, but not into these markdown files. Color, status, appearance, paths, and tags are stored in global deck state.

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
- `deck.json`
- `transcripts/<sessionId>.jsonl`
- `monitor-config.json`
- `monitor-cache.json`
- `code-intel.jsonl`

`sessions.json` is the terminal registry despite the historical name. It stores terminal records, lifecycle state, UI state, parent-child links, workspace mode, worktree IDs, and display names.

`deck.json` stores Deck presentation metadata that is not part of the agent-facing session files.

`transcripts/*.jsonl` stores conversation transcript events separately from PTY scrollback. Scrollback is in memory and bounded; transcripts are persisted.

## Prompt storage

- core prompts are synced from `prompts/`
- synced copies live in `.sentiph/prompts/core/`
- user prompts live in `.sentiph/prompts/`

## Practical rule

If something is agent-facing context, keep it in the session folder.

If something is runtime-owned state, expect it under the global project state directory.

If something is an isolated execution checkout, expect it under `.sentiph/worktrees/` and treat its branch lifecycle as part of the terminal that created it.
