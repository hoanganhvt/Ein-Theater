# Auto Shape Size Fit Engine

The **Auto Shape Size Fit** subsystem is responsible for ensuring that a user's visually constructed PyTorch neural network mathematically connects and executes without runtime dimension errors. It dynamically resolves `in_channels`, `in_features`, and `num_features` for all layers.

---

## 1. Native PyTorch FX Execution (`shape_fitter.py`)

Previously, this engine relied on manual mathematical formulas and custom topological sorting logic. It has since been completely rewritten to leverage PyTorch FX's native graph interpreter and `ShapeProp`.

### How It Works

1. **Graph Construction**: The JSON graph (from the frontend) is parsed and translated into a raw, sequential `torch.fx.GraphModule`.
2. **Dummy Tensor Injection**: The engine inspects input/placeholder nodes (`input_type: image`, `text`, etc.) and generates actual PyTorch dummy tensors (e.g. `torch.randn(1, 3, 224, 224)`).
3. **Intercept & Fix (`AutoFixShapeProp`)**: The custom `ShapeProp` subclass pushes the tensors through the graph. Before executing any layer (`call_module`), it inspects the upstream tensor.
   - If an incoming tensor has 16 channels, but the downstream `nn.Conv2d` layer was configured for `in_channels=1`, `AutoFixShapeProp` dynamically re-instantiates the `nn.Conv2d` layer with `in_channels=16` on the fly.
   - The same applies for `nn.Linear` (`in_features`) and `nn.BatchNorm2d` (`num_features`).
4. **Native Propagation**: After the layer is fixed, PyTorch is allowed to natively execute the forward pass (`super().run_node(n)`). This guarantees that output shapes and complex mathematical logic (like strides, dilations, transposed padding, and grouped convolutions) are calculated exactly as PyTorch would at runtime.
5. **State Synchronization**: Once the graph propagation finishes, the engine extracts the updated parameters from the modified modules, records the tensor shapes for every node, and writes them back into the JSON payload for the frontend UI.

---

## 2. Supported Layer Types & Adaptations

Because the engine utilizes native PyTorch execution, **all PyTorch layers** are inherently supported for shape propagation. The engine specifically targets the following hyperparameters for automatic correction:

| Module / Layer | Automatically Fixed Parameters |
| :--- | :--- |
| `nn.Linear` | `in_features` |
| `nn.Conv1d`, `nn.Conv2d`, `nn.Conv3d` | `in_channels` |
| `nn.ConvTranspose1d/2d/3d` | `in_channels` |
| `nn.BatchNorm1d`, `nn.BatchNorm2d` | `num_features` |

If a residual addition (`torch.add`) encounters a spatial mismatch, PyTorch will immediately throw an exception, which the engine catches and returns as a user-facing warning in the UI (e.g. *"Node add_1 failed during shape propagation"*).

---

## 3. Programmatic API

```python
import json

# Load module
from shape_fitter import auto_shape_size_fit

# Load model JSON (from canvas or generate code)
with open("model.json", "r", encoding="utf-8") as f:
    model_data = json.load(f)

# Execute fit
result = auto_shape_size_fit(model_data)

# Access fitted graph and report
fitted_model = result['model']
adjustments = result['adjustments']
warnings = result['warnings']
shapes = result['shapes']

print(f"Adjustments ({len(adjustments)}):", adjustments)
print(f"Warnings ({len(warnings)}):", warnings)
```

---

## Related Documentation

- [Canvas Subsystem Documentation](../../document.md) — Comprehensive overview of the Canvas mode architecture.
- [Root Documentation](../../../../document.md) — Main overview of Ein Theater.
- [PyTorch Code Generation Engine](../generate%20code/document.md) — FX graph tracing, and connection classification reference.
