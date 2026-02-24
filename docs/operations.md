# Operations Notes

## Troubleshooting

- If `pnpm test` fails with missing browser APIs, ensure the `jsdom` dependency is installed.
- If workspace package resolution fails, run `pnpm install` from the repository root (not inside a subpackage).
- If Node version is older than 22, switch runtime before running commands.

## Known limitations (scratch baseline)

- Runtime API is non-persistent (all state is in-memory).
  - `GET /api/agent-snapshots` returns active in-memory tentacle root agents (with optional `tentacleName` display labels).
  - `POST /api/tentacles` creates a new tentacle session, optionally with `{ "name": string }`.
  - `PATCH /api/tentacles/:tentacleId` renames an existing tentacle display name.
  - `DELETE /api/tentacles/:tentacleId` deletes an existing tentacle session.
  - `WS /api/terminals/:tentacleId/ws` streams interactive shell sessions.
- Production backend API and auth are not implemented yet.
- No persistence or auth layer yet.
