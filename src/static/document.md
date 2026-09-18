# Shared static assets

`style.css` is the stable global stylesheet URL and contains ordered imports into [styles](./styles/document.md). The component files own base layout, header, modes, workspace, sidebar, palette, canvas, menus, dialogs, file tree, folder browser, notifications and connections.

The Go static filesystem checks this root before the Canvas static root. Therefore feature paths must remain unique; use `styles/` here and `canvas-styles/` for Canvas overrides. Both HTML entry points load `/static/style.css` before `/static/canvas.css`. Shared rules have one source of truth; do not copy them back into the Canvas entry. See the [UI source audit](../Canvas/static/document.md) for migration details and verification commands.
