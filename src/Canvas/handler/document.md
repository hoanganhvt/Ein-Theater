# Canvas HTTP handlers

This directory is the HTTP boundary: decode requests, apply transport defaults,
validate required fields/methods, coordinate locking, call categorized utilities,
and encode responses. Task algorithms and data ownership live in
[utils](../utils/document.md). Existing URLs, aliases and response shapes are preserved.

## Components

| File / component | Input | Output / responsibility |
| --- | --- | --- |
| routes.go: RegisterRoutes | A fresh http.ServeMux | Mounts only legacy Canvas APIs; no global pages/assets/sidebar dispatch. Used by Canvas API tests. |
| routes.go: RegisterAPI | Private mode mux | Registers relative paths, such as /data and /addNode, for studio to mount under /api/canvas/. |
| state.go: store | graph.NewStore() | Shared in-memory application store, initially one empty active project. |
| state.go: analyzeGraph | Snapshot and base directory | Analysis result/error; defaults to python.AnalyzeGraph. Private test seam; never change concurrently with requests. |
| types.go and request aliases | graph/workspace utility types | Retain handler type names and JSON field contracts without duplicate definitions. |
| Shared rendering | Mode-owned template path | src/studio.ServeTemplate performs GET/HEAD validation, composition and response writes. |
| error_handler.go: writeError | ResponseWriter and task error | Plain-text 400 for fault.Invalid, otherwise 500. Endpoint-specific graph errors are mapped by their handlers. |
| persistence.go | Optional data directory and mutating requests | Restores and schedules debounced desktop session snapshots; flushes at shutdown. |
| runtime_handlers.go | Health/Python runtime requests | Process-level JSON health, interpreter detection and manual configuration. |

Every public handler takes (http.ResponseWriter, *http.Request) and returns no Go
value. The following tables specify its HTTP input and output. “Any” means the
existing handler does not enforce an HTTP method; this refactor does not add new
method restrictions. Successful responses are 200. Validation errors are normally
plain text unless a JSON error result is explicitly listed.

## Canvas page handlers (page_handlers.go)

| Handler | Input | Output |
| --- | --- | --- |
| HomeHandler | GET/HEAD selected by studio for its default Canvas home | Composed Canvas/templates/studio.html. |
| CanvasHandler | GET/HEAD at /canvas or standalone root | Composed Canvas/templates/canvas.html. |
| SidebarHandler | GET/HEAD after studio has selected Canvas | Canvas sidebar fragment, with extraction fallback from canvas.html. No other mode handling. |

Global IndexHandler, catalog, sidebar dispatch and assets belong to [studio](../../studio/document.md).
Canvas's [mode adapter](../mode/document.md) supplies these callbacks. All APIs below
are also available at /api/canvas/*; their listed flat URLs remain compatibility aliases.

## Project handlers (project_handlers.go)

| Handler / route | Input | Output |
| --- | --- | --- |
| ListProjectsHandler: /api/projects | Any | {current, projects:[{id,name}]} in tab creation order. |
| CreateProjectHandler: /api/projects/create | Any, name query | {id,name} for newly active project. Blank name becomes Untitled_Model; other names are sanitized. |
| SwitchProjectHandler: /api/projects/switch | Any, id query | Empty success; 404 for unknown ID. |
| DeleteProjectHandler: /api/projects/delete | Any, id query | Empty success; 400 when only one project remains, 404 for unknown ID otherwise. |
| RenameModelHandler: /api/rename | Any, nonempty name query | {status:"ok",name}; sanitizes name, returns 400 for missing input. |

## Node handlers (node_handlers.go)

| Handler / route | Input | Output |
| --- | --- | --- |
| AddNodeHandler: /api/addNode | Any; JSON AddNodeReq or label/layerType/x/y query fallbacks | Created Node. Defaults: New Block label, layerType from label, box shape. Scoped ID/display name comes from graph.AddNode. |
| UpdateNodeHandler: /api/updateNode | POST JSON UpdateNodeReq | Updated Node; 400 for malformed body/missing ID, 404 when absent. |
| DeleteNodeHandler: /api/deleteNode | Any, id query | Empty success; deletes node and incident edges, tolerates unknown ID. |
| DeleteNodesHandler: /api/deleteNodes | Any; JSON string array when Content-Type is exactly application/json, otherwise comma-separated ids query | Empty success; removes listed nodes and incident edges. Empty input is a no-op. |
| MoveNodeHandler: /api/moveNode | Any; id/x/y query, optional update_edges=false | Empty success; 400 for invalid coordinates/missing ID, 404 for unknown node. |
| MoveNodesHandler: /api/moveNodes | POST JSON array of {id,x,y} | Empty success; ignores unknown nodes and preserves edge routes. Invalid JSON returns 400. |

## Edge handlers (edge_handlers.go)

| Handler / route | Input | Output |
| --- | --- | --- |
| AddEdgeHandler: /api/addEdge | Any; JSON AddEdgeReq or from/to/foldMode query fallbacks | Created or updated Edge; 400 for missing, equal or nonexistent endpoints. edgeType/type input is accepted but single-edge creation retains normal type. |
| UpdateEdgeHandler: /api/updateEdge | POST JSON UpdateEdgeReq | Updated Edge; 400 for malformed body/missing ID, 404 when absent. Retains normal type. |
| UpdateEdgesHandler: /api/updateEdges | POST JSON UpdateEdgeReq array | Empty success; skips missing/unknown IDs and applies existing batch type rules. Invalid JSON returns 400. |
| DeleteEdgeHandler: /api/deleteEdge | Any, id query | Empty success, including unknown IDs. |

## Graph handlers (graph_handlers.go)

| Handler / route | Input | Output |
| --- | --- | --- |
| DataHandler: /api/data | Any; optional projectId and analyze=false | GraphData and Server-Timing. Unknown pinned ID returns 404. Snapshot-only mode skips Python; default mode includes analysis. Python failure becomes node TensorInfo.message rather than an HTTP error. |
| ClearGraphHandler: /api/clear | Any | Empty success after clearing active graph. |
| PasteGraphHandler: /api/paste, /api/pasteGraph | POST JSON {nodes,edges,dx,dy} | {nodes,edges} created by graph.Paste; 400 on malformed body. Empty node input returns empty arrays. |

For mutation/snapshot work, handlers hold store.Mu. DataHandler releases it before
Python, then reacquires it to apply metadata only if the semantic snapshot matches.
Concurrent drag/routing edits survive analysis; semantic edits reject stale results.

## Workspace handlers (workspace_handlers.go)

| Handler / route | Input | Output |
| --- | --- | --- |
| WorkspaceHandler: /api/workspace | Any | {workingDir,name}; unset name is None. |
| SetWorkspaceHandler: /api/workspace/set | POST; path query, then JSON {path} | WorkspaceResponse; 400 for blank, missing or nondirectory path. |
| BrowseWorkspaceHandler: /api/workspace/browse | Any; dir query, falling back to active workspace | BrowseResponse with current/parent/drives/folders/files. Uses workspace.Browse for filesystem work. |
| SelectNativeFolderHandler: /api/workspace/select-native | POST | {cancelled:true}, or {cancelled:false,workingDir,name} and workspace update. Invalid selected folder returns 400, picker failure 500. Windows interactive feature. |
| CreateFolderHandler: /api/workspace/create-folder | POST; JSON {dir,name}, then query fallbacks; dir defaults to workspace | {status,path,name,parent}; task errors map to 400/500. |

## Model handlers (model_handlers.go)

| Handler / route | Input | Output |
| --- | --- | --- |
| SaveModelHandler: /api/workspace/save-model, /api/saveModel | POST; JSON {projectId,dir}, then query fallbacks | Python save result map, or legacy {status,raw,folder} fallback. dir defaults to workspace; unknown projectId retains the active-project fallback. Missing/invalid target returns JSON {error} with 400; unavailable Python returns JSON code `python_unavailable` with 503; other process/serialization failures return 500. Writes model JSON/Python files. |
| LoadModelHandler: /api/workspace/load-model, /api/loadModel | POST; JSON path/dir, then path/dir query | {status,modelName,projectId,nodeCount,edgeCount}; 400 for invalid/missing model or malformed JSON, 500 for read failure. Calls modelio.Load before acquiring store lock, then graph.Store.ImportGraph. |
| InspectModelHandler: /api/workspace/inspect-model | Any; path query, then JSON {path} | Model/port metadata. Missing companion file returns 200 with isModel:false and an error field. Invalid folder/JSON returns 400; read failure 500. |

SaveModelHandler snapshots under lock, runs Python unlocked and conditionally
adopts saved references after reacquiring the lock. It never replaces a newer
semantic edit with an older save snapshot.

## Process runtime routes (runtime_handlers.go)

These routes are registered above the Studio handler by `src/main.go` and are not
Canvas-mode aliases. In desktop mode, all requests require the sidecar token.

| Route | Input | Output |
| --- | --- | --- |
| `GET /api/health` | No body | JSON `{status,version,mode}`; other methods return 405. |
| `GET /api/runtime/python` | No body | JSON availability, executable, Python/PyTorch versions, or validation error. |
| `POST /api/runtime/python` | JSON `{path}` | Validated runtime status and persisted executable, or JSON `python_unavailable` with 503. Bad JSON returns 400; other methods return 405. |

The Windows directory picker remains available through
`/api/workspace/select-native` for `go run .` development. Electron uses its
preload IPC dialog and then calls `/api/workspace/set`; the removed HTML folder
modal has no server endpoint.

## Test instructions

Start at the repository root:

```powershell
Set-Location src
go test ./...
go vet ./...
```

If the environment cannot use its default Go build cache, set
$env:GOCACHE = Join-Path $env:TEMP 'ein-theater-go-cache' before these commands.
Expected: every Go test passes. Python/PyTorch integration explicitly reports SKIP
when dependencies are missing; rerun with them installed to validate that bridge.

Focused major-feature checks (from src):

```powershell
go test ./Canvas/handler -run 'TestPasteGraphHandler|TestMoveNodesAndEdgesHandler|TestEdgeCreationAndOrdering|TestEdgeBendingAndFoldModes' -v
go test ./Canvas/handler -run 'TestSnapshotDoesNotWaitForShapeWorker|TestBackgroundAnalysisPreservesConcurrentDrag' -v
go test ./Canvas/mode -v
go test ./Canvas/handler -run TestWorkspaceModelRoundTrip -v
go test ./Canvas/utils/python -v
```

The workspace test uses temporary files and a fresh store: create folder → browse
and inspect fixture model → load through both aliases → read graph. It checks
hidden-file filtering, route reconstruction, relative references, tab reuse and
error/method statuses. No real Python runs in this fixture test.

For concurrency instrumentation, use go test -race ./... on a Go installation with
CGO and a supported C compiler. Tests changing the global store/analysis function
must remain serial.

Manual smoke test: go run . from src, open http://localhost:8080, create blocks,
connect them, drag/paste/delete them, and switch project tabs. Select a temporary
workspace, save a small Input → Linear graph with Python/PyTorch installed, then
load the resulting folder. See the [Python bridge guide](../utils/python/document.md)
for prerequisites and expected artifacts, and the [workspace guide](../utils/workspace/document.md)
for native-picker cancellation testing.
# History endpoints

`GET /api/history?projectId=...` returns the graph, `canUndo`, `canRedo` and
revision. `POST /api/history/undo` and `/api/history/redo` restore one project
step. Namespaced `/api/canvas/history/*` works as well. Missing projects return
404 and empty history returns 409. `POST /api/edit/drag` commits positions and
routes as one validated step; `POST /api/edit/delete` deletes a node/edge
selection as one validated step. Both accept `projectId`, `nodes` and `edges`.
Mutations are serialized with history commands; shape analysis runs outside
the edit lock.
