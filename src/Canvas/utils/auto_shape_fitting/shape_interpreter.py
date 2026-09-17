"""FX execution with constructor adaptation and per-node error isolation."""
import contextlib
import copy
import inspect
import io
import operator
import torch
from torch.fx.passes.shape_prop import ShapeProp

from auto_shape_fitting import adapters  # Register built-in adaptation rules.
from shared.module_registry import ADAPTERS, parameters, module_class, constructor_kwargs
from auto_shape_fitting.tensor_specs import UNRESOLVED, unresolved, tensor_tree

class CanvasShapeProp(ShapeProp):
    """FX interpreter that adapts module constructors just before dummy execution."""
    def __init__(self, module, engine, nodes, base_dir, active):
        super().__init__(module)
        self.engine, self.nodes, self.base_dir, self.active = engine, nodes, base_dir, active
        self.current_canvas = None

    def run_node(self, node):
        canvas = self.nodes.get(node.meta.get('canvas_id'))
        self.current_canvas = canvas
        if canvas is None:
            return super().run_node(node)
        info = canvas['tensorInfo']
        original_params = copy.deepcopy(canvas.get('params'))
        try:
            if node.meta.get('error'):
                raise ValueError(node.meta['error'])
            args, kwargs = self.fetch_args_kwargs_from_env(node)
            if unresolved(args):
                raise ValueError('Upstream shape is unresolved; check inputs or cycles')
            if args and isinstance(args[0], torch.Tensor):
                info['input'] = list(args[0].shape)
            # ShapeProp prints tracebacks before rethrowing. Return concise errors
            # to the canvas while allowing independent branches to continue.
            with contextlib.redirect_stderr(io.StringIO()):
                result = super().run_node(node)
            if result is UNRESOLVED:
                raise ValueError('Input shape is unresolved')
            info['outputTree'] = tensor_tree(result)
            if isinstance(result, torch.Tensor):
                if any(d <= 0 for d in result.shape):
                    raise ValueError('Layer produces a non-positive dimension')
                info['output'] = list(result.shape)
            return result
        except Exception as error:
            cause = error.__cause__ or error
            info.update(output=None, outputTree=None, auto=[], message=str(cause).split('\n')[0])
            canvas.pop('adaptedModel', None)
            canvas['params'] = original_params
            return UNRESOLVED

    def call_module(self, target, args, kwargs):
        node = self.current_canvas
        kind = node.get('layerType', '')
        if not args:
            raise ValueError('Connect an Input block to infer dimensions')
        if kind == 'IntegratedModel' or (node.get('params') or {}).get('model_path'):
            return self.engine.integrated(node, args, self.base_dir, self.active)
        if kind == 'Output':
            if len(args) != 1:
                raise ValueError('Output expects one tensor')
            return args[0]
        params = parameters(node)
        if kind == 'torch.cat':
            if len(args) < 2:
                raise ValueError('Connect at least two tensors for concatenation')
            return torch.cat(args, dim=params.get('dim', 1))
        if kind == 'torch.add':
            if len(args) < 2:
                raise ValueError('Connect at least two tensors for addition')
            result = args[0]
            for value in args[1:]:
                result = torch.add(result, value)
            return result
        if kind == 'operator.getitem':
            if len(args) != 1:
                raise ValueError('Tensor selection expects one input')
            return operator.getitem(args[0], params.get('index', 0))
        cls = module_class(kind)
        if params.get('customArgs'):
            raise ValueError('Register custom modules with named constructor parameters for shape inference')
        if not isinstance(args[0], torch.Tensor):
            raise ValueError('This layer received a tuple; select a tensor with operator.getitem first')
        updates = {}
        for base in cls.__mro__:
            if base in ADAPTERS:
                updates = ADAPTERS[base](params, args)
                break
        params.update(updates)
        ctor = constructor_kwargs(cls, params)
        if 'device' in inspect.signature(cls.__init__).parameters:
            ctor['device'] = 'meta'
        # Meta dummy tensors carry shape/dtype without allocating model weights
        # or image-sized activations, even for very large canvas configurations.
        with torch.device('meta'):
            module = cls(**ctor).eval()
        result = module(*args, **kwargs)
        self.module.set_submodule(target, module)
        node['params'] = params
        node['tensorInfo']['auto'] = list(updates)
        return result
