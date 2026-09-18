# Canvas interaction modes and click placement

## Responsibility

`toolbar.js` changes the shared interaction mode, Vis options, cursor and banner. Leaving connect mode cancels unfinished wire creation. `placement.js` handles empty-canvas clicks in add mode and converts DOM pixels to network coordinates before opening the add-node dialog. Mode values remain `move`, `select`, `add` and `connect`.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [placement.js](./placement.js) | Empty-canvas click placement in add mode. |
| [toolbar.js](./toolbar.js) | Interaction mode, cursor, banner and Vis option updates. |

## Module contracts

### placement.js

Exports: `setupCanvasClickAdd`.

Dependencies: [../state.js](../state.js), [../modals.js](../modals.js).

### toolbar.js

Exports: `setMode`.

Dependencies: [../state.js](../state.js), [../circuit.js](../circuit.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../modes.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
