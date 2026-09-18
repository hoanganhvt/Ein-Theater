# Box selection and coordinate-aware hit testing

## Responsibility

`box.js` owns the rubber-band gesture state and installs mouse handlers. `hitTest.js` is shared by live preview and final selection so both use identical bounding-box intersection and position fallback behavior. Rectangle bounds are DOM pixels; Vis bounding boxes are network coordinates. Completed selections include internal edges and switch back to move mode while retaining the selected group.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [box.js](./box.js) | Rubber-band gesture and final node/edge selection. |
| [hitTest.js](./hitTest.js) | Bounding-box intersection with position fallback under zoom and pan. |

## Module contracts

### box.js

Exports: `setupBoxSelection`.

Dependencies: [./hitTest.js](./hitTest.js), [../state.js](../state.js), [../clipboard.js](../clipboard.js), [../modes.js](../modes.js).

### hitTest.js

Exports: `nodesInRectangle`.

Dependencies: [../state.js](../state.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../selection.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
