# Usage Guide

## Run local app

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:5173`.

`pnpm dev` starts both the web app and API service. By default the API listens on `127.0.0.1:8787` and the web app proxies `/api` traffic to it.

## Active Agents dashboard deck

- The left sidebar shows `Active Agents` grouped by tentacle.
- Each tentacle section lists its current agents and state badges.
- Show/hide from the top bar sidebar icon toggle button.
- Resize on desktop by dragging the divider or focusing it and using `ArrowLeft` / `ArrowRight`.

## Create tentacles

- Use the top bar `New tentacle` button to spawn a new tentacle.
- Tentacles keep unique incremental ids (`tentacle-1`, `tentacle-2`, ...) for internal routing, plus a separate display name you can edit.
- New tentacles appear with the default name selected inline so you can type a new name immediately.
- Rename by clicking a tentacle header name or the right-side `Rename` button, then edit inline (`Enter` to save, `Escape` to cancel).
- Each new tentacle starts with a root coding terminal session bootstrapped with `codex`.
- The board keeps each tentacle column above a minimum width and scrolls horizontally when columns exceed available space.
- Resize neighboring tentacles with the divider between columns (drag with pointer or use focused divider with arrow keys).

## Run quality checks

```bash
pnpm test
pnpm lint
pnpm build
```
