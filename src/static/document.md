# Shared static assets

`style.css` is the stable global stylesheet URL and contains ordered imports into [styles](./styles/document.md). The component files own base layout, header, modes, workspace, sidebar, palette, canvas, menus, dialogs, file tree, notifications and connections. `header.css` also styles Electron's custom drag region and window controls; the removed HTML folder browser has no stylesheet.

The Go static filesystem checks this root before the Canvas static root. This flat fallback is retained for Canvas compatibility. New modes use `/static/<id>/` namespaces, so identical filenames do not collide. Shared registry-driven navigation lives in [studio](studio/document.md). Both HTML entry points load `/static/style.css` before `/static/canvas.css`. Shared rules have one source of truth; do not copy them back into the Canvas entry. See the [UI source audit](../Canvas/static/document.md) for migration details and verification commands.
