# Circuit geometry, wire editing and canvas rendering

## Responsibility

`setup.js` registers drawing hooks on each new Vis Network. `interactions.js` binds pointer and keyboard listeners to the canvas. Geometry functions work in network coordinates; the grid is 50 units. Wire creation, rendering and editing share the single object in `runtime.js`; never replace it or create per-module copies. `geometry.js` has no DOM dependency. Native Vis edges remain invisible while custom traces, arrows, fold handles and IC decorations are drawn on the canvas.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [constants.js](./constants.js) | Grid spacing, palette colors, trace widths and bend labels. |
| [drawing.js](./drawing.js) | Grid, wire traces, arrowheads, fold handles and edge decorations. |
| [edges.js](./edges.js) | Wire hit testing, fold changes, colors and execution indices. |
| [editor.js](./editor.js) | Connection dialog state, routing updates and wire deletion. |
| [geometry.js](./geometry.js) | Orthogonal routing, segment simplification, endpoint adjustment, fold handles and distances. |
| [integrated.js](./integrated.js) | Integrated-model IC chip pin and notch decorations. |
| [interactions.js](./interactions.js) | Pointer and keyboard event registration for drawing and fold dragging. |
| [preview.js](./preview.js) | Live dashed wire preview and target highlighting. |
| [runtime.js](./runtime.js) | Single shared mutable store for drawing gestures, editing, hover and listener guards. |
| [selection.js](./selection.js) | Selected-wire tracking and header toolbar synchronization. |
| [setup.js](./setup.js) | Network drawing hook registration and renderer coordination. |
| [wiring.js](./wiring.js) | Live wire lifecycle, waypoints, cancellation and persisted connection completion. |

## Module contracts

### constants.js

Exports: `GRID_SIZE`, `BG_COLOR`, `DOT_COLOR`, `COLOR_TRACE`, `COLOR_SELECTED`, `COLOR_PREVIEW`, `TRACE_WIDTH`, `DOT_RADIUS`, `BEND_MODES`, `BEND_LABELS`.

No module dependencies.

### drawing.js

Exports: `drawGrid`, `drawCircuitEdges`, `drawEdgeDecorations`.

Dependencies: [../state.js](../state.js), [./runtime.js](./runtime.js), [./constants.js](./constants.js), [./geometry.js](./geometry.js), [./edges.js](./edges.js).

### edges.js

Exports: `cycleEdgeFoldMode`, `invertEdgeFold`, `getEdgeAtCanvasPos`, `getEdgeColors`, `updateEdgeIndices`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [./constants.js](./constants.js), [./geometry.js](./geometry.js).

### editor.js

Exports: `openEditEdgeModal`, `closeEditEdgeModal`, `saveEditEdgeModal`, `deleteEdgeFromModal`, `deleteSelectedEdge`, `deleteSelectedEdgeFromBar`, `deleteEdgeById`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [./runtime.js](./runtime.js), [./geometry.js](./geometry.js), [./edges.js](./edges.js), [./selection.js](./selection.js).

### geometry.js

Exports: `snapToGrid`, `computeOrthogonalLines`, `simplifyLines`, `updateEdgeEndpoints`, `computeEdgeLines`, `getEdgeFoldHandlePos`, `pointToSegmentDistance`, `getEdgeMidpoint`.

Dependencies: [./constants.js](./constants.js).

### integrated.js

Exports: `drawICDecorations`.

Dependencies: [../state.js](../state.js).

### interactions.js

Exports: `initCanvasInteractions`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [./runtime.js](./runtime.js), [./constants.js](./constants.js), [./geometry.js](./geometry.js), [./edges.js](./edges.js), [./wiring.js](./wiring.js).

### preview.js

Exports: `drawConnectPreview`.

Dependencies: [../state.js](../state.js), [./runtime.js](./runtime.js), [./constants.js](./constants.js), [./geometry.js](./geometry.js).

### runtime.js

Exports: `runtime`.

No module dependencies.

### selection.js

Exports: `updateEdgeUISelection`, `getActiveEdgeId`.

Dependencies: [../state.js](../state.js), [./runtime.js](./runtime.js).

### setup.js

Exports: `setupCircuitCanvas`.

Dependencies: [../state.js](../state.js), [./runtime.js](./runtime.js), [./drawing.js](./drawing.js), [./preview.js](./preview.js), [./interactions.js](./interactions.js), [./integrated.js](./integrated.js).

### wiring.js

Exports: `updateConnectBanner`, `cancelWireCreation`, `addWireWaypoint`, `popWireWaypoint`, `extendWirePath`, `finishWireCreation`.

Dependencies: [../state.js](../state.js), [../api.js](../api.js), [./runtime.js](./runtime.js), [./constants.js](./constants.js), [./geometry.js](./geometry.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../circuit.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.

## Grid drawing cost

The visual grid uses a power-of-two multiple of 50 units to keep dots at least 12 screen pixels apart when zoomed out. Dots share one canvas path and one fill per frame. Node snapping and wire routing still use 50 units. At 1600 by 900 pixels and 2% zoom, the renderer draws 5,916 dots rather than the previous 1,452,525. This is an operation-count comparison, not a browser frame-rate measurement.
