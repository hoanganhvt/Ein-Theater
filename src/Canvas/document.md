# Canvas mode

Canvas is Ein Theater's implemented visual PyTorch model editor. Users build a
graph of blocks and connections, inspect inferred tensor metadata, manage
multiple projects, and save editable JSON plus generated Python model source.
Data, Debug, and Code are separate navigable Studio shells. The global runtime
flow is in the [project guide](../../document.md); Canvas-specific contracts
live in the folder guides below.

## Entry points and ownership

| Area | Input | Output / role |
| --- | --- | --- |
| [mode](mode/document.md) | Studio registry | Canvas page, Studio-home page, sidebar, APIs, and static assets. |
| [handler](handler/document.md) | HTTP requests | Validated graph, project, workspace, model, and runtime operations. |
| [templates](templates/document.md) | Trusted HTML partials | Studio and standalone Canvas documents and sidebar fragments. |
| [static](static/document.md) | User events and API responses | Canvas rendering, controls, workspace UI, and feature modules. |
| [utils](utils/document.md) | Graph, filesystem, and Python tasks | Store operations, session recovery, model IO, shape analysis, and code generation. |
| `data/modules.json` | Layer catalog request | Local module schema data for the palette and forms. |

`src/main.go` registers Canvas as the default Studio mode. `src/Canvas/canvas.go`
starts standalone Canvas without the other modes. Electron launches the Studio
server as a sidecar with an explicit resource root and a data directory for
session recovery; browser development can still run `go run .` from `src`.

## Main flows

1. The page bootstraps its JavaScript modules, loads an immediate graph snapshot
   from `/api/data?analyze=false`, and displays Vis Network before background
   Python analysis completes. Graph and project mutations go through Canvas
   handlers to the Go store.
2. Semantic edits schedule shape analysis against a detached graph snapshot.
   The Python worker returns fitted parameters and tensor metadata. Go applies
   results only when the semantic graph still matches, preserving newer edits.
3. `chooseWorkspace()` opens Electron's native Windows directory picker, or the
   Go PowerShell picker in Windows browser development. A chosen folder is
   validated through `/api/workspace/set`. The sidebar lists files and verified
   model folders through `/api/workspace/browse`; there is no HTML folder modal.
4. Save Model snapshots the active project, invokes the configured Python/PyTorch
   generator, and writes `<workspace>/<model>/<model>.json` and `<model>.py`.
   Load Model reads a selected model folder from the sidebar and imports its
   editable graph without executing the saved Python companion.
5. In Electron, a debounced `session-v1.json` in `userData` recovers projects,
   graph contents, project order, and the workspace after reopening. Viewport
   state and window bounds are stored separately. Undo/redo history is not
   recovered. Browser development without a data directory is in-memory only.

Python/PyTorch is optional for opening and editing the Canvas, but required for
shape inference and Save Model. The [Python bridge guide](utils/python/document.md)
describes detection and failure behavior. Native dialogs, custom window controls,
packaging, and sidecar security are described in the [desktop guide](../../desktop/document.md).

## Verify

From `src`, run `go test ./...` and `go vet ./...`. From the repository root,
run `node src/Canvas/static/js/api.test.mjs`,
`node src/Canvas/static/js/ui.test.mjs`, and
`node src/Canvas/static/js/performance.test.mjs`. The Electron test/build commands
and clean-VM checklist are in [desktop/document.md](../../desktop/document.md).
For a manual Canvas check, create and connect Input and Linear blocks, switch
projects, choose a disposable workspace, save with Python/PyTorch available,
then load the resulting model folder from the sidebar. Close and reopen the
desktop app to verify session recovery independently of saved model files.
