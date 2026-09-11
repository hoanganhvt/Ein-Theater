# PyTorch Code Generation Engine (`src/utils/generate code`)

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
                        │    (src/data/modules.json)│
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

### Core Responsibilities

1. **Symbolic Tracing**: Uses PyTorch FX (`torch.fx.symbolic_trace`) to extract computational graphs from PyTorch models without executing concrete tensor computations.
2. **Connection Semantics Classification**: Identifies graph structural patterns:
   - **Normal Connections**: Direct layer-to-layer data pass.
   - **Residual Connections**: Additive pathways (`+`, `torch.add`) with dimension matching.
   - **Skip Connections**: Concatenative skip pathways (`torch.cat`, `torch.stack`) across channel dimensions (e.g. U-Net, DenseNet).
   - **Gated Skips**: Multiplicative feature gating and attention modulation (`*`, `torch.mul`).
   - **Multi-Input / Multi-Output**: Models accepting tuples or dictionaries of input tensors and returning multiple output branches.
3. **AST Code Synthesis**: Assembles executable, PEP8-formatted Python code defining an `nn.Module` class named after the model (`class <model_name>(nn.Module):`) with properly initialized layers (`__init__`), accurate forward execution passes (`forward`), device assignment (`device='cpu'`), and a standalone runnable `__main__` execution block.
4. **Bidirectional Serialization**: Translates PyTorch models into Ein Theater canvas JSON schematics and vice-versa.
5. **Model Name Sanitization (`fix_model_name`)**: Automatically cleans invalid model names by replacing spaces with `_`, and prepending `model_` if a number precedes the text (starts with a digit), guaranteeing a valid Python identifier and directory name.

---

## Command-Line Interface (CLI)

`gen_code.py` can be executed directly from the terminal or invoked via child process pipes.

### Syntax

```bash
python "src/utils/generate code/gen_code.py" [OPTIONS]
```

### Options

| Flag | Argument | Description |
| :--- | :--- | :--- |
| `--save-canvas` | `<file_path>` or `-` | Reads canvas JSON from `<file_path>` or standard input (`-`), generates the PyTorch model script and JSON specification, and writes them to `<out-dir>/<model_name>/`. |
| `--canvas-json` | `<file_path>` | Compiles the specified canvas JSON and outputs the generated Python code directly to stdout. |
| `--out-dir` | `<directory>` | Target output directory where `<model_name>/` subfolder will be created (default: `./outputs`). |
| `--test` | None | Runs the built-in test suite tracing and synthesizing experimental neural network architectures (UNet, ResNet, ViT, Gated CNN). |
| `--help`, `-h` | None | Displays help message with command options. |

### CLI Examples

1. **Compile canvas JSON file to target directory**:
   ```bash
   python "src/utils/generate code/gen_code.py" --save-canvas my_canvas.json --out-dir C:/my_models
   ```
   *Generates:*
   - `C:/my_models/<model_name>/<model_name>.json`
   - `C:/my_models/<model_name>/<model_name>.py`

2. **Compile via standard input pipe (as done by Go backend)**:
   ```bash
   cat my_canvas.json | python "src/utils/generate code/gen_code.py" --save-canvas - --out-dir ./workspace
   ```

3. **Preview generated Python code without saving**:
   ```bash
   python "src/utils/generate code/gen_code.py" --canvas-json my_canvas.json
   ```

4. **Run internal architecture tests**:
   ```bash
   python "src/utils/generate code/gen_code.py" --test
   ```

---

## Integration with the Go Backend

When a user triggers **Save Model** (`Ctrl+S` or workspace button) in the Ein Theater UI:

1. The frontend sends `POST /api/workspace/save-model` with the current workspace directory and project ID.
2. The Go backend (`src/handler/workspace_handlers.go`: `SaveModelHandler`) locates `gen_code.py` using `findGenCodePyPath()`.
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
     "json": "C:/path/to/workspace/my_model/my_model.json",
     "py": "C:/path/to/workspace/my_model/my_model.py",
     "model_name": "my_model"
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

`gen_code.py` resolves layer definitions from `src/data/modules.json` by inspecting candidate relative paths dynamically, allowing it to be executed from any current working directory (repository root, `src/`, or external test runners).
