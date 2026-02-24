# Agent Workflow Notes

This repository expects incremental, test-first changes.

## Workflow

- Add or update tests before behavior changes.
- Keep ports and adapters separated from UI/infrastructure internals.
- Prefer extending shared primitives over creating one-off structures.
- Update `docs/` and `context/` within the same change set.
