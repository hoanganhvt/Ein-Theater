# Node creation and parameter editing dialogs

## Responsibility

`categories.js` owns category metadata, filtering and the layer preview. `add.js` controls the add-node dialog and its transient callback. `edit.js` renders schema-driven fields, including Input presets and integrated-model controls. `parameters.js` reads and persists edited values. `lifecycle.js` closes all dialogs through their feature-specific cleanup functions. Preserve existing element IDs and reset editing state when closing; partial HTML files supply the matching mounts.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [add.js](./add.js) | Add-node lifecycle, listeners and creation submission. |
| [categories.js](./categories.js) | Category definitions, dropdown filtering and layer preview. |
| [edit.js](./edit.js) | Parameter form rendering, close behavior and context-menu dispatch. |
| [lifecycle.js](./lifecycle.js) | Coordinated closure of all editor dialogs. |
| [parameters.js](./parameters.js) | Reading and saving edited node parameters. |

## Module contracts

### add.js

Exports: `setupAddNodeModalListeners`, `openAddNodeModal`, `toggleCustom`, `saveNode`, `cancelNode`, `closeModal`, `openAddNodeAtContext`.

Dependencies: [../state.js](../state.js), [../schemas.js](../schemas.js), [../api.js](../api.js), [../graph.js](../graph.js), [./categories.js](./categories.js).

### categories.js

Exports: `CATEGORY_DEFINITIONS`, `populateCategoryDropdown`, `populateNodeTypeDropdown`, `updateNodePreview`.

Dependencies: [../schemas.js](../schemas.js), [../utils.js](../utils.js), [./add.js](./add.js).

### edit.js

Exports: `openEditNodeModal`, `closeEditModal`, `openEditNodeFromContext`.

Dependencies: [../state.js](../state.js), [../schemas.js](../schemas.js), [../utils.js](../utils.js), [../contextMenu.js](../contextMenu.js), [../circuit.js](../circuit.js).

### lifecycle.js

Exports: `closeAllModals`.

Dependencies: [../workspace.js](../workspace.js), [../circuit.js](../circuit.js), [./add.js](./add.js), [./edit.js](./edit.js).

### parameters.js

Exports: `saveEditNode`.

Dependencies: [../state.js](../state.js), [../schemas.js](../schemas.js), [../api.js](../api.js), [../graph.js](../graph.js), [./edit.js](./edit.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../modals.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
