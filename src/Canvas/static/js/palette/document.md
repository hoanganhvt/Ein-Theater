# Layer palette catalog, rendering and drag/drop

## Responsibility

`catalog.js` defines the fundamental layer order. `render.js` reads the schema registry and renders escaped labels and badges. `dragging.js` handles palette clicks, drag/drop placement and registered model-folder payloads. Canvas drop listeners use the existing initialization guard; palette item listeners attach to the rendered elements. Integrated models are inspected before a block is created.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [catalog.js](./catalog.js) | Ordered fundamental block types. |
| [dragging.js](./dragging.js) | Palette and model-folder drop handling and click placement. |
| [render.js](./render.js) | Schema-based palette HTML rendering. |

## Module contracts

### catalog.js

Exports: `FUNDAMENTAL_LAYERS`.

No module dependencies.

### dragging.js

Exports: `setupPaletteDragAndDrop`.

Dependencies: [../state.js](../state.js), [../graph.js](../graph.js), [../modes.js](../modes.js), [../api.js](../api.js), [../workspace.js](../workspace.js).

### render.js

Exports: `renderPalette`.

Dependencies: [../schemas.js](../schemas.js), [../utils.js](../utils.js), [./dragging.js](./dragging.js), [./catalog.js](./catalog.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../palette.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.

## Idempotent event binding

A WeakSet tracks palette elements that already have click/drag listeners. Rendering and sidebar initialization may both call setup without adding duplicate handlers. Newly rendered elements still receive their listeners, and removed elements remain garbage-collectible.
