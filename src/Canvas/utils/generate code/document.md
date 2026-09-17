# PyTorch code generation

This directory contains only source generation and generated-artifact persistence.
Canvas parsing lives in `../read_canvas/`, shape fitting in `../auto_shape_fitting/`,
and shared constructor/naming utilities in `../shared/`.
See the [utility module map](../document.md) for all responsibilities and imports.

## Generation modules

| Module | Responsibility |
| --- | --- |
| `gen_code.py`, `__init__.py` | Public generation API and save CLI |
| `fx_builder.py` | FX forward graph and constructor statements |
| `source_helpers.py` | Integrated-model imports and example inputs |
| `source_renderer.py` | Standalone Python source assembly |
| `model_paths.py` | Relative generated-model references |
| `model_storage.py` | Coordinate fitting, prepare artifacts, validate syntax, and save |

The save coordinator calls fitting and parsing services; their implementations
remain in their own packages. The existing `gen_code.py` path is preserved for Go.
The package and CLI bootstrap the parent `utils` directory for sibling packages;
only the dynamically loaded CLI also adds its own directory for local imports.

## Save lifecycle

1. Deep-copy the canvas and infer shapes using PyTorch's `meta` device.
2. Reject diagnostics on connected nodes. Independent disconnected nodes can
   retain diagnostics without preventing a save.
3. Prepare adapted child models recursively. Changed children receive deterministic
   names with an `_adapted_<digest>` suffix; original model folders are preserved.
4. Convert each canvas into computational nodes, make model references relative,
   and render Python source using `torch.fx.Graph`.
5. Parse every generated source with `ast.parse` before writing the prepared plan.
6. Write `<output>/<model>/<model>.json` and `<output>/<model>/<model>.py`,
   including any adapted child folders.

There is no `temp.json` intermediate file. Compilation failures occur before any
planned artifacts are written; filesystem write failures are not transactional.
Disconnected layers remain constructor attributes but are omitted from `forward`.
Generated source includes an example execution block, not a full test suite.
Shape metadata is stored on canvas nodes; the renderer does not inject shape comments.
The generated `device` attribute does not automatically move tensors or parameters.

## Run main and execute the generated model

Use PowerShell with Python and PyTorch available. Starting at the repository root:

```powershell
Set-Location 'src/Canvas/utils/generate code'
python -B gen_code.py --help
$canvas = '{"name":"SmokeModel","nodes":[{"id":"x","layerType":"Input","params":{"input_type":"raw data","shape":"4","batch_size":2}},{"id":"dense","layerType":"nn.Linear","params":{"in_features":99,"out_features":3}}],"edges":[{"id":"e0","from":"x","to":"dense"}]}'
$canvas | python -B gen_code.py --save-canvas - --out-dir ./smoke-output
python -B ./smoke-output/SmokeModel/SmokeModel.py
```

`gen_code.py` runs its CLI `main()`. Saving fits `in_features` to `4` and prints a
JSON result identifying the generated `.json` and `.py` files. The last command
runs the generated model's own `__main__` example. Expected output includes
`Forward pass successful!` and `Output shape: torch.Size([2, 3])`.

This example writes to `smoke-output/SmokeModel` in the current directory; repeated
runs overwrite those example artifacts. The generated example catches forward
exceptions and prints `Forward pass failed`, so inspect its output rather than
relying only on the process exit code.

For an existing canvas, use `python -B gen_code.py --save-canvas ./canvas.json
--out-dir ./smoke-output` on one line. The CLI uses the input file's directory as
the default base directory for model references; stdin callers can pass `--base-dir`.

From this directory, run generation regressions with:

```powershell
python -B -m unittest discover -s ../tests -p test_codegen.py -v
```

## Python API

The directory name contains a space, so existing callers can load the entry point
by path:

```python
import importlib.util
from pathlib import Path

entry = Path("src/Canvas/utils/generate code/gen_code.py").resolve()
spec = importlib.util.spec_from_file_location("gen_code", entry)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

saved = api.save_model_to_folder(canvas_data, output_dir="./output", base_dir=".")
source = api.generate_code_from_canvas(canvas_data)
```

`save_model_to_folder` performs inference and validation. The source-only
`generate_code_from_canvas` and `generate_code_from_json` APIs do not fit shapes;
pass an inferred canvas when fitted constructor parameters are required.

## CLI and worker protocol

```sh
python "src/Canvas/utils/generate code/gen_code.py" --save-canvas canvas.json --out-dir output
python "src/Canvas/utils/auto_shape_fitting/shape_inference.py" --worker
```

The save CLI also accepts `--canvas-json`, `--save-canvas -` for stdin, and
`--base-dir` for resolving saved model references. It prints a JSON result with
`folder`, `folderName`, `jsonFile`, `pyFile`, `modelName`, and `adaptedModels`.

The worker accepts one JSON object per line:
`{"graph": {"nodes": [], "edges": []}, "baseDir": "."}`.
It returns `{"graph": ...}` or `{"error": "..."}` and continues after bad requests.
Without `--worker`, inference reads one canvas from stdin and prints the inferred canvas.

## Extension and verification

Use `register_module(name, cls, adapter=None)` and `register_adapter(*classes)`
from `auto_shape_fitting.shape_inference` (with `src/Canvas/utils` on `sys.path`) to extend trusted inference behavior. Adapters update
constructor parameters; PyTorch computes output shapes. Registering an inference
module alone does not provide imports for standalone generated source.

With Python and PyTorch installed, run from the repository root:

```sh
python -B -m unittest discover -s "src/Canvas/utils/tests" -p "test_*.py" -v
```

Tests cover meta execution, invalid branches, cycles, recurrent/attention modules,
recursive model adaptation, save failure isolation, worker recovery, disconnected
layers, package imports, dynamic loading, and the save CLI.

See [Canvas architecture](../../document.md) and
[shape adaptation](../../shape-inference.md) for backend integration details.
