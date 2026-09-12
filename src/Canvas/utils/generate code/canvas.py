import os
import sys
import json

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import fix_model_name, fix_input_name, load_modules_map


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


def canvas_to_json_graph(canvas_data):
    """
    Converts visual canvas graph data ({projectId, name, nodes, edges})
    into structured FX-style computational graph JSON.
    """
    if isinstance(canvas_data, str):
        data = json.loads(canvas_data)
    else:
        data = canvas_data

    modules_map = load_modules_map()

    nodes = data.get('nodes', [])
    edges = data.get('edges', [])
    raw_name = data.get('name', 'Untitled_Model').strip() or 'Untitled_Model'
    model_name = fix_model_name(raw_name)

    if not nodes:
        return json.dumps({
            'metadata': {'device': 'cpu', 'name': model_name, 'projectId': data.get('projectId', '')},
            'nodes': [
                {'id': 'x', 'op': 'placeholder', 'inputs': [], 'args_str': '', 'params': {}, 'type': 'input'},
                {'id': 'output', 'op': 'output', 'inputs': ['x'], 'args_str': 'x', 'params': {}, 'type': 'output'}
            ],
            'canvas': data
        }, indent=2)

    node_map = {str(n['id']): n for n in nodes}
    succ = {str(n['id']): [] for n in nodes}
    pred = {str(n['id']): [] for n in nodes}
    in_degree = {str(n['id']): 0 for n in nodes}

    for e in edges:
        u = str(e.get('from', ''))
        v = str(e.get('to', ''))
        if u in node_map and v in node_map and u != v:
            if v not in succ[u]:
                succ[u].append(v)
            if u not in pred[v]:
                pred[v].append(u)
                in_degree[v] += 1

    # If no edges exist and multiple nodes, chain them in spatial layout order (left-to-right)
    if len(edges) == 0 and len(nodes) > 1:
        spatial_nodes = sorted(nodes, key=lambda n: (n.get('x', 0), n.get('y', 0)))
        topo_order = [str(n['id']) for n in spatial_nodes]
        for i in range(len(topo_order) - 1):
            curr_id = topo_order[i]
            next_id = topo_order[i + 1]
            succ[curr_id].append(next_id)
            pred[next_id].append(curr_id)
    else:
        roots = [nid for nid, deg in in_degree.items() if deg == 0]
        roots.sort(key=lambda nid: (node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
        queue = list(roots)
        topo_order = []
        deg_copy = dict(in_degree)
        while queue:
            queue.sort(key=lambda nid: (node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
            curr = queue.pop(0)
            topo_order.append(curr)
            for nxt in succ[curr]:
                deg_copy[nxt] -= 1
                if deg_copy[nxt] == 0:
                    queue.append(nxt)

        if len(topo_order) < len(nodes):
            remaining = [str(n['id']) for n in nodes if str(n['id']) not in topo_order]
            remaining.sort(key=lambda nid: (node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
            topo_order.extend(remaining)

    input_nodes = [nid for nid in topo_order if is_input_node(node_map[nid])]
    fx_nodes = []
    root_nodes = [nid for nid in topo_order if len(pred[nid]) == 0]
    input_var_names = {}
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
                default_var_base = 'image'
            elif raw_itype in ('text', 'txt'):
                input_type = 'text'
                default_shape = [128]
                default_dtype = 'int64'
                default_var_base = 'text'
            elif raw_itype in ('audio', 'sound'):
                input_type = 'audio'
                default_shape = [1, 16000]
                default_dtype = 'float32'
                default_var_base = 'audio'
            elif raw_itype in ('raw data', 'raw_data', 'raw'):
                input_type = 'raw data'
                default_shape = [64]
                default_dtype = 'float32'
                default_var_base = 'x'
            else:
                input_type = raw_itype or 'raw data'
                default_shape = [64]
                default_dtype = 'float32'
                default_var_base = 'x'

            # 1. Resolving shape: shape_preset dropdown first, then custom_shape
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

            # Determine clean variable name for forward argument:
            # User can specify name (via input_name, name, or label), or default to x0, x1, x2...
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

        # Connect any non-input root nodes to the primary input variable
        non_input_roots = [nid for nid in root_nodes if nid not in input_nodes]
        for r_id in non_input_roots:
            input_var_names[r_id] = var_names[input_nodes[0]]
    else:
        if len(root_nodes) <= 1:
            fx_nodes.append({
                'id': 'x',
                'op': 'placeholder',
                'inputs': [],
                'args_str': '',
                'params': {'input_type': 'raw data', 'shape': [64], 'batch_size': 1, 'dtype': 'float32'},
                'type': 'input'
            })
        else:
            for idx, r_id in enumerate(root_nodes):
                inp_name = f'x{idx + 1}'
                fx_nodes.append({
                    'id': inp_name,
                    'op': 'placeholder',
                    'inputs': [],
                    'args_str': '',
                    'params': {'input_type': 'raw data', 'shape': [64], 'batch_size': 1, 'dtype': 'float32'},
                    'type': 'input'
                })
                input_var_names[r_id] = inp_name

    for nid in topo_order:
        node = node_map[nid]
        if is_input_node(node):
            continue

        layer_type = node.get('layerType', 'nn.Identity')
        params = node.get('params', {}) or {}

        clean_type = layer_type.replace('nn.', '').replace('.', '_').lower()
        if clean_type == 'conv2d':
            clean_type = 'conv'
        elif clean_type == 'batchnorm2d':
            clean_type = 'batchnorm'
        elif clean_type == 'maxpool2d':
            clean_type = 'maxpool'

        clean_id = str(nid).replace('-', '_').replace(' ', '_').lower()
        if clean_id.startswith(clean_type + "_"):
            base_target = clean_id
        else:
            base_target = f"{clean_type}_{clean_id}"
        target = base_target
        counter = 1
        while target in used_targets:
            target = f"{base_target}_{counter}"
            counter += 1
        used_targets.add(target)
        var_names[nid] = target

        preds = pred[nid]
        if not preds:
            if input_nodes:
                inp_name = var_names[input_nodes[0]]
                args_str = inp_name
                inps = [inp_name]
            elif len(root_nodes) <= 1:
                args_str = 'x'
                inps = ['x']
            else:
                inp_name = input_var_names.get(nid, 'x1')
                args_str = inp_name
                inps = [inp_name]
        else:
            inps = [var_names[p] for p in preds if p in var_names]
            label_lower = (node.get('label', '') or '').lower()
            type_lower = layer_type.lower()
            if len(inps) == 1:
                if 'flatten' in type_lower:
                    args_str = f"{inps[0]}, 1"
                else:
                    args_str = inps[0]
            elif 'add' in type_lower or 'add' in label_lower or 'residual' in label_lower:
                args_str = f"{inps[0]}, {inps[1]}" if len(inps) >= 2 else inps[0]
            elif 'attention' in type_lower or 'multihead' in type_lower:
                if len(inps) >= 3:
                    args_str = f"{inps[0]}, {inps[1]}, {inps[2]}"
                else:
                    args_str = f"{inps[0]}, {inps[0]}, {inps[0]}"
            else:
                # Multiple incoming edges into module: concatenate along channel dimension
                args_str = f"torch.cat([{', '.join(inps)}], dim=1)"

        mod_def = modules_map.get(layer_type, {})
        code_template = mod_def.get('code', '')
        defaults = {}
        if 'fields' in mod_def:
            for f in mod_def['fields']:
                if 'default' in f:
                    defaults[f['key']] = f['default']
        merged_params = {**defaults, **params}

        if not code_template:
            if 'customArgs' in params and params['customArgs']:
                code_template = f"{layer_type}({params['customArgs']})"
            else:
                args_parts = [f"{k}={repr(v)}" for k, v in merged_params.items() if k != 'customArgs']
                code_template = f"{layer_type}({', '.join(args_parts)})"

        fx_nodes.append({
            'id': target,
            'op': 'call_module',
            'target': target,
            'type': layer_type,
            'inputs': inps,
            'args_str': args_str,
            'params': merged_params,
            'codeTemplate': code_template
        })

    leaf_nodes = [nid for nid in topo_order if len(succ[nid]) == 0 and not is_input_node(node_map[nid])]
    if not leaf_nodes and topo_order:
        leaf_nodes = [topo_order[-1]]

    out_vars = [var_names[nid] for nid in leaf_nodes if nid in var_names]
    if not out_vars and fx_nodes:
        out_vars = [fx_nodes[-1]['id']]

    fx_nodes.append({
        'id': 'output',
        'op': 'output',
        'inputs': out_vars,
        'args_str': ', '.join(out_vars),
        'params': {},
        'type': 'output'
    })

    return json.dumps({
        'metadata': {
            'device': 'cpu',
            'name': model_name,
            'projectId': data.get('projectId', ''),
            'input_type': primary_input_type,
            'input_shape': primary_input_shape
        },
        'nodes': fx_nodes,
        'canvas': data
    }, indent=2)
