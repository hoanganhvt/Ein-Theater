# Canvas sidebar partials

## Responsibility and rendering

These files provide static UI markup. The Go template renderer composes include comments before responding; JavaScript then binds behavior through the existing element IDs and global handler bridge. Includes are relative to the containing file and can be nested. All fragments are read before a successful response is sent. Do not load a partial as a standalone page.

## Files and DOM ownership

### [palette.html](./palette.html)

Fundamental-layer palette mount.

Owned element IDs: `paletteList`.

### [projects.html](./projects.html)

Project-list mount and new-model action.

Owned element IDs: `projectList`.

### [workspace.html](./workspace.html)

Working-directory heading and file-tree mount.

Owned element IDs: `sidebarWorkingDirName`, `sidebarWorkingDirPath`, `workspaceFileList`.

## Editing contract

Preserve unique element IDs: the JavaScript modules query them directly. Preserve the root overlay and sidebar mount; dialogs coordinate overlay visibility and the sidebar loader inserts the composed sidebar response. Inline handlers must be registered in `src/Canvas/static/js/application/handlers.js`. The studio and standalone page variants have intentional differences; check both when changing shared behavior. The studio's two pre-existing missing connection-type callbacks are documented in the UI source audit.

Run `node src/Canvas/static/js/ui.test.mjs` from the repository root for handler contracts and `go test ./...` from `src` for composition, route and asset checks. The pages must render without unresolved include comments.
