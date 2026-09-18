# Canvas studio-home fragments

These files were formerly `src/templates/index/*`. They contain Canvas-specific
editor controls and now belong to Canvas. `../studio.html` includes them; the
studio router selects `handler.HomeHandler` when Canvas is the initial studio mode.

| Component | Input | Output / role |
| --- | --- | --- |
| `header.html` | Canvas action bindings; shared navigation fills `appModeTabs` | File/save controls, model title, toolbar and mode-menu mount. |
| `workspace.html` | Graph data and sidebar loader | Canvas network, selection overlay and sidebar mount. |
| `context-menu.html` | Canvas selection/context actions | Context-menu markup. |
| `folder-browser.html` | Workspace browser state | Folder-selection dialog markup. |
| `add-node.html` | Layer schema and form values | Node-creation dialog markup. |
| `edit-node.html` | Selected node parameters | Node-editing dialog markup. |
| `edit-edge.html` | Selected edge route parameters | Edge-editing dialog markup. |

Fragments are trusted static input to the shared include composer. Their output is
HTML embedded in the Canvas home document, not standalone responses. No Data,
Code, Train or Debug rendering logic belongs here.

From `src`, run `go test ./Canvas/mode -v`; root, Canvas and sidebar pages must have
resolved includes and expected mount elements. From the repository root, run
`node src/Canvas/static/js/ui.test.mjs` to verify inline event bindings and frontend
behavior, and `node src/static/studio/navigation.test.mjs` for the shared mode menu.
