# Python shape adaptation

The public API and worker entry point live in `utils/auto_shape_fitting/shape_inference.py`.
Implementation is split across `shape_engine.py` (DAG orchestration),
`shape_interpreter.py` (meta execution), `adapters.py` (constructor adapters),
`tensor_specs.py` (input validation), and `integrated_models.py` (recursive adaptation).
The shared registry lives in `utils/shared/module_registry.py`; saved canvas reading
lives in `utils/read_canvas/saved_canvas.py`. See the [module reference](utils/document.md).
Go handles HTTP, snapshots, persistence, and communication with a persistent
Python worker. There are no layer size formulas or adaptation rules in Go.

## Execution

1. Python orders the canvas with Kahn's topological-sort algorithm. Invalid
   references and cycles receive diagnostics; independent branches continue.
   Incoming arguments use the same numeric edge order as code generation.
2. Input shapes and dtypes produce dummy tensors on PyTorch's `meta` device.
   Input dimensions exclude batch size; the separate batch field is prepended.
3. The engine constructs a `torch.fx.GraphModule`. A `ShapeProp` interpreter
   adapts input-dependent constructor fields immediately before executing each
   real PyTorch module on dummy tensors.
4. Output sizes come from PyTorch kernels, including pooling, transposed
   convolutions, adaptive pooling, padding, upsampling, and reshape operations.
   Shapes/dtypes are stored in FX metadata and the canvas's `tensorInfo`.
5. Successful changes update canvas parameters. Failed nodes retain their old
   parameters and clear stale output metadata. Generation uses the same
   constructor arguments as inference.

For example, Input `[1,28,28]`, Conv2d (8 outputs, kernel 3, padding 1),
MaxPool2d (kernel/stride 2), Flatten, and Linear adapts the convolution to
`in_channels=1` and Linear to `in_features=1568`. Changing the input to
`[3,32,32]` changes these to 3 and 2048 while retaining output choices.

The JSON-lines worker loads PyTorch once and reuses it across canvas edits.
Go releases the project lock during analysis and only applies results if the
snapshot still matches. Worker errors appear on the canvas; missing Python
does not prevent opening or editing the graph. Requests time out after 45 seconds.
Saving runs fresh analysis in Python and rejects unresolved connected nodes.

## Extension points

Ordinary `torch.nn` modules are discovered dynamically. Modules whose output
depends only on their configured parameters need no new shape rule if PyTorch
supports their meta execution. Constructor adapters are needed only for
parameters that must be inferred from incoming tensors.

With `src/Canvas/utils` on the Python import path:

```python
from torch import nn
from auto_shape_fitting.shape_inference import register_adapter

@register_adapter(nn.Linear)
def adapt_linear(params, args):
    return {'in_features': args[0].shape[-1]}
```

Adapters cover Linear, regular/transposed convolutions, normalization,
recurrent layers, and attention. The registry checks the class MRO, so
subclasses can reuse or override adapters. `register_module(name, cls, adapter)`
adds a trusted custom module to the shape engine; custom executable code still
needs the corresponding class/import in the code generator. Canvas text is not
evaluated to discover custom classes.

Recurrent/attention tuple outputs are represented in `tensorInfo.outputTree`.
Use the **Select Tensor** (`operator.getitem`) palette node to select an output
before connecting an ordinary tensor layer. For example, LSTM → Select Tensor
(index 0) → Linear selects the sequence output. Multiple input wires are passed
as positional arguments; use their creation order for query/key/value inputs.

Meta tensors avoid allocating real model weights and image-sized activations.
Execution uses evaluation mode and does not train or transfer pretrained weights.
Data-dependent operators and modules lacking meta kernels can report an error.
Shape success does not guarantee valid input values, all runtime dtype checks,
training behavior, or numerical correctness. There is no automatic fallback
that allocates large real tensors.

## Recursive integrated models

An integrated block loads its saved canvas, substitutes incoming dummy tensors
for its Input nodes, and runs the same FX engine recursively. Relative references
resolve against the containing model folder. Saved Input order and numeric
incoming-edge order define multi-input argument mapping.

An incompatible model produces a pending adapted canvas. On Save Model it is
generated in a subfolder inside the saved parent folder; incompatible nested
models get their own subfolders recursively. Source files are preserved.
Content-derived variant names allow differently shaped instances of one source
to coexist. The parent uses relative references to variants, and the live canvas
adopts them after saving unless newer edits arrived during generation.
Changed instances clear pretrained-weight references.

Integrated models currently need one tensor output; Select Tensor can resolve
tuple outputs inside their canvases. Circular file references, missing sources,
invalid argument counts, and unsupported connected operations report errors.
Recursion is limited to 32 levels. All nested code is prepared before files are
written, so compilation failures do not leave partially generated subfolders.

## Validation

From `src` with Python and PyTorch installed:

```powershell
python -B -m unittest discover -s 'src/Canvas/utils/tests' -p 'test_*.py' -v
go test ./...
node Canvas/static/js/api.test.mjs
```

Python tests compare inferred shapes to real PyTorch execution and cover FX
metadata, resizing, branching/cycles, tuple selection, attention, custom module
registration, recursive copies, multiple inputs, reload, and failed saves.
Go tests cover the worker protocol, interpreter reuse, snapshot isolation, and
preserving newer edits.

References: [PyTorch FX](https://docs.pytorch.org/docs/2.14/fx.html) and
[meta tensors](https://docs.pytorch.org/docs/2.14/meta.html).
