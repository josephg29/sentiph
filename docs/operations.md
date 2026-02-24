# Operations Notes

## Troubleshooting

- If `pnpm test` fails with missing browser APIs, ensure the `jsdom` dependency is installed.
- If workspace package resolution fails, run `pnpm install` from the repository root (not inside a subpackage).
- If Node version is older than 22, switch runtime before running commands.

## Known limitations (scratch baseline)

- Dev mode API is implemented by a Vite plugin and is non-persistent.
  - `GET /api/agent-snapshots` returns synthetic live tentacles.
  - `WS /api/terminals/:tentacleId/ws` streams interactive shell sessions.
- Production backend API and auth are not implemented yet.
- No persistence or auth layer yet.
