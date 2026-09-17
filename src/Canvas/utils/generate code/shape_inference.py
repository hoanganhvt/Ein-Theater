"""Canvas shape adaptation using DAG traversal, torch.fx and meta dummy tensors.

No spatial output formulas live here: PyTorch executes every supported module.
Register an adapter only when a constructor parameter depends on its inputs.
The JSON-lines worker keeps PyTorch loaded between interactive canvas edits.
"""
import argparse
import ast
import contextlib
import copy
import inspect
import io
import json
import operator
import os
import sys
from collections import deque
from functools import lru_cache
from pathlib import Path

import torch
from torch import fx, nn
from torch.fx.passes.shape_prop import ShapeProp

from common import fix_model_name, load_modules_map


ADAPTERS = {}
MODULES = {}
UNRESOLVED = object()


def register_adapter(*classes):
    """Register constructor adaptation; output shapes still come from PyTorch."""
    def register(fn):
        for cls in classes:
            ADAPTERS[cls] = fn
        return fn
    return register


def register_module(name, cls, adapter=None):
    """Explicit extension point for trusted custom modules (no eval/import of canvas text)."""
    MODULES[name] = cls
    if adapter:
        ADAPTERS[cls] = adapter


@register_adapter(nn.Linear)
def linear(params, args):
    return {'in_features': args[0].shape[-1]}


@register_adapter(nn.Conv1d, nn.Conv2d, nn.Conv3d,
                  nn.ConvTranspose1d, nn.ConvTranspose2d, nn.ConvTranspose3d)
def convolution(params, args):
    return {'in_channels': args[0].shape[1]}


@register_adapter(nn.BatchNorm1d, nn.BatchNorm2d, nn.BatchNorm3d,
                  nn.InstanceNorm1d, nn.InstanceNorm2d, nn.InstanceNorm3d)
def normalization(params, args):
    return {'num_features': args[0].shape[1]}


@register_adapter(nn.GroupNorm)
def group_norm(params, args):
    return {'num_channels': args[0].shape[1]}


@register_adapter(nn.LayerNorm)
def layer_norm(params, args):
    configured = params.get('normalized_shape', 1)
    count = len(configured) if isinstance(configured, (tuple, list)) else 1
    if count < 1 or count >= args[0].ndim:
        raise ValueError('LayerNorm normalized dimensions must exclude the batch axis')
    dims = list(args[0].shape[-count:])
    return {'normalized_shape': dims if count > 1 else dims[0]}


@register_adapter(nn.RNN, nn.GRU, nn.LSTM, nn.RNNCell, nn.GRUCell, nn.LSTMCell)
def recurrent(params, args):
    return {'input_size': args[0].shape[-1]}


@register_adapter(nn.MultiheadAttention)
def attention(params, args):
    result = {'embed_dim': args[0].shape[-1]}
    if len(args) == 3:
        result.update(kdim=args[1].shape[-1], vdim=args[2].shape[-1])
    return result


@lru_cache(maxsize=1)
def schemas():
    return load_modules_map()


def literal(value):
    if isinstance(value, str):
        try:
            return ast.literal_eval(value)
        except (ValueError, SyntaxError):
            pass
    return value


def parameters(node):
    # Match the defaults used by the canvas code generator.
    fields = schemas().get(node.get('layerType'), {}).get('fields', [])
    result = {f['key']: literal(f['default']) for f in fields if 'default' in f}
    result.update({k: literal(v) for k, v in (node.get('params') or {}).items()})
    return result


def module_class(kind):
    cls = MODULES.get(kind)
    if cls is None and kind.startswith('nn.'):
        cls = getattr(nn, kind[3:], None)
    if not isinstance(cls, type) or not issubclass(cls, nn.Module):
        raise ValueError(f'Unregistered module: {kind}')
    return cls


def constructor_kwargs(cls, params):
    """Shared by inference and code generation so inferred fields are never dropped."""
    signature = inspect.signature(cls.__init__)
    accepts_kwargs = any(p.kind == p.VAR_KEYWORD for p in signature.parameters.values())
    return {k: v for k, v in params.items() if k != 'customArgs' and (k in signature.parameters or accepts_kwargs)}


def input_spec(params):
    defaults = {'image': [3, 224, 224], 'text': [128], 'audio': [1, 16000], 'raw data': [64]}
    modality = params.get('input_type', 'image')
    raw = params.get('shape_preset')
    if raw is None or raw == '' or raw == 'custom':
        raw = params.get('custom_shape') or params.get('shape') or defaults.get(modality, [64])
    raw = literal(raw)
    dims = list(raw) if isinstance(raw, (list, tuple)) else [raw]
    dims.insert(0, params.get('batch_size', 1))
    if any(isinstance(d, bool) or not isinstance(d, (int, float)) or int(d) != d or d <= 0 or d > 10**9 for d in dims):
        raise ValueError('Input dimensions and batch size must be positive integers')
    dtype_name = params.get('dtype') or ('int64' if modality == 'text' else 'float32')
    dtype = getattr(torch, str(dtype_name), None)
    if not isinstance(dtype, torch.dtype):
        raise ValueError(f'Unsupported input dtype: {dtype_name}')
    return tuple(int(d) for d in dims), dtype


def tensor_tree(value):
    if isinstance(value, torch.Tensor):
        return {'shape': list(value.shape), 'dtype': str(value.dtype).removeprefix('torch.')}
    if isinstance(value, (tuple, list)):
        return [tensor_tree(item) for item in value]
    if isinstance(value, dict):
        return {key: tensor_tree(item) for key, item in value.items()}
    return None


def unresolved(value):
    if value is UNRESOLVED:
        return True
    if isinstance(value, (tuple, list)):
        return any(unresolved(v) for v in value)
    if isinstance(value, dict):
        return any(unresolved(v) for v in value.values())
    return False


def ordered_edges(edges):
    def key(pair):
        pos, edge = pair
        eid = str(edge.get('id', ''))
        return (int(eid[1:]) if eid.startswith('e') and eid[1:].isdigit() else pos, pos)
    return [edge for _, edge in sorted(enumerate(edges), key=key)]


def read_canvas(folder):
    folder = Path(folder).resolve(strict=True)
    path = folder / (folder.name + '.json')
    if not path.is_file():
        path = folder / (fix_model_name(folder.name) + '.json')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    canvas = data.get('canvas', data)
    if not canvas.get('nodes') or any(not n.get('layerType') for n in canvas['nodes']):
        raise ValueError('Integrated model requires an editable saved canvas with layer types')
    canvas.setdefault('name', fix_model_name(folder.name))
    return canvas


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


class ShapeEngine:
    def infer(self, canvas, base_dir='', overrides=None, active=()):
        data = copy.deepcopy(canvas.get('canvas', canvas))
        nodes = {str(n['id']): n for n in data.get('nodes', [])}
        if len(nodes) != len(data.get('nodes', [])):
            raise ValueError('Duplicate canvas node IDs')
        if len(nodes) > 10000:
            raise ValueError('Shape inference supports at most 10000 nodes per canvas')
        incoming = {nid: [] for nid in nodes}
        successors = {nid: [] for nid in nodes}
        errors = {}
        for edge in ordered_edges(data.get('edges', [])):
            source, dest = str(edge.get('from')), str(edge.get('to'))
            if dest not in nodes:
                continue
            if source not in nodes:
                errors[dest] = 'Connection references a missing source node'
                continue
            incoming[dest].append(source)
            successors[source].append(dest)
        # Kahn's algorithm orders execution and isolates cycles and their descendants.
        degrees = {nid: len(sources) for nid, sources in incoming.items()}
        ready = deque(nid for nid in nodes if degrees[nid] == 0)
        order = []
        while ready:
            nid = ready.popleft()
            order.append(nid)
            for dest in successors[nid]:
                degrees[dest] -= 1
                if degrees[dest] == 0:
                    ready.append(dest)
        for nid in nodes:
            if degrees[nid] > 0:
                errors[nid] = 'Cycle or dependency on a cycle detected'
                order.append(nid)
        root, graph, env, dummy = nn.Module(), fx.Graph(), {}, []
        for index, nid in enumerate(order):
            node = nodes[nid]
            node.pop('adaptedModel', None)
            node['tensorInfo'] = dict(input=None, output=None, auto=[], message='', outputTree=None)
            kind = node.get('layerType')
            if kind == 'Input':
                value = UNRESOLVED
                try:
                    if incoming[nid]:
                        raise ValueError('Input source cannot have incoming connections')
                    if overrides and nid in overrides:
                        value = overrides[nid]
                        if not isinstance(value, torch.Tensor) or value.ndim < 2:
                            raise ValueError('Integrated inputs need a tensor with a batch axis')
                        params = node.setdefault('params', {})
                        shape = ', '.join(str(d) for d in value.shape[1:])
                        params.update(shape_preset='custom', custom_shape=shape, shape=shape,
                                      batch_size=value.shape[0], dtype=str(value.dtype).removeprefix('torch.'))
                    else:
                        shape, dtype = input_spec(node.get('params') or {})
                        value = torch.empty(shape, dtype=dtype, device='meta')
                except Exception as error:
                    errors[nid] = str(error)
                env[nid] = graph.placeholder(f'input_{index}')
                dummy.append(value)
            else:
                key = f'layer_{index}'
                root.add_module(key, nn.Identity())
                env[nid] = graph.call_module(key, tuple(env[s] for s in incoming[nid] if s in env))
            env[nid].meta['canvas_id'] = nid
            if nid in errors:
                env[nid].meta['error'] = errors[nid]
        graph.output(tuple(env[nid] for nid in order))
        module = fx.GraphModule(root, graph)
        with torch.no_grad():
            results = CanvasShapeProp(module, self, nodes, base_dir, active).propagate(*dummy)
        return data, dict(zip(order, results)), module

    def integrated(self, node, args, base_dir, active):
        params = copy.deepcopy(node.get('params') or {})
        source = Path(params.get('model_path', ''))
        if not params.get('model_path'):
            raise ValueError('Integrated model path is missing')
        if not source.is_absolute():
            source = Path(base_dir or os.getcwd()) / source
        source = source.resolve(strict=True)
        key = os.path.normcase(str(source))
        if key in active:
            raise ValueError(f'Recursive model reference detected: {source}')
        if len(active) >= 32:
            raise ValueError('Integrated model nesting exceeds 32 levels')
        original = read_canvas(source)
        child = copy.deepcopy(original)
        inputs = [n for n in child['nodes'] if n.get('layerType') == 'Input']
        if len(args) != len(inputs):
            raise ValueError(f'Integrated model expects {len(inputs)} inputs; connected {len(args)}')
        for n in child['nodes']:
            for field in ('model_path', 'weights_path'):
                path = (n.get('params') or {}).get(field)
                if path and not Path(path).is_absolute():
                    n['params'][field] = str((source / path).resolve())
        adapted, values, _ = self.infer(child, str(source), dict(zip((str(n['id']) for n in inputs), args)), (*active, key))
        connected, outgoing = set(), set()
        for edge in child.get('edges', []):
            connected.update((str(edge['from']), str(edge['to'])))
            outgoing.add(str(edge['from']))
        leaves = []
        for n in adapted['nodes']:
            if str(n['id']) in connected:
                if n['tensorInfo']['message']:
                    raise ValueError(f"{n['id']}: {n['tensorInfo']['message']}")
                if n.get('layerType') != 'Input' and str(n['id']) not in outgoing:
                    leaves.append(n)
        if len(leaves) != 1 or not isinstance(values[str(leaves[0]['id'])], torch.Tensor):
            raise ValueError('Integrated models currently require one tensor output')
        changed = False
        for before, after in zip(original['nodes'], adapted['nodes']):
            if before.get('layerType') == 'Input':
                try:
                    shape, dtype = input_spec(before.get('params') or {})
                    value = values[str(after['id'])]
                    changed |= tuple(value.shape) != shape or value.dtype != dtype
                except (ValueError, TypeError):
                    changed = True
            else:
                for field in after['tensorInfo']['auto']:
                    if field != 'inputs' and (before.get('params') or {}).get(field) != after['params'][field]:
                        changed = True
            changed |= bool(after.get('adaptedModel'))
        params['model_path'] = str(source)
        params['inputs'] = [dict(id=n['id'], name=(n.get('params') or {}).get('input_name') or n['id'],
                                 shape=list(value.shape)) for n, value in zip(inputs, args)]
        result = values[str(leaves[0]['id'])]
        params['outputs'] = [dict(id=leaves[0]['id'], name=leaves[0]['id'], shape=list(result.shape))]
        if changed:
            params.update(weights_path='', freeze_weights=False)
            node['adaptedModel'] = adapted
            node['tensorInfo']['auto'] = ['inputs']
        node['params'] = params
        return result


def infer_shapes(canvas, base_dir=''):
    return ShapeEngine().infer(canvas, base_dir)[0]


def validate_for_save(canvas):
    connected = {str(e['from']) for e in canvas.get('edges', [])} | {str(e['to']) for e in canvas.get('edges', [])}
    for node in canvas.get('nodes', []):
        message = (node.get('tensorInfo') or {}).get('message')
        if str(node['id']) in connected and message:
            raise ValueError(f"{node['id']}: {message}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--base-dir', default='')
    args = parser.parse_args()
    if args.worker:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                result = {'graph': infer_shapes(request['graph'], request.get('baseDir', ''))}
            except Exception as error:
                result = {'error': str(error)}
            print(json.dumps(result), flush=True)
    else:
        print(json.dumps(infer_shapes(json.load(sys.stdin), args.base_dir)))


if __name__ == '__main__':
    main()
