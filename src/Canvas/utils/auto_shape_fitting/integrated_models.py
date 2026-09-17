"""Read saved canvases and adapt nested models without modifying their sources."""
import copy
import os
from pathlib import Path
import torch

from read_canvas.saved_canvas import read_canvas
from auto_shape_fitting.tensor_specs import input_spec

def infer_integrated(engine, node, args, base_dir, active):
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
    adapted, values, _ = engine.infer(child, str(source), dict(zip((str(n['id']) for n in inputs), args)), (*active, key))
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
