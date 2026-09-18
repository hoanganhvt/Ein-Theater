# HTML template entry points

## Responsibility and rendering

These files provide static UI markup. The Go template renderer composes include comments before responding; JavaScript then binds behavior through the existing element IDs and global handler bridge. Includes are relative to the containing file and can be nested. All fragments are read before a successful response is sent. Do not load a partial as a standalone page.

## Files and DOM ownership

### [canvas.html](./canvas.html)

Document shell or sidebar entry point; delegates component markup to named partials.

Owned element IDs: `modalOverlay`.

Composition order: [canvas/header.html](./canvas/header.html), [canvas/workspace.html](./canvas/workspace.html), [canvas/context-menu.html](./canvas/context-menu.html), [canvas/folder-browser.html](./canvas/folder-browser.html), [canvas/add-node.html](./canvas/add-node.html), [canvas/edit-node.html](./canvas/edit-node.html), [canvas/edit-edge.html](./canvas/edit-edge.html).

### [sidebar.html](./sidebar.html)

Document shell or sidebar entry point; delegates component markup to named partials.

Owned element IDs: `canvasSidebar`.

Composition order: [sidebar/workspace.html](./sidebar/workspace.html), [sidebar/projects.html](./sidebar/projects.html), [sidebar/palette.html](./sidebar/palette.html).

## Component folders

- [canvas](./canvas/document.md)
- [sidebar](./sidebar/document.md)

## Editing contract

Preserve unique element IDs: the JavaScript modules query them directly. Preserve the root overlay and sidebar mount; dialogs coordinate overlay visibility and the sidebar loader inserts the composed sidebar response. Inline handlers must be registered in `src/Canvas/static/js/application/handlers.js`. The studio and standalone page variants have intentional differences; check both when changing shared behavior. The studio's two pre-existing missing connection-type callbacks are documented in the UI source audit.

Run `node src/Canvas/static/js/ui.test.mjs` from the repository root for handler contracts and `go test ./...` from `src` for composition, route and asset checks. The pages must render without unresolved include comments.
