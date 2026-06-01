# Quickstart

This is the shortest useful path through the project.

## 1. Start the app

For local development:

```bash
pnpm install
pnpm dev
```

For a local global CLI install from a clone:

```bash
pnpm install
pnpm build
npm install -g .
sentiph
```

Sentiph is not published to npm yet, so `npm install -g sentiph` is not currently a valid quick start path.

## 2. Create or inspect a session

If the app is already running, you can create a session from the CLI:

```bash
sentiph tentacle create api-backend --description "API runtime and request handling"
```

Or use the Deck view in the UI.

Each session becomes a folder under `.sentiph/sessions/<session-id>/`.

## 3. Let the agent build the local session

The session files are where the job keeps its state:

- `CONTEXT.md` for the local model of that area
- extra markdown files for notes, architecture, handoff, or examples

You do not need to treat these as manual setup that the developer always writes by hand. One of the points of Sentiph is that **Claude Code** can help create, update, and maintain these files from inside the app as the work becomes clearer.

## 4. Create a terminal

```bash
sentiph terminal create --name "API worker" --session-id api-backend
```

Use `--workspace-mode worktree` if you want an isolated git worktree.

## 5. Send a message

```bash
sentiph channel send terminal-2 "Need review on the request parser changes"
```

## What to verify

- the session folder exists
- the terminal appears in the UI
- `CONTEXT.md` exists for that session
- messages show up in the target terminal channel

## Next reading

- [Mental Model](../concepts/mental-model.md)
- [Sessions](../concepts/sessions.md)
