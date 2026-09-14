# Auto Shape Size Fit Engine (`src/Canvas/utils/auto shape size fit`)

This directory contains the modular automated tensor shape propagation, parameter fitting, and skip/residual padding auto-resolution engine for **Ein Theater**.

---

## 1. Architectural Overview & Modular Structure

To maintain high readability, separation of concerns, and clean maintainability, the engine is partitioned into dedicated single-responsibility submodules:

```
src/Canvas/utils/auto shape size fit/
├── __init__.py           # Package exports (auto_shape_size_fit, ShapeFitter, topological_sort)
├── topo.py               # Kahn's algorithm for dependency ordering & cycle detection
├── layers.py             # Layer dimension fitting handlers & output shape computation
├── padding_solver.py     # Spatial padding & output_padding resolution for skip/residual/concat
├── shape_fitter.py       # Orchestrator class (ShapeFitter) & public facade CLI
└── document.md           # Technical documentation & specification
```

### Submodule Responsibilities

| Module | Primary Responsibility |
| :--- | :--- |
| [`topo.py`](./topo.py) | Executes Kahn's topological sort on visual graph node dependencies (`node['inputs']`), identifying causal forward order and catching cyclic graphs. |
| [`layers.py`](./layers.py) | Contains dedicated dimension handlers for PyTorch modules (`nn.Linear`, `nn.Conv2d`, `nn.ConvTranspose2d`, `nn.Conv1d`, pooling, `nn.BatchNorm`, `nn.LayerNorm`, `nn.MultiheadAttention`, `nn.Embedding`, `nn.Flatten`). |
| [`padding_solver.py`](./padding_solver.py) | Performs upstream path traversal through shape-preserving operations (`relu`, `batchnorm`, `dropout`) and solves exact symmetric padding equations for skip/residual additions and concatenations. |
| [`shape_fitter.py`](./shape_fitter.py) | Orchestrator class (`ShapeFitter`) coordinating topological sorting, shape propagation, layer parameter adaptation, code template synchronization, and CLI parsing. |
| [`__init__.py`](./__init__.py) | Exposes the clean public API. |

---

## 2. Processing Pipeline

```
Visual Canvas Graph JSON / FX Graph JSON
                   │
                   ▼
┌──────────────────────────────────────────────┐
│           1. Topological Sort                │
│             (topo.py: Kahn's)                │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│       2. Placeholder Shape Inference         │
│     (image, text, audio, raw, or custom)     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│        3. Sequential Shape Propagation       │
│               & Layer Fitting                │
│     - in_features  <- input[-1]              │
│     - in_channels  <- input[1]               │
│     - embed_dim    <- input[-1]              │
│     - num_features <- input[1]               │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│    4. Spatial Padding Solver for Skips/Res   │
│         (padding_solver.py: 2p solver)       │
│  - Solves: 2p = s(H_target-1) + d(k-1)+1-Hin │
│  - Traces upstream through activations       │
│  - If unfixable -> Emits explicit warnings   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  5. Code Template & Canvas Synchronization   │
│  - node['params'] & node['codeTemplate']     │
│  - canvas['nodes'] visual params             │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│                Result Dict                   │
│  - model: Fitted Graph JSON                  │
│  - adjustments: Changed layer params         │
│  - padding_adjustments: Adjusted paddings    │
│  - warnings: Actionable warnings for user    │
│  - shapes: Per-node output tensor shapes     │
└──────────────────────────────────────────────┘
```

---

## 3. Mathematical Foundations & Padding Auto-Resolution

### Convolution Output Dimensions
For an input of spatial dimensions $(H_{in}, W_{in})$ into an `nn.Conv2d` layer with kernel $k$, stride $s$, padding $p$, and dilation $d$:

$$H_{out} = \left\lfloor \frac{H_{in} + 2p_h - d_h(k_h - 1) - 1}{s_h} \right\rfloor + 1$$

$$W_{out} = \left\lfloor \frac{W_{in} + 2p_w - d_w(k_w - 1) - 1}{s_w} \right\rfloor + 1$$

### Residual Skip Connection Alignment Solver
When two branches converge at an addition (`torch.add`) or concatenation (`torch.cat`), their spatial dimensions must match ($H_1 = H_2, W_1 = W_2$). If branch $A$ went through a convolution and has spatial size $(H_{conv}, W_{conv})$ differing from target $(H_{target}, W_{target})$:

$$s \cdot (H_{target} - 1) = H_{in} + 2p - d(k - 1) - 1$$

$$2p = s \cdot (H_{target} - 1) + d \cdot (k - 1) + 1 - H_{in}$$

1. **Integer Symmetric Padding**: If $2p \ge 0$ and $2p \pmod 2 = 0$, symmetric padding $p = 2p // 2$ is applied.
2. **Re-propagation**: Shapes along the upstream path from the convolution through intervening activations/norms to the convergence node are updated.
3. **Unfixable Warning**: If $2p < 0$ or non-integer (e.g. stride $s > 1$ downsampling), an explicit warning is generated:
   ```
   Node '<id>' (Add): spatial mismatch (H1, W1) vs (H2, W2) could not be resolved by padding adjustments. Please adjust stride or padding manually.
   ```

---

## 4. Supported Layer Types & Adaptations

| Module / Function | Key Parameters Fitted | Output Shape Calculation |
| :--- | :--- | :--- |
| `nn.Linear` | `in_features` $\leftarrow \text{input}[-1]$ | `(*input[:-1], out_features)` |
| `nn.Conv2d` | `in_channels` $\leftarrow \text{input}[1]$ | `(B, out_channels, H_out, W_out)` |
| `nn.ConvTranspose2d` | `in_channels` $\leftarrow \text{input}[1]$, `output_padding` | `(B, out_channels, H_out, W_out)` |
| `nn.Conv1d` | `in_channels` $\leftarrow \text{input}[1]$ | `(B, out_channels, L_out)` |
| `nn.MaxPool2d` / `nn.AvgPool2d` | Spatial sanity check | `(B, C, H_out, W_out)` |
| `nn.AdaptiveAvgPool2d` | Output size matching | `(B, C, H_target, W_target)` |
| `nn.BatchNorm2d` / `nn.BatchNorm1d` | `num_features` $\leftarrow \text{channels}$ | Unchanged |
| `nn.LayerNorm` | `normalized_shape` $\leftarrow \text{input}[-1]$ | Unchanged |
| `nn.MultiheadAttention` | `embed_dim` $\leftarrow \text{input}[-1]$, `num_heads` divisor | Unchanged |
| `nn.Embedding` | Modality checks | `(*input, embedding_dim)` |
| `torch.cat` | Channel dimension summation | `(B, \sum C_i, H, W)` |
| `torch.add` / `accumulate` | Residual alignment solver | Dynamic padding resolution |
| `flatten` / `transpose` / `mean` | High-dimensional tensor shaping | Dynamic shape inference |

---

## 5. Programmatic API

```python
import json
import importlib.util

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
padding_adjustments = result['padding_adjustments']
warnings = result['warnings']
shapes = result['shapes']

print(f"Adjustments ({len(adjustments)}):", adjustments)
print(f"Padding Adjustments ({len(padding_adjustments)}):", padding_adjustments)
print(f"Warnings ({len(warnings)}):", warnings)
```

---

## 6. Command-Line Interface (CLI)

```bash
python "src/Canvas/utils/auto shape size fit/shape_fitter.py" --input path/to/model.json --output path/to/fitted_model.json
```

---

## 7. Tricky Test Models Suite (`test/auto shape size fit/test shape fit/`)

A dedicated generator script [`test/auto shape size fit/generate_tricky_models.py`](../../../test/auto%20shape%20size%20fit/generate_tricky_models.py) uses the code generation tracer (`model_to_json_graph`) to generate raw graph JSONs, deliberately injects challenging/corrupted dimensions, and verifies that `auto_shape_size_fit` resolves every mismatch:

| Tricky Model | Path | Tricky Geometry & Challenges | Output Shape |
| :--- | :--- | :--- | :--- |
| **`tricky_unet`** | `test shape fit/tricky_unet/` | Rectangular $(1, 36, 48)$ input, 2 downsampling & 2 upsampling levels, corrupted `in_channels` across 9 modules, multi-level skip concatenations ($64$ and $32$ channels). | `[1, 1, 36, 48]` |
| **`tricky_transformer`** | `test shape fit/tricky_transformer/` | Odd sequence length ($T=63$), non-power-of-2 embedding dimension ($d=72$), corrupted attention `embed_dim`, LayerNorms, and FFN linear layers. | `[1, 63, 10]` |
| **`tricky_vit`** | `test shape fit/tricky_vit/` | Rectangular image $(3, 40, 56)$ yielding $140$ token patches ($10 \times 14$), embedding dimension $48$, corrupted patch conv, attention, and MLP projections. | `[1, 25]` |
| **`tricky_lenet`** | `test shape fit/tricky_lenet/` | Prime spatial dimensions $(1, 37, 43)$, dilated convolution ($d=2$), pooling, and exact flattened dimension calculation ($896$ features). | `[1, 17]` |
| **`tricky_inception`** | `test shape fit/tricky_inception/` | Odd spatial size $(16, 31, 31)$, parallel branches with $1 \times 1$, $3 \times 3$ ($p=0 \to 1$), and $5 \times 5$ ($p=0 \to 2$) requiring multi-branch padding auto-resolution. | `[1, 10, 31, 31]` |
| **`tricky_convnext`** | `test shape fit/tricky_convnext/` | $7 \times 7$ Depthwise conv with `padding=0` causing spatial collapse ($28 \times 28 \to 22 \times 22$) vs skip connection. Auto-solver solved $2p=6 \implies p=3$ and restored parity. | `[1, 24, 28, 28]` |

---

## Related Documentation

- [Canvas Subsystem Documentation](../../document.md) — Comprehensive overview of the Canvas mode architecture.
- [Root Documentation](../../../../document.md) — Main overview of Ein Theater.
- [PyTorch Code Generation Engine](../generate%20code/document.md) — AST compiler, FX graph tracing, and connection classification reference.
- [Backend Handler Documentation](../../handler/document.md) — Detailed Go backend architecture, concurrency model, and REST handlers.
- [Frontend JavaScript Documentation](../../static/js/document.md) — Client-side ES6 architecture and Vis.js/Canvas rendering pipeline.
