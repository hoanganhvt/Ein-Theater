"""Build and execute a canvas DAG on PyTorch meta tensors."""
import copy
from collections import deque
import torch
from torch import fx, nn

from shared.graph_order import ordered_edges
from auto_shape_fitting.tensor_specs import UNRESOLVED, input_spec
from auto_shape_fitting.shape_interpreter import CanvasShapeProp
from auto_shape_fitting.integrated_models import infer_integrated

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
        return infer_integrated(self, node, args, base_dir, active)


def infer_shapes(canvas, base_dir=''):
    return ShapeEngine().infer(canvas, base_dir)[0]


def validate_for_save(canvas):
    connected = {str(e['from']) for e in canvas.get('edges', [])} | {str(e['to']) for e in canvas.get('edges', [])}
    for node in canvas.get('nodes', []):
        message = (node.get('tensorInfo') or {}).get('message')
        if str(node['id']) in connected and message:
            raise ValueError(f"{node['id']}: {message}")
