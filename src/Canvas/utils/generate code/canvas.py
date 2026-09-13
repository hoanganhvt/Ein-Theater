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
                {'id': 'x', 'op': 'placeholder', 'inputs': [], 'args_str': '', 'params': {}, 'type': 'input'}
            ],
            'canvas': data
        }, indent=2)

    node_map = {str(n['id']): n for n in nodes}

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

    # 2. Pre-calculate targets and metadata for all non-input nodes
    node_targets = {}
    node_meta = {}
    for nid, node in node_map.items():
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
        node_targets[nid] = target

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

        node_meta[nid] = {
            'target': target,
            'layer_type': layer_type,
            'params': merged_params,
            'codeTemplate': code_template
        }

    # 3. Filter valid edges and partition: all special edges are placed behind all normal edges
    def is_special_edge(e):
        etype = str(e.get('edgeType') or e.get('type') or '').lower()
        return etype in ('residual', 'skip') or ('index' in e and e.get('index') is not None)

    valid_edges = [
        e for e in edges
        if str(e.get('from', '')) in node_map and str(e.get('to', '')) in node_map and str(e.get('from', '')) != str(e.get('to', ''))
    ]

    normal_edges = [e for e in valid_edges if not is_special_edge(e)]
    special_edges = [e for e in valid_edges if is_special_edge(e)]

    def normal_sort_key(e, fallback_pos):
        eid = str(e.get('id', ''))
        if eid.startswith('e') and eid[1:].isdigit():
            return (float(eid[1:]), fallback_pos)
        return (float(fallback_pos), fallback_pos)

    def special_sort_key(e, fallback_pos):
        raw_idx = e.get('index')
        if raw_idx is not None:
            try:
                return (float(raw_idx), fallback_pos)
            except (ValueError, TypeError):
                pass
        return (float(fallback_pos), fallback_pos)

    normal_sorted = sorted(normal_edges, key=lambda e: normal_sort_key(e, normal_edges.index(e)))
    special_sorted = sorted(special_edges, key=lambda e: special_sort_key(e, special_edges.index(e)))

    # Enforce special connections indexing strictly 0, 1, 2, 3...
    for idx, e in enumerate(special_sorted):
        e['index'] = idx

    # All special edges are placed behind all normal edges, strictly following index 0, 1, 2, 3...
    sorted_edges = normal_sorted + special_sorted

    # 4. Generate forward code according to the edge list
    if len(sorted_edges) > 0:
        seen_in_edges = {}
        in_edges_map = {}
        for e in sorted_edges:
            v = str(e['to'])
            in_edges_map.setdefault(v, []).append(e)

        for e in sorted_edges:
            u = str(e['from'])
            v = str(e['to'])
            edge_type = str(e.get('edgeType') or e.get('type') or 'normal').lower()
            edge_is_special = is_special_edge(e)
            edge_idx = e.get('index') if edge_is_special else None

            u_node = node_map[u]
            v_node = node_map[v]
            u_label = str(u_node.get('label', u)).replace('\n', ' ')
            v_label = str(v_node.get('label', v)).replace('\n', ' ')

            def set_edge_meta(entry):
                entry['edge_from'] = u_label
                entry['edge_to'] = v_label
                entry['edge_type'] = edge_type
                if edge_idx is not None:
                    entry['edge_index'] = edge_idx
                return entry

            # Determine source variable
            if u in var_names:
                src_var = var_names[u]
            elif is_input_node(u_node):
                src_var = var_names.get(u, primary_input_var)
            else:
                # Source module hasn't been called yet; invoke it with primary input
                target_u = node_targets.get(u, u)
                var_names[u] = target_u
                meta_u = node_meta.get(u)
                if meta_u:
                    fx_nodes.append({
                        'id': target_u,
                        'op': 'call_module',
                        'target': target_u,
                        'type': meta_u['layer_type'],
                        'inputs': [primary_input_var],
                        'args_str': primary_input_var,
                        'params': meta_u['params'],
                        'codeTemplate': meta_u['codeTemplate']
                    })
                src_var = target_u

            # Determine destination behavior
            seen_in_edges.setdefault(v, []).append(src_var)
            in_count = len(seen_in_edges[v])
            total_in = len(in_edges_map[v])

            v_type_lower = str(v_node.get('layerType', '')).lower()
            v_label_lower = v_label.lower()
            target_v = node_targets.get(v, v)
            meta_v = node_meta.get(v, {})

            is_output = ('output' in v_type_lower or 'output' in v_label_lower or 'return' in v_label_lower)

            if is_output:
                var_names[v] = src_var
                continue

            is_explicit_add = ('add' in v_type_lower or 'add' in v_label_lower)
            is_explicit_concat = ('cat' in v_type_lower or 'concat' in v_label_lower)

            if is_explicit_add:
                if in_count == 1:
                    var_names[v] = target_v
                    fx_nodes.append(set_edge_meta({
                        'id': target_v,
                        'op': 'assign',
                        'target': target_v,
                        'inputs': [src_var],
                        'args_str': src_var
                    }))
                else:
                    fx_nodes.append(set_edge_meta({
                        'id': target_v,
                        'op': 'accumulate',
                        'target': 'add',
                        'inputs': [target_v, src_var],
                        'args_str': src_var
                    }))
            elif is_explicit_concat:
                if in_count == 1:
                    var_names[v] = target_v
                    fx_nodes.append(set_edge_meta({
                        'id': target_v,
                        'op': 'assign',
                        'target': target_v,
                        'inputs': [src_var],
                        'args_str': src_var
                    }))
                else:
                    fx_nodes.append(set_edge_meta({
                        'id': target_v,
                        'op': 'call_function',
                        'target': 'cat',
                        'inputs': [target_v, src_var],
                        'args_str': f"[{target_v}, {src_var}], dim=1"
                    }))
            else:
                # Standard PyTorch nn.Module layer (e.g. nn.Conv2d, nn.Linear)
                normal_in_edges = [ed for ed in in_edges_map[v] if not is_special_edge(ed)]
                num_normal_in = len(normal_in_edges)

                if edge_is_special:
                    # Special edge (residual shortcut or skip concat)
                    # If target_v was not yet computed (e.g. only special edges exist), compute it first
                    if v not in var_names:
                        var_names[v] = target_v
                        fx_nodes.append({
                            'id': target_v,
                            'op': 'call_module',
                            'target': target_v,
                            'type': meta_v.get('layer_type', 'nn.Identity'),
                            'inputs': [src_var],
                            'args_str': src_var,
                            'params': meta_v.get('params', {}),
                            'codeTemplate': meta_v.get('codeTemplate', '')
                        })
                    else:
                        cur_var = var_names[v]
                        if edge_type == 'residual':
                            fx_nodes.append(set_edge_meta({
                                'id': cur_var,
                                'op': 'accumulate',
                                'target': 'add',
                                'inputs': [cur_var, src_var],
                                'args_str': src_var
                            }))
                        elif edge_type == 'skip':
                            fx_nodes.append(set_edge_meta({
                                'id': cur_var,
                                'op': 'call_function',
                                'target': 'cat',
                                'inputs': [cur_var, src_var],
                                'args_str': f"[{cur_var}, {src_var}], dim=1"
                            }))
                        else:
                            fx_nodes.append(set_edge_meta({
                                'id': cur_var,
                                'op': 'accumulate',
                                'target': 'add',
                                'inputs': [cur_var, src_var],
                                'args_str': src_var
                            }))
                else:
                    # Normal incoming edge feeding module's primary input
                    normal_in_count = len([s for s in seen_in_edges[v] if True])
                    if num_normal_in <= 1:
                        var_names[v] = target_v
                        fx_nodes.append(set_edge_meta({
                            'id': target_v,
                            'op': 'call_module',
                            'target': target_v,
                            'type': meta_v.get('layer_type', 'nn.Identity'),
                            'inputs': [src_var],
                            'args_str': src_var,
                            'params': meta_v.get('params', {}),
                            'codeTemplate': meta_v.get('codeTemplate', '')
                        }))
                    else:
                        if in_count < num_normal_in:
                            buf_var = f"{target_v}_in{in_count}"
                            fx_nodes.append(set_edge_meta({
                                'id': buf_var,
                                'op': 'assign',
                                'target': buf_var,
                                'inputs': [src_var],
                                'args_str': src_var
                            }))
                        else:
                            var_names[v] = target_v
                            all_inputs = [f"{target_v}_in{k}" for k in range(1, num_normal_in)] + [src_var]
                            cat_str = f"torch.cat([{', '.join(all_inputs)}], dim=1)"
                            fx_nodes.append(set_edge_meta({
                                'id': target_v,
                                'op': 'call_module',
                                'target': target_v,
                                'type': meta_v.get('layer_type', 'nn.Identity'),
                                'inputs': all_inputs,
                                'args_str': cat_str,
                                'params': meta_v.get('params', {}),
                                'codeTemplate': meta_v.get('codeTemplate', '')
                            }))

        # Leaf outputs: nodes with inputs but no outgoing edges
        leaf_nodes = [
            nid for nid in node_map
            if nid in var_names
            and not is_input_node(node_map[nid])
            and len([ed for ed in sorted_edges if str(ed.get('from', '')) == nid]) == 0
        ]
        if not leaf_nodes and sorted_edges:
            last_to = str(sorted_edges[-1]['to'])
            if last_to in var_names:
                leaf_nodes = [last_to]

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
    else:
        # If there are no edges, do not force any calls into the forward function
        for nid, meta in node_meta.items():
            fx_nodes.append({
                'id': meta['target'],
                'op': 'call_module',
                'target': meta['target'],
                'type': meta['layer_type'],
                'inputs': [],
                'args_str': '',
                'params': meta['params'],
                'codeTemplate': meta['codeTemplate'],
                'in_forward': False
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
