# Graph clipboard and keyboard commands

## Responsibility

`operations.js` owns the in-memory clipboard, paste offset counter and sessionStorage persistence. Copied records include selected nodes and the internal wires between them. Pasting remaps IDs through the backend and preserves relative positions and bend geometry. `presentation.js` updates controls and selection; `shortcuts.js` binds commands and ignores editable controls and open modals. The public facade preserves callers of the original module.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [operations.js](./operations.js) | Clipboard storage, copy/cut/paste and context-position paste. |
| [presentation.js](./presentation.js) | Select-all behavior and clipboard action availability. |
| [shortcuts.js](./shortcuts.js) | Copy/cut/paste/select-all keyboard bindings. |

## Module contracts

### operations.js

Exports: `hasClipboardData`, `getClipboardNodeCount`, `copySelection`, `cutSelection`, `pasteClipboard`, `pasteClipboardAtContext`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../workspace.js](../workspace.js), [../schemas.js](../schemas.js), [../circuit.js](../circuit.js), [../modes.js](../modes.js), [./presentation.js](./presentation.js).

### presentation.js

Exports: `selectAllNodes`, `updateClipboardUI`.

Dependencies: [../state.js](../state.js), [./operations.js](./operations.js).

### shortcuts.js

Exports: `setupClipboardShortcuts`.

Dependencies: [../state.js](../state.js), [./operations.js](./operations.js), [./presentation.js](./presentation.js).

## Extension and verification

Cut operations lazily import `../contextMenu.js` to reuse selection deletion. Keep
this path relative to the feature folder when moving clipboard code.

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../clipboard.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
