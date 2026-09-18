# HTTP requests and automatic shape refresh

## Responsibility

The public `../api.js` composes endpoint groups into one stable `api` object, then attaches the shape-refresh decorator once. Project, workspace, node, edge and graph operations retain their existing URLs, request bodies and return types. Semantic edits refresh derived tensor metadata without replacing datasets or moving nodes. The refresh version and dataset identity checks prevent stale responses from overwriting a newer canvas. Geometry-only moves do not request automatic dimensions.

## File-by-file ownership

| File | Responsibility |
| --- | --- |
| [edges.js](./edges.js) | Wire creation, geometry updates and deletion requests. |
| [graph.js](./graph.js) | Graph snapshots, graph paste and canvas clearing requests. |
| [labels.js](./labels.js) | Tensor summaries and integrated-model labels derived from backend metadata. |
| [nodes.js](./nodes.js) | Node creation, parameter updates, deletion and position persistence. |
| [projects.js](./projects.js) | Project listing, creation, switching, deletion and model renaming requests. |
| [shapeRefresh.js](./shapeRefresh.js) | Post-mutation synchronization with stale-response protection. |
| [workspace.js](./workspace.js) | Directory browsing, native folder selection, folder creation and model package requests. |

## Module contracts

### edges.js

Exports: `edgesApi`.

No module dependencies.

### graph.js

Exports: `graphApi`.

No module dependencies.

### labels.js

Exports: `tensorSummary`, `integratedShapeLabel`.

Dependencies: [../schemas.js](../schemas.js).

### nodes.js

Exports: `nodesApi`.

No module dependencies.

### projects.js

Exports: `projectsApi`.

No module dependencies.

### shapeRefresh.js

Exports: `attachShapeRefresh`.

Dependencies: [../state.js](../state.js), [../schemas.js](../schemas.js), [./labels.js](./labels.js).

### workspace.js

Exports: `workspaceApi`.

No module dependencies.

## Extension and verification

Keep related changes within the owning file above. Other features should normally import the stable [public entry](../api.js), while files in this folder use explicit sibling imports. Cross-feature calls should happen inside functions, not during module evaluation, because the editor has mutually dependent UI workflows.

Run from the repository root:

```powershell
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
```

The UI checks cover module linking, existing inline handler contracts, four bend modes, endpoint movement, zoom-aware box selection, wire cancellation and rigid group dragging. Use the browser to verify the affected gesture or dialog as well. See the [frontend architecture](../document.md) for startup, state ownership and known pre-existing limitations.

## Nonblocking shape synchronization

Mutation promises now resolve after the write response, without waiting for Python. Derived parameters and tensor labels arrive later through the existing dataset. Explicit consumers can await `api.refreshShapes()` to wait for the background batch. The scheduler debounces for 80 ms, allows one analysis in flight and coalesces subsequent edits into one pending batch. Version checks start when a mutation begins; dataset identity and project ID checks prevent stale updates. Failed background requests log an error without opening a blocking alert.

`fetchGraphData({ analyze: false })` requests an immediate snapshot. Analysis requests can be pinned with `projectId`; unknown IDs return 404 rather than falling back to the active project.
