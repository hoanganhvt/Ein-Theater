# Workspace explorer, folder selection and model persistence

## Responsibility

`sidebar.js` initializes workspace state and renders the file tree. `browser.js` owns the folder-picker navigation state, typed paths, native picker and folder creation inside the modal. `menu.js` controls the File dropdown. `models.js` saves and loads model packages, refreshes the project list and graph and displays status through `notifications.js`. Paths remain backend-managed; the UI must use API responses for directory and model metadata.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [browser.js](./browser.js) | Folder selection dialog, navigation, native chooser and folder creation. |
| [menu.js](./menu.js) | File-menu toggling and dismissal. |
| [models.js](./models.js) | Save/load workflows and project/graph refresh. |
| [notifications.js](./notifications.js) | Transient toast rendering. |
| [sidebar.js](./sidebar.js) | Workspace indicators, file tree initialization and sidebar folder creation. |

## Module contracts

### browser.js

Exports: `openSelectFolderModal`, `closeSelectFolderModal`, `browseTo`, `browseParentFolder`, `applyTypedPath`, `confirmSelectFolder`, `browseSystemFolder`, `promptCreateFolderModal`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../utils.js](../utils.js), [./sidebar.js](./sidebar.js), [./menu.js](./menu.js), [./models.js](./models.js).

### menu.js

Exports: `toggleFileMenu`, `closeFileMenu`.

No module dependencies.

### models.js

Exports: `saveActiveModel`, `loadModelFromFolder`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../graph.js](../graph.js), [../projects.js](../projects.js), [./browser.js](./browser.js), [./sidebar.js](./sidebar.js), [./notifications.js](./notifications.js).

### notifications.js

Exports: `showToast`.

No module dependencies.

### sidebar.js

Exports: `initWorkspace`, `loadWorkspace`, `updateWorkspaceUI`, `loadWorkspaceFiles`, `promptCreateFolderSidebar`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../utils.js](../utils.js), [./browser.js](./browser.js), [./menu.js](./menu.js), [./models.js](./models.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../workspace.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
