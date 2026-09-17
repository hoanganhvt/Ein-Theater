"""Recognize canvas inputs and normalize placeholder metadata and names."""
from shared.common import fix_input_name

def is_input_node(node):
    """Determines whether a canvas node represents an Input source block."""
    if not isinstance(node, dict):
        return False
    l_type = str(node.get('layerType', '')).strip().lower()
    if l_type in ('input', 'nn.input', 'placeholder'):
        return True
    params = node.get('params', {}) or {}
    if 'input_type' in params or 'inputType' in params or 'shape_preset' in params:
        return True
    label = str(node.get('label', '')).strip().lower()
    if (label == 'input' or label.startswith('input ')) and l_type in ('', 'input', 'nn.input', 'nn.identity'):
        return True
    return False


def parse_shape_spec(raw_shape, default_shape):
    """Parses shape representation (string, list, tuple, or int) into a list of integers."""
    if not raw_shape:
        return default_shape
    if isinstance(raw_shape, (list, tuple)):
        return [int(x) for x in raw_shape]
    if isinstance(raw_shape, int):
        return [raw_shape]
    if isinstance(raw_shape, str):
        cleaned = raw_shape.strip("()[] ")
        parts = [p.strip() for p in cleaned.split(",") if p.strip()]
        try:
            return [int(p) for p in parts]
        except ValueError:
            return default_shape
    return default_shape


def build_inputs(nodes, node_map):
    # 1. Identify input nodes (placeholders)
    input_nodes = [str(n['id']) for n in nodes if is_input_node(n)]
    fx_nodes = []
    var_names = {}
    used_targets = set()
    primary_input_type = 'raw data'
    primary_input_shape = [64]

    if input_nodes:
        used_input_names = set()
        for idx, nid in enumerate(input_nodes):
            node = node_map[nid]
            params = node.get('params', {}) or {}

            raw_itype = str(params.get('input_type', params.get('inputType', 'image'))).strip().lower()
            if raw_itype in ('image', 'img'):
                input_type = 'image'
                default_shape = [3, 224, 224]
                default_dtype = 'float32'
            elif raw_itype in ('text', 'txt'):
                input_type = 'text'
                default_shape = [128]
                default_dtype = 'int64'
            elif raw_itype in ('audio', 'sound'):
                input_type = 'audio'
                default_shape = [1, 16000]
                default_dtype = 'float32'
            elif raw_itype in ('raw data', 'raw_data', 'raw'):
                input_type = 'raw data'
                default_shape = [64]
                default_dtype = 'float32'
            else:
                input_type = raw_itype or 'raw data'
                default_shape = [64]
                default_dtype = 'float32'

            shape_preset = params.get('shape_preset')
            custom_shape = params.get('custom_shape') or params.get('shape')
            if shape_preset and shape_preset != 'custom':
                raw_shape = shape_preset
            elif custom_shape:
                raw_shape = custom_shape
            else:
                raw_shape = default_shape

            shape = parse_shape_spec(raw_shape, default_shape)
            batch_size = int(params.get('batch_size', 1)) if str(params.get('batch_size', '1')).isdigit() else 1
            dtype = params.get('dtype', default_dtype)

            if idx == 0:
                primary_input_type = input_type
                primary_input_shape = shape

            raw_user_name = (
                params.get('input_name') or
                params.get('name') or
                node.get('name') or
                node.get('label') or
                ''
            )
            base_var = fix_input_name(raw_user_name, fallback_idx=idx)

            var_name = base_var
            cnt = 1
            while var_name in used_input_names:
                var_name = f"{base_var}_{cnt}"
                cnt += 1
            used_input_names.add(var_name)
            used_targets.add(var_name)
            var_names[nid] = var_name

            fx_nodes.append({
                'id': var_name,
                'canvas_id': str(nid),
                'op': 'placeholder',
                'target': var_name,
                'type': 'input',
                'input_type': input_type,
                'params': {
                    'input_type': input_type,
                    'shape': shape,
                    'shape_preset': shape_preset or ', '.join(str(s) for s in shape),
                    'custom_shape': custom_shape or ', '.join(str(s) for s in shape),
                    'batch_size': batch_size,
                    'dtype': dtype,
                    **params
                },
                'inputs': [],
                'args_str': ''
            })
    else:
        var_names['__default_input__'] = 'x'
        used_targets.add('x')
        fx_nodes.append({
            'id': 'x',
            'op': 'placeholder',
            'target': 'x',
            'inputs': [],
            'args_str': '',
            'params': {'input_type': 'raw data', 'shape': [64], 'batch_size': 1, 'dtype': 'float32'},
            'type': 'input'
        })

    primary_input_var = var_names[input_nodes[0]] if input_nodes else 'x'

    return input_nodes, fx_nodes, var_names, used_targets, primary_input_type, primary_input_shape, primary_input_var
