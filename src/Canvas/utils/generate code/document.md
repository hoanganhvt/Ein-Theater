# PyTorch Code Generation Engine (`src/Canvas/utils/generate code`)

This directory contains the core symbolic graph tracing, connection classification, and PyTorch AST code generation engine for **Ein Theater**.

The engine is encapsulated in [`gen_code.py`](./gen_code.py). It serves as both a standalone CLI compiler and the execution backend invoked by the Go web server (`SaveModelHandler`) to generate clean, production-ready PyTorch `nn.Module` models from visual canvas graphs.

---

## Architecture & Pipeline

```
Visual Canvas Graph (JSON)  ──►  Stdin / File
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   gen_code.py Compiler    │
                        ├───────────────────────────┤
                        │ 1. Schema Validation      │
                        │    (Canvas/data/modules.json)
                        │ 2. Topological Sort       │
                        │ 3. Connection Semantics   │
                        │ 4. AST Python Code Synth  │
                        └─────────────┬─────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
     <model_name>.json                               <model_name>.py
 (Graph schematic & metadata)                    (Executable PyTorch nn.Module)
```

### Modular Architecture

To ensure high maintainability, clean separation of concerns, and readability, the engine is partitioned into dedicated single-responsibility submodules orchestrated through `gen_code.py`:

| Module | Primary Responsibility |
| :--- | :--- |
| [`common.py`](./common.py) | Model identifier sanitization (`fix_model_name`) and dynamic `modules.json` schema location/loading (`load_modules_map`). |
| [`classifier.py`](./classifier.py) | Symbolic FX node inspection (`is_addition_node`, `is_concat_node`, etc.), connection classification (`classify_connection`), and graph summary table printer (`inspect_model_graph`). |
| [`tracer.py`](./tracer.py) | PyTorch `nn.Module` layer parameter extraction (`get_module_params`), argument serialization (`arg_to_str`), and FX model tracing to JSON graph (`model_to_json_graph`). |
| [`canvas.py`](./canvas.py) | Compiles visual schematic canvas JSON into FX computational graph JSON (`canvas_to_json_graph`), topological Kahn's sorting with spatial ordering, and connection flow synthesis. |
| [`codegen.py`](./codegen.py) | AST Python source code synthesis (`generate_code_from_json`, `generate_code_from_canvas`) and model directory packaging (`save_model_to_folder`). |
| [`__init__.py`](./__init__.py) | Package initialization exposing the public API. |
| [`gen_code.py`](./gen_code.py) | Unified façade and CLI compiler preserving 100% backward compatibility for the Go backend and external CLI invocations. |

---


## Command-Line Interface (CLI)

`gen_code.py` can be executed directly from the terminal or invoked via child process pipes.

### Syntax

```bash
python "src/Canvas/utils/generate code/gen_code.py" [OPTIONS]
```

### Options

| Flag | Argument | Description |
| :--- | :--- | :--- |
| `--save-canvas` | `<file_path>` or `-` | Reads canvas JSON from `<file_path>` or standard input (`-`), compiles the PyTorch model script and JSON specification, and saves them to `<out-dir>/<model_name>/`. Outputs JSON status to stdout. |
| `--canvas-json` | `<json_string>` | Parses raw canvas JSON string directly from the CLI argument, compiles and saves the model package to `<out-dir>/<model_name>/`. Outputs JSON status to stdout. |
| `--out-dir` | `<directory>` | Target output directory where `<model_name>/` subfolder will be created (default: `./outputs`). |
| `--help`, `-h` | None | Displays help message with command options. |


### CLI Examples

1. **Compile canvas JSON file to target directory**:
   ```bash
   python "src/Canvas/utils/generate code/gen_code.py" --save-canvas my_canvas.json --out-dir C:/my_models
   ```
   *Generates:*
   - `C:/my_models/<model_name>/<model_name>.json`
   - `C:/my_models/<model_name>/<model_name>.py`

2. **Compile via standard input pipe (as done by Go backend)**:
   ```bash
   cat my_canvas.json | python "src/Canvas/utils/generate code/gen_code.py" --save-canvas - --out-dir ./workspace
   ```

3. **Compile from inline JSON string**:
   ```bash
   python "src/Canvas/utils/generate code/gen_code.py" --canvas-json "{\"name\": \"my_model\", \"nodes\": [], \"edges\": []}" --out-dir ./workspace
   ```

---


## Integration with the Go Backend

When a user triggers **Save Model** (`Ctrl+S` or workspace button) in the Ein Theater UI:

1. The frontend sends `POST /api/workspace/save-model` with the current workspace directory and project ID.
2. The Go backend (`src/Canvas/handler/workspace_handlers.go`: `SaveModelHandler`) locates `gen_code.py` using `findGenCodePyPath()`.
3. It spawns the compiler subprocess:
   ```go
   cmd := exec.Command("python", genCodePyPath, "--save-canvas", "-", "--out-dir", cleanTarget)
   cmd.Stdin = strings.NewReader(string(canvasBytes))
   ```
4. `gen_code.py` emits a JSON result status to stdout:
   ```json
   {
     "status": "ok",
     "folder": "C:/path/to/workspace/my_model",
     "folderName": "my_model",
     "jsonFile": "C:/path/to/workspace/my_model/my_model.json",
     "pyFile": "C:/path/to/workspace/my_model/my_model.py",
     "modelName": "my_model"
   }
   ```
5. The Go handler responds to the frontend, which displays a notification toast confirming the save.

---

## Programmatic Usage in Python

Because the folder name contains a space (`generate code`), load the module dynamically using Python's `importlib.util`:

```python
import importlib.util
from pathlib import Path

# Resolve path to gen_code.py
gen_code_path = Path(__file__).resolve().parent / "gen_code.py"

spec = importlib.util.spec_from_file_location("gen_code", gen_code_path)
gen_code = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen_code)

# Generate PyTorch code from canvas JSON data dict
code = gen_code.generate_code_from_json(canvas_data)
print(code)
```

---

## Module Definitions Resolution

`gen_code.py` resolves layer definitions from `modules.json` by inspecting candidate relative paths dynamically (`src/Canvas/data/modules.json`, `src/Canvas/static/data/modules.json`, etc.), allowing it to be executed from any current working directory (repository root, `src/`, or external test runners).

---

## Related Documentation

- [Canvas Subsystem Documentation](../../document.md) — Comprehensive overview of the Canvas mode architecture.
- [Root Documentation](../../../../document.md) — Main overview of Ein Theater.
- [Backend Handler Documentation](../../handler/document.md) — Detailed Go backend architecture, concurrency model, and REST handlers.
- [Frontend JavaScript Documentation](../../static/js/document.md) — Client-side ES6 architecture and Vis.js/Canvas rendering pipeline.
