# Graph operations

This Go package owns canvas data, project state, graph edits, orthogonal routing,
and snapshot reconciliation. It has no HTTP, filesystem-read, or subprocess API.

## State and concurrency

`Store` contains `Projects`, `ProjectOrder`, `CurrentProjectID`, `NextProjectID`,
`WorkingDir`, and `Mu`. Every caller sharing a store must hold `Store.Mu` while
reading or changing those fields or a contained `Project`. Methods do not lock
internally, so a handler can perform a complete transaction under one lock.
Independent, privately owned projects need no external lock.

Release the lock before Python or filesystem IO. Capture a `GraphSnapshot`, run
the external task, reacquire the lock, then use `ApplyAnalysis` or
`AdoptSavedIntegrations`. A stale result cannot replace newer semantic edits.

## Data contracts

| Component | Input / stored fields | Output / meaning |
| --- | --- | --- |
| `Point`, `Line` (`types.go`) | XY coordinates; segment endpoints | JSON-compatible geometry. `Line` retains both `first/last` and `from/to`. |
| `Node` | ID, label, layer type, XY, shape/color, params, parent/zone | Canvas block; optional `TensorInfo` and recursively adapted `GraphData`. |
| `Edge` | ID, endpoint IDs, lines, fold mode, custom fold, type/index | Directed canvas connection; reindexing clears the legacy index. |
| `TensorInfo` | Input/output dimensions, output tree, auto fields, message | Python-produced shape metadata; Go does not infer dimensions. |
| `GraphData` | Project ID/name, ordered node and edge slices | JSON snapshot exchanged with the client and Python. |
| `Project`, `ProjectMeta`, `ProjectList` | Project maps/order/counters; summary ID/name | Mutable graph state; lightweight tab summaries; current ID and ordered summaries. |
| `AddNodeReq` | `label`, `layerType`, `x`, `y`, optional `params`, `shape` | Decoded add-node transport data. Defaults are applied by the handler. |
| `UpdateNodeReq` | Required `id`; optional label/type/params and parent pointers | Update command. Nil fields preserve values; a pointer to an empty parent clears it. |
| `MoveNodeItem` | `id`, `x`, `y` | One batch position command. |
| `AddEdgeReq`, `UpdateEdgeReq` | Endpoints or ID, lines, edge type, fold mode/custom fold | Connection or route update commands. |
| `PasteGraphReq`, `PasteGraphResp` | Nodes, edges, `dx`, `dy` | Pasted nodes and internal edges with remapped IDs. |

## Operations: input and output

| File / component | Input | Output and side effects |
| --- | --- | --- |
| `store.go`: `NewStore` | None | New independent store, one active `Untitled Model`, project IDs starting at 1. |
| `Store.MakeProject` | Name | Empty project with a new ID; advances counter, does not register or activate it. |
| `Store.Current` | Store's active ID | Project pointer, or nil if callers broke the active-ID invariant. |
| `projects.go`: `ListProjects` | Store | Ordered `ProjectList`. |
| `CreateProject` | Already normalized name | Registered, active project pointer. |
| `SwitchProject` | Project ID | True and changed active ID, or false with no change. |
| `DeleteProject` | Project ID | Nil on success; `ErrLastProject` or `ErrProjectNotFound` otherwise. Removes the tab and selects the first remaining tab if needed. |
| `project.go`: `GetNextNodeID` | Layer type | Lowest unused `<normalized-prefix>_<index>`; does not insert a node. |
| `ReindexEdges` | Project edge order/map | No return; removes deleted IDs from order and clears legacy edge indexes. |
| `nodes.go`: `AddNode` | Label/type/shape, XY, params | Inserted `Node` with scoped ID and display label. Params retain caller ownership semantics. |
| `UpdateNode` | `UpdateNodeReq` | Updated node and true, or zero node and false. |
| `DeleteNode`, `DeleteNodes` | ID or ID slice | No return; removes nodes and incident edges. Unknown IDs are ignored. |
| `MoveNode` | ID, XY, update-edges flag | Existence boolean; optionally recalculates simple routes or moves endpoints of complex routes. |
| `MoveNodes` | `[]MoveNodeItem` | No return; updates known nodes without changing routes. |
| `edges.go`: `Connect` | Endpoint IDs, fold mode, custom fold, optional lines | Edge and nil, or validation error. Existing endpoint pair is updated; new connections receive a scoped ID. |
| `UpdateEdge` | `UpdateEdgeReq` | Updated edge and true, or zero edge and false. |
| `UpdateEdges` | Request slice | No return; updates known edges. Preserves existing batch edge-type behavior. |
| `DeleteEdge` | ID | No return; removes the edge and refreshes order. |
| `geometry.go`: `ComputeEdgeLines` | Two nodes | Orthogonal route with default horizontal fold. |
| `ComputeEdgeLinesWithMode` | Nodes, horizontal/vertical/L fold mode, optional fold coordinate | `[]Line`; coincident nodes return an empty slice. Default folds snap to `GridSize = 50`. |
| `clipboard.go`: `Paste` | `PasteGraphReq` | `PasteGraphResp`; remaps scoped IDs and copied parents, offsets routes/folds, snaps node positions. Params maps are shallow-copied, matching the existing behavior. |
| `lifecycle.go`: `Clear` | Project | No return; clears graph maps, edge order and counters. |
| `PrepareSnapshot` | Project | Snapshot after filling missing edge geometry. |
| `snapshot.go`: `OrderedNodes` | Project | Nodes in stored order, followed by remaining IDs sorted lexically. |
| `GraphSnapshot` | Project containing JSON-compatible values | Detached `GraphData`; nested maps/metadata are copied through JSON. Serialization failures retain the existing zero-value behavior. |
| `shapeInputs` (internal) | Graph | Copy with node positions and edge routing cleared for semantic comparison. |
| `MatchesSnapshot` | Previous snapshot | True when semantic inputs match; ignores layout-only edits. |
| `ApplyAnalysis` | Previous snapshot and analyzed graph | Acceptance boolean; updates params/tensor metadata only when the snapshot still matches. |
| `ResolveModelPaths` | Node pointer and base directory | No return; makes relative `model_path` / `weights_path` params absolute relative to base. |
| `AdoptSavedIntegrations` | Previous snapshot, saved graph, saved folder | Acceptance boolean; resolves saved references, applies metadata and updates `BaseDir`. |
| `import.go`: `Store.ImportGraph` | Decoded graph and source folder | Restored active project; reuses an empty or same-name tab, restores ordering, labels, paths and missing routes. Caller validates files before calling. |

## Test major behaviors

From the repository root, enter `src`, then run:

```powershell
go test ./Canvas/utils/graph ./Canvas/utils/naming -v
go test ./Canvas/handler -run 'TestPasteGraphHandler|TestMoveNodesAndEdgesHandler|TestEdgeCreationAndOrdering|TestEdgeBendingAndFoldModes' -v
go test ./Canvas/handler -run 'TestSnapshotDoesNotWaitForShapeWorker|TestBackgroundAnalysisPreservesConcurrentDrag|TestWorkspaceModelRoundTrip' -v
```

Expected: PASS for ID remapping, parent preservation, movement, routing, saved-model
import and snapshot isolation. Snapshot requests must return while analysis is
blocked. Dragging must preserve valid analysis; parameter changes must reject stale
analysis. These tests require no Python. Do not parallelize tests that replace the
handler's package-level store or analysis function.

## Legacy caption repair

`labels.go`: `RepairLegacyLabels(*GraphData)` repairs only oversized,
encoding-corrupted IntegratedModel captions, recursively including adapted graphs.
It returns nothing and preserves parameters, topology and ordinary labels. Saved
model decoding calls it before snapshots. See [performance](../../performance.md).
# Edit history

`Project` owns bounded Undo and Redo stacks (100 steps) of deep project states.
`RecordEdit` ignores no-op changes and derived shape metadata. Layout edits
increment the general revision; semantic edits also increment semantic revision.
`DataHandler` checks semantic revision before applying asynchronous inference,
which prevents an old A→B→A analysis result from overwriting restored state.
Importing a model resets that project's history baseline. History is kept only
for the current server lifetime.
