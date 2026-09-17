# Canvas reading and graph conversion

This package reads editable Canvas JSON and converts visual nodes/connections
into computational nodes. Conversion does not run shape fitting or save artifacts.

| Module | Responsibility |
| --- | --- |
| `canvas.py` | `canvas_to_json_graph`: Canvas dictionary/JSON string to graph JSON string |
| `canvas_inputs.py` | Recognize inputs and normalize placeholder names/metadata |
| `canvas_layers.py` | Resolve layer targets and constructor metadata |
| `canvas_graph.py` | Traverse connections and select forward outputs |
| `saved_canvas.py` | `read_canvas(folder)`: load the editable canvas from a saved model |

`read_canvas(folder)` looks for `<folder-name>.json`, then the sanitized name. It
accepts a saved `canvas` wrapper or a raw canvas and requires editable layer types.
Graph conversion uses PyTorch constructor information through the shared registry;
the saved-JSON reader itself does not execute PyTorch models.

## Run a main example

This is a library package; it has no CLI `main.py`. The following complete example
defines and runs `main()` without adding a temporary source file. Use PowerShell
with Python and PyTorch available. Starting at the repository root:

```powershell
Set-Location 'src/Canvas/utils/read_canvas'
@'
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd().parent))
from read_canvas.canvas import canvas_to_json_graph


def main():
    canvas = {
        "name": "SmokeModel",
        "nodes": [
            {"id": "x", "layerType": "Input", "params": {"shape": "4"}},
            {"id": "relu", "layerType": "nn.ReLU", "params": {}},
        ],
        "edges": [{"id": "e0", "from": "x", "to": "relu"}],
    }
    graph = json.loads(canvas_to_json_graph(canvas))
    operations = [node["op"] for node in graph["nodes"]]
    assert operations == ["placeholder", "call_module", "output"]
    print("Canvas conversion OK:", operations)


if __name__ == "__main__":
    main()
'@ | python -B -
```

Expected: `Canvas conversion OK: ['placeholder', 'call_module', 'output']`.
To inspect an existing model instead, import `read_canvas` from
`read_canvas.saved_canvas` and pass the model folder, not its `.py` or `.json` file.

## Integration tests

From this directory:

```powershell
python -B -m unittest discover -s ../tests -p test_codegen.py -v
```

These tests exercise parsing through source generation, including disconnected
layers and the save CLI. See [utility architecture](../document.md).
