# Automatic shape fitting

This package infers tensor shapes with PyTorch meta tensors and updates constructor
parameters such as `in_features` and `in_channels`. It does not write generated files.

| Module | Responsibility |
| --- | --- |
| `shape_inference.py` | Public API and executable `main()` for stdin/worker requests |
| `shape_engine.py` | Build the inference DAG and validate connected nodes before saving |
| `shape_interpreter.py` | Execute nodes and isolate errors on independent branches |
| `adapters.py` | Built-in constructor fitting rules |
| `tensor_specs.py` | Validate input dimensions/dtypes and serialize tensor metadata |
| `integrated_models.py` | Fit nested saved canvases without modifying their source files |

## Run main: one request

Prerequisites: Python with PyTorch installed in the selected environment. Commands
below use PowerShell. Starting at the repository root:

```powershell
Set-Location 'src/Canvas/utils/auto_shape_fitting'
python -B shape_inference.py --help
$canvas = '{"name":"SmokeModel","nodes":[{"id":"x","layerType":"Input","params":{"input_type":"raw data","shape":"4","batch_size":2}},{"id":"dense","layerType":"nn.Linear","params":{"in_features":99,"out_features":3}}],"edges":[{"id":"e0","from":"x","to":"dense"}]}'
$canvas | python -B shape_inference.py
```

Expected: JSON containing `dense.params.in_features = 4` and
`dense.tensorInfo.output = [2, 3]`. The original input dimension `99` is fitted to
the incoming tensor. A per-node `tensorInfo.message` describes unresolved shapes;
inspect it even when the process exits successfully.

For a file, run `Get-Content -Raw ./canvas.json | python -B shape_inference.py`.
Use `--base-dir <folder>` to resolve relative integrated-model references.

## Run main: persistent worker

From this same directory:

```powershell
python -B -u shape_inference.py --worker
```

Paste one complete request on each line, then press Enter:

```json
{"graph":{"nodes":[{"id":"x","layerType":"Input","params":{"shape":"4","batch_size":2}}],"edges":[]},"baseDir":"."}
```

Expected: one `{"graph": ...}` response per request. Invalid JSON produces
`{"error": "..."}` and the worker continues. Press Ctrl+C to stop. `baseDir` is
provided per worker request; `--base-dir` applies to the one-request mode.

## Regression tests

From this directory:

```powershell
python -B -m unittest discover -s ../tests -p test_shape_inference.py -v
```

Tests cover meta execution, invalid inputs, cycles, constructor adaptation,
nested models, and worker recovery. For Python imports, add the parent `utils`
directory to the import path and use `auto_shape_fitting.shape_inference`.

See [utility architecture](../document.md) and [shape behavior](../../shape-inference.md).
