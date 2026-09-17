"""Input validation and serializable tensor metadata."""
import torch

from shared.module_registry import literal

UNRESOLVED = object()


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
