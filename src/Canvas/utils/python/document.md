# Go-to-Python bridge

This directory contains Go orchestration code. Python implementations remain in
`../auto_shape_fitting` and `../generate code`. The bridge never acquires a graph
store mutex; handlers snapshot state before calling it and reconcile afterward.

## Component contracts

| Component | Input | Output / side effects |
| --- | --- | --- |
| `FindGenCodePyPath` (`paths.go`) | Current working directory | Generator path discovered from launch candidates or repository ancestors, normally absolute. If none exists, returns the conventional Canvas-relative path. |
| `AnalyzeGraph` (`shapes.go`) | Detached `graph.GraphData`, base directory | Analyzed graph and nil, or error. Empty graphs return unchanged without launching Python. Nonempty graphs use the shared worker. |
| `shapeWorker`, `pythonShapeWorker` (internal) | Command, stdin/stdout pipes, private mutex | One persistent interpreter. Calls are serialized independently of project state. |
| `pythonShapeWorker.analyze` | Graph and base directory | Writes one JSON line `{graph, baseDir}`; reads `{graph, error}`. Returns decoded graph or error. Starts Python lazily; transport/JSON failure or a 45-second timeout stops the worker. A Python-reported graph error leaves the worker reusable. |
| `pythonShapeWorker.stop` | Worker receiver; caller serializes access | Closes stdin, kills/reaps the process and clears its command. No return. |
| `GenerateModel` (`operations.go`) | Detached graph, cleaned output parent, base directory | `(result map, parsed bool, error)`. Runs `python gen_code.py --save-canvas - --out-dir ... --base-dir ...` with graph JSON on stdin. Parsed JSON returns `parsed=true`; otherwise returns the legacy `{status:"ok", raw, folder}` fallback with `parsed=false`. Serialization/process errors are `fault.Internal`. |

Both subprocess paths set `PYTHONDONTWRITEBYTECODE=1`. Generation writes model
artifacts below the requested output parent. Generation preserves the existing
unbounded subprocess wait; the 45-second timeout applies only to shape analysis.
Worker stderr goes to the server's stderr. A shape error is presented by the data
handler as per-node diagnostic metadata without discarding the graph.

## Prerequisites

`python` must be on PATH and `python -c "import torch"` must succeed. A `py` launcher
alone is insufficient for the Go bridge. Go-only tests do not require Python.

## Test discovery and persistent analysis

From `src`:

```powershell
go test ./Canvas/utils/python -v
go test ./Canvas/handler -run 'TestSnapshotDoesNotWaitForShapeWorker|TestBackgroundAnalysisPreservesConcurrentDrag' -v
```

`TestGeneratorDiscoveryFromLaunchAndPackageDirectories` always runs: it must find
the same generator and sibling shape script from each launch/test directory.
`TestPythonWorkerProtocolAndReuse` requires Python/PyTorch: it checks inferred
`in_features=12`, metadata, stable process ID, error handling and worker reuse after
a malformed graph. It reports SKIP if either dependency is unavailable; a skip is
not evidence that Python inference passed.

## Test generation end to end

From the repository root, with Python/PyTorch installed:

```powershell
python -B -m unittest discover -s src/Canvas/utils/tests -p "test_*.py" -v
```

Expected: all generator/inference regressions pass. Then run `go run .` from `src`,
choose a writable temporary workspace, create an Input → Linear graph, and save.
Expect a successful save response and `<name>/<name>.json` plus `<name>/<name>.py`.
Load that folder and inspect the restored graph. Change a node while analysis/save
is running: newer semantic edits must survive result reconciliation.

See [generation examples](../generate%20code/document.md) and
[shape inference examples](../auto_shape_fitting/document.md) for concrete canvas
fixtures and direct Python CLI tests.

## JSON pipe encoding

`environment.go`: `processEnvironment()` returns the inherited environment with
PYTHONDONTWRITEBYTECODE=1, PYTHONUTF8=1 and PYTHONIOENCODING=utf-8. Both subprocess
paths use it to prevent locale-based Unicode corruption on Windows pipes.
The worker integration test checks captions across repeated analysis; the environment
test checks inherited overrides without Python. See [performance](../../performance.md).
