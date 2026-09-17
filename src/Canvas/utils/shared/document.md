# Shared utility contracts

This package holds logic used by both graph conversion and shape fitting. It does
not import either pipeline or run a worker.

| Module | Responsibility |
| --- | --- |
| `common.py` | Model/input naming and `modules.json` discovery/loading |
| `module_registry.py` | Trusted module registration, palette defaults, literal parsing, constructor resolution |
| `graph_order.py` | Stable numeric ordering of edge IDs |

The registry owns `register_module` and `register_adapter`. Built-in fitting rules
live in `auto_shape_fitting/adapters.py` and load with the shape interpreter.
Registering a custom module here does not create imports in generated source.

## Run a main example

This library has no standalone CLI. Use the following `main()` smoke example with
Python and PyTorch installed. Commands use PowerShell, starting at the repository root:

```powershell
Set-Location 'src/Canvas/utils/shared'
@'
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd().parent))
from shared.common import fix_model_name, load_modules_map
from shared.graph_order import ordered_edges
from shared.module_registry import constructor_kwargs, module_class


def main():
    assert fix_model_name("Demo Model") == "Demo_Model"
    edges = ordered_edges([{"id": "e10"}, {"id": "e2"}])
    assert [edge["id"] for edge in edges] == ["e2", "e10"]
    assert "nn.Linear" in load_modules_map()
    kwargs = constructor_kwargs(module_class("nn.Linear"), {
        "in_features": 4, "out_features": 3, "customArgs": "ignored",
    })
    assert kwargs == {"in_features": 4, "out_features": 3}
    print("Shared utilities OK")


if __name__ == "__main__":
    main()
'@ | python -B -
```

Expected: `Shared utilities OK`. The palette assertion also verifies that the
repository's `Canvas/data/modules.json` is discoverable from this directory.

## Integration tests

From this directory:

```powershell
python -B -m unittest discover -s ../tests -p 'test_*.py' -v
```

Constructor and edge-order behavior are exercised by generation and fitting tests.
See [utility architecture](../document.md).
