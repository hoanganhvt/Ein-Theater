# Graph loading, node operations and drag persistence

## Responsibility

`loading.js` fetches the active graph and replaces the Vis Network. `data.js` normalizes node labels, tensor metadata, styles and missing wire geometry; `options.js` builds fresh Vis options. `dragging.js` registers drag handlers and owns baseline positions and edge snapshots. Internal wires translate rigidly with a selected group; external wires reconnect to moved endpoints. `selection.js` binds click, double-click and selection synchronization. Regular blocks and integrated submodels have separate creation modules.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [blocks.js](./blocks.js) | Creation of a regular schema-backed node. |
| [data.js](./data.js) | Backend record normalization into Vis node and edge datasets. |
| [dragging.js](./dragging.js) | Group drag snapshots, rigid internal wires, external endpoints and batch persistence. |
| [integrated.js](./integrated.js) | Integrated submodel labels and block creation. |
| [loading.js](./loading.js) | Active graph fetch, dataset replacement and network setup. |
| [options.js](./options.js) | Fresh Vis Network visual and interaction options. |
| [selection.js](./selection.js) | Network click, double-click and selection notifications. |
| [view.js](./view.js) | Fit-to-content and confirmed graph clearing. |

## Module contracts

### blocks.js

Exports: `createBlock`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../schemas.js](../schemas.js), [../circuit.js](../circuit.js).

### data.js

Exports: `prepareNodes`, `prepareEdges`.

Dependencies: [../schemas.js](../schemas.js), [../api.js](../api.js), [../circuit.js](../circuit.js).

### dragging.js

Exports: `setupNodeDragging`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../circuit.js](../circuit.js).

### integrated.js

Exports: `formatICLabel`, `createIntegratedBlock`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../circuit.js](../circuit.js).

### loading.js

Exports: `loadGraph`.

Dependencies: [./data.js](./data.js), [./options.js](./options.js), [../state.js](../state.js), [../api.js](../api.js), [../modes.js](../modes.js), [../circuit.js](../circuit.js), [./dragging.js](./dragging.js), [./selection.js](./selection.js).

### options.js

Exports: `createNetworkOptions`.

No module dependencies.

### selection.js

Exports: `setupGraphSelection`.

Dependencies: [../state.js](../state.js), [../modals.js](../modals.js), [../circuit.js](../circuit.js), [../clipboard.js](../clipboard.js).

### view.js

Exports: `fitView`, `clearGraph`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [../circuit.js](../circuit.js), [../clipboard.js](../clipboard.js), [./loading.js](./loading.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../graph.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.

## Responsive project loading

Loading requests `/api/data?analyze=false`, creates the canvas from that snapshot, records `state.currentProjectId` and schedules background shape refresh. A load version prevents an older fetch from replacing a newer graph. Edge preparation indexes nodes once instead of repeatedly searching the node array for every missing route. Shape metadata does not require rebuilding the Vis Network.
