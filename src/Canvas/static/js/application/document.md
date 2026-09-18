# Application startup and HTML event bridge

## Responsibility

`handlers.js` installs the existing inline HTML handlers on `window`. `bootstrap.js` initializes schemas, the sidebar, projects and workspace, then loads the graph and installs canvas interactions and keyboard shortcuts. The root `app.js` waits for DOM readiness. Keep registration separate from initialization: importing a feature must not start the application.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [bootstrap.js](./bootstrap.js) | Ordered startup and save keyboard shortcut. |
| [handlers.js](./handlers.js) | Public window bridge for existing inline HTML event handlers. |

## Module contracts

### bootstrap.js

Exports: `initApp`.

Dependencies: [../schemas.js](../schemas.js), [../projects.js](../projects.js), [../graph.js](../graph.js), [../modes.js](../modes.js), [../modals.js](../modals.js), [../palette.js](../palette.js), [../sidebarLoader.js](../sidebarLoader.js), [../selection.js](../selection.js), [../contextMenu.js](../contextMenu.js), [../workspace.js](../workspace.js), [../clipboard.js](../clipboard.js).

### handlers.js

Exports: `invertSelectedEdgeFold`, `cycleSelectedEdgeFold`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../projects.js](../projects.js), [../graph.js](../graph.js), [../modes.js](../modes.js), [../modals.js](../modals.js), [../sidebarLoader.js](../sidebarLoader.js), [../contextMenu.js](../contextMenu.js), [../workspace.js](../workspace.js), [../circuit.js](../circuit.js), [../clipboard.js](../clipboard.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../../app.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
