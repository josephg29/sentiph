# Operations Notes

## Troubleshooting

- If `pnpm test` fails with missing browser APIs, ensure the `jsdom` dependency is installed.
- If workspace package resolution fails, run `pnpm install` from the repository root (not inside a subpackage).
- If Node version is older than 22, switch runtime before running commands.

## Known limitations (scratch baseline)

- Web app expects `GET /api/agent-snapshots` and defaults to an empty state when no agents are returned.
- No backend API implementation yet.
- No persistence or auth layer yet.
