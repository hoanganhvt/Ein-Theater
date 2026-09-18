# Context menu and selection deletion

## Responsibility

`menu.js` determines the clicked node or wire, records canvas coordinates, updates available actions and positions the menu within the viewport. It also installs dismissal and deletion key handlers. `deletion.js` persists selected-node and edge deletion and cleans up local datasets and selection. Keep coordinate conversion in the menu and mutation behavior in the deletion module.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [deletion.js](./deletion.js) | Selected node/edge deletion and local cleanup. |
| [menu.js](./menu.js) | Context selection, menu positioning and dismissal shortcuts. |

## Module contracts

### deletion.js

Exports: `deleteSelectionFromContextMenu`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../clipboard.js](../clipboard.js), [./menu.js](./menu.js).

### menu.js

Exports: `setupContextMenu`, `hideContextMenu`.

Dependencies: [../state.js](../state.js), [../modes.js](../modes.js), [../modals.js](../modals.js), [../circuit.js](../circuit.js), [../clipboard.js](../clipboard.js), [./deletion.js](./deletion.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../contextMenu.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
