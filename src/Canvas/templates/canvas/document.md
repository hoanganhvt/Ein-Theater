# Standalone Canvas page partials

## Responsibility and rendering

These files provide static UI markup. The Go template renderer composes include comments before responding; JavaScript then binds behavior through the existing element IDs and global handler bridge. Includes are relative to the containing file and can be nested. All fragments are read before a successful response is sent. Do not load a partial as a standalone page.

## Files and DOM ownership

### [add-node.html](./add-node.html)

Category/search controls, layer preview and add-node actions.

Owned element IDs: `nodeModal`, `nodeSearchInput`, `nodeCategory`, `nodeType`, `nodePreviewCard`, `nodePreviewBadge`, `nodePreviewCategory`, `nodePreviewLabel`, `nodePreviewCode`, `customNodeDiv`, `customNodeName`.

### [context-menu.html](./context-menu.html)

Right-click actions and mode submenus.

Owned element IDs: `contextMenu`, `cmModeParent`, `cmSubmenu`, `cmCheckSelect`, `cmCheckAdd`, `cmCheckConnect`, `cmCheckMove`, `cmInvertFold`, `cmEdit`, `cmEditText`, `cmCopy`, `cmCopyText`, `cmPaste`, `cmPasteText`, `cmDelete`, `cmDeleteText`.

### [edit-edge.html](./edit-edge.html)

Connection editor and routing selection.

Owned element IDs: `editEdgeModal`, `editEdgeNodesBanner`, `editEdgeFromLabel`, `editEdgeToLabel`, `editEdgeFoldSelect`.

### [edit-node.html](./edit-node.html)

Parameter-editor mount and save/cancel actions.

Owned element IDs: `editLayerModal`, `editLayerTypeBadge`, `editParamsContainer`.

### [folder-browser.html](./folder-browser.html)

Directory-picker dialog, path entry and directory/drive mounts.

Owned element IDs: `selectFolderModal`, `folderPathInput`, `folderDrivesBar`, `folderBrowserList`, `confirmFolderBtn`.

### [header.html](./header.html)

File menu, title editor, mode navigation and primary actions.

Owned element IDs: `fileMenuBtn`, `fileMenuDropdown`, `menuWorkingDir`, `modelTitle`, `modelTitleInput`, `appModeTabs`, `headerEdgeToolbar`, `headerEdgeTitle`, `headerEdgeNodes`, `btnSaveModel`.

### [workspace.html](./workspace.html)

Sidebar mount and graph canvas with selection/banner elements.

Owned element IDs: `appWorkspace`, `sidebarSlot`, `mynetwork`, `selectionBox`, `modeBanner`.

## Editing contract

Preserve unique element IDs: the JavaScript modules query them directly. Preserve the root overlay and sidebar mount; dialogs coordinate overlay visibility and the sidebar loader inserts the composed sidebar response. Inline handlers must be registered in `src/Canvas/static/js/application/handlers.js`. The studio and standalone page variants have intentional differences; check both when changing shared behavior. The studio's two pre-existing missing connection-type callbacks are documented in the UI source audit.

Run `node src/Canvas/static/js/ui.test.mjs` from the repository root for handler contracts and `go test ./...` from `src` for composition, route and asset checks. The pages must render without unresolved include comments.
