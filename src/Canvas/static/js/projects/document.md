# Project list operations and model title editing

## Responsibility

`list.js` loads and renders projects and coordinates create, switch and delete operations with graph reloads. `rename.js` owns the inline title editor, sanitizes names with the shared naming helper and refreshes the project list after persistence. The backend owns the active project; this folder does not maintain a second project store.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [list.js](./list.js) | Project list rendering and project lifecycle requests. |
| [rename.js](./rename.js) | Inline title editing and normalized model rename. |

## Module contracts

### list.js

Exports: `loadProjects`, `renderProjectList`, `createProject`, `switchProject`, `deleteProject`.

Dependencies: [../api.js](../api.js), [../utils.js](../utils.js), [../graph.js](../graph.js).

### rename.js

Exports: `startRename`, `commitRename`, `cancelRename`.

Dependencies: [../api.js](../api.js), [../utils.js](../utils.js), [./list.js](./list.js).

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../projects.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.
