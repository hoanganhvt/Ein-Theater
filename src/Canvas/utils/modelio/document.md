# Saved model IO

This Go package reads saved model artifacts and extracts port metadata. It never
executes model Python files and does not mutate the active project. The handler
passes loaded data to `graph.Store.ImportGraph` under the store lock.

| Component | Input | Output / failure |
| --- | --- | --- |
| `Load` (`operations.go`) | Model folder path | `graph.GraphData, error`. Requires a directory and both `<folder>.json` and `<folder>.py`; also tries the sanitized filename when different. Accepts either `{ "canvas": ... }` or legacy top-level graph JSON. Fills/sanitizes graph name. Missing files, invalid folder or malformed JSON return `fault.Invalid`; read failure returns `fault.Internal`. |
| `Inspect` (`operations.go`) | Model folder path | Result map and error. Success fields: `status`, `isModel`, `hasInputs`, `modelName`, `folderPath`, `inputs`, `outputs`. Missing companion files yield `status: "error"`, `isModel: false`, `error`, with a nil Go error. Invalid directory/JSON and unreadable files use task errors. |
| `PortDef` (local to `Inspect`) | Node ID/label, layer type/op/type and params | Port fields `id`, `name`, `type`, `shape`. Inputs default to node ID, image type, and `[3,224,224]` when unspecified. Explicit outputs use tensor type. Without explicit outputs, a nonempty graph reports its last node with fallback `[1,10]`. |
| `ReadModelCanvas` (`canvas.go`) | Exact saved folder | `graph.GraphData, error` from `<folder>/<folder>.json`; unwraps `canvas` if present. Does not require the Python companion, sanitize names or validate graph semantics. Returns raw filesystem/JSON errors. Used after save to adopt generated references. |

Input recognition supports Input layers, input node types, placeholder operations,
and input labels. Port shapes are saved metadata and defaults, not fresh inference.

## Test load / inspect / import

From `src`:

```powershell
go test ./Canvas/handler -run TestWorkspaceModelRoundTrip -v
go test ./Canvas/utils/modelio -v
```

The HTTP round trip must recognize fixture input ports, reuse the same project on
repeated loads, restore geometry and resolve relative model references. No Python
installation is needed. Utility tests cover wrapped/legacy JSON, normalized
filenames, malformed JSON and missing companion files.

For an end-to-end check, save a small Input → Linear graph using the application,
then load the produced folder. Expect the same nodes, params and edges, a valid
active project, and model inspection reporting its input. Saving requires the
Python prerequisites described in [the bridge guide](../python/document.md).
