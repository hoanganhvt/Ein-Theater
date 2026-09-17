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

    # If the payload is already a generated model with a 'canvas' object, extract the canvas data
    if 'canvas' in data and isinstance(data['canvas'], dict):
        canvas_payload = data['canvas']
    else:
        canvas_payload = data

    nodes = canvas_payload.get('nodes', [])
    edges = canvas_payload.get('edges', [])
    raw_name = data.get('name', canvas_payload.get('name', 'Untitled_Model')).strip() or 'Untitled_Model'
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

    # 2. Pre-calculate targets and metadata for all non-input nodes
    node_targets = {}
    node_meta = {}
    for nid, node in node_map.items():
        if is_input_node(node):
            continue

        layer_type = node.get('layerType', 'nn.Identity')
        params = node.get('params', {}) or {}

        is_integrated = (layer_type == 'IntegratedModel' or bool(params.get('model_path')))
        sub_name = fix_model_name(params.get('model_name') or 'IntegratedModel') if is_integrated else ''

        clean_type = (sub_name.lower() if is_integrated else layer_type.replace('nn.', '').replace('.', '_').lower())
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

        if is_integrated:
            code_template = f"{sub_name}()"
            actual_type = sub_name
        elif not code_template:
            if 'customArgs' in params and params['customArgs']:
                code_template = f"{layer_type}({params['customArgs']})"
            else:
                args_parts = [f"{k}={repr(v)}" for k, v in merged_params.items() if k != 'customArgs']
                code_template = f"{layer_type}({', '.join(args_parts)})"
            actual_type = layer_type
        else:
            actual_type = layer_type

        node_meta[nid] = {
            'target': target,
            'canvas_id': str(nid),
            'layer_type': actual_type,
            'params': merged_params,
            'codeTemplate': code_template,
            'is_integrated': is_integrated,
            'model_name': sub_name,
            'model_path': params.get('model_path', ''),
            'weights_path': params.get('weights_path', ''),
            'freeze_weights': params.get('freeze_weights', False)
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

    def make_module_node(target, meta, inputs, args_str, in_forward=True):
        return {
            'id': target,
            'canvas_id': meta.get('canvas_id', ''),
            'op': 'call_module',
            'target': target,
            'type': meta.get('layer_type', 'nn.Identity'),
            'inputs': inputs,
            'args_str': args_str,
            'params': meta.get('params', {}),
            'codeTemplate': meta.get('codeTemplate', ''),
            'is_integrated': meta.get('is_integrated', False),
            'model_name': meta.get('model_name', ''),
            'model_path': meta.get('model_path', ''),
            'weights_path': meta.get('weights_path', ''),
            'freeze_weights': meta.get('freeze_weights', False),
            'in_forward': in_forward
        }

    # 4. Generate forward code using topological node traversal and connection semantics
    if len(valid_edges) > 0:
        data['edges'] = sorted_edges

        def set_edge_meta_for(entry, e):
            u = str(e.get('from', ''))
            v = str(e.get('to', ''))
            u_node = node_map.get(u, {})
            v_node = node_map.get(v, {})
            u_label = str(u_node.get('label', u)).replace('\n', ' ')
            v_label = str(v_node.get('label', v)).replace('\n', ' ')
            edge_type = str(e.get('edgeType') or e.get('type') or 'normal').lower()
            entry['edge_from'] = u_label
            entry['edge_to'] = v_label
            entry['edge_type'] = edge_type
            if is_special_edge(e) and e.get('index') is not None:
                entry['edge_index'] = e['index']
            return entry

        # Build topological sort over nodes based on valid edges
        succ = {str(n['id']): [] for n in nodes}
        in_degree = {str(n['id']): 0 for n in nodes}
        for e in valid_edges:
            u = str(e['from'])
            v = str(e['to'])
            succ[u].append(v)
            in_degree[v] += 1

        roots = [nid for nid, deg in in_degree.items() if deg == 0]
        roots.sort(key=lambda nid: (0 if is_input_node(node_map[nid]) else 1, node_map[nid].get('x', 0), node_map[nid].get('y', 0)))

        queue = list(roots)
        topo_order = []
        deg_copy = dict(in_degree)

        while queue:
            queue.sort(key=lambda nid: (0 if is_input_node(node_map[nid]) else 1, node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
            curr = queue.pop(0)
            topo_order.append(curr)
            for nxt in succ[curr]:
                deg_copy[nxt] -= 1
                if deg_copy[nxt] == 0:
                    queue.append(nxt)

        if len(topo_order) < len(node_map):
            remaining = [nid for nid in node_map if nid not in topo_order]
            remaining.sort(key=lambda nid: (0 if is_input_node(node_map[nid]) else 1, node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
            topo_order.extend(remaining)

        connected_nodes = set()
        for e in valid_edges:
            connected_nodes.add(str(e['from']))
            connected_nodes.add(str(e['to']))
        connected_nodes.update(input_nodes)

        for v in topo_order:
            v_node = node_map[v]
            if is_input_node(v_node):
                continue

            if v not in connected_nodes:
                meta_v = node_meta.get(v, {})
                target_v = node_targets.get(v, v)
                fx_nodes.append(make_module_node(target_v, meta_v, [], '', in_forward=False))
                continue

            in_edges = [e for e in sorted_edges if str(e.get('to', '')) == v]
            feed_edges = [e for e in in_edges if str(e.get('edgeType') or e.get('type') or '').lower() != 'residual']
            res_edges = [e for e in in_edges if str(e.get('edgeType') or e.get('type') or '').lower() == 'residual']

            feed_sources = []
            for ed in feed_edges:
                u = str(ed['from'])
                if u in var_names:
                    feed_sources.append(var_names[u])
                elif is_input_node(node_map.get(u, {})):
                    feed_sources.append(primary_input_var)
                else:
                    target_u = node_targets.get(u, u)
                    if u not in var_names:
                        var_names[u] = target_u
                        meta_u = node_meta.get(u)
                        if meta_u:
                            fx_nodes.append(make_module_node(target_u, meta_u, [primary_input_var], primary_input_var))
                    feed_sources.append(var_names[u])

            v_type_lower = str(v_node.get('layerType', '')).lower()
            v_label_lower = str(v_node.get('label', v)).lower()
            target_v = node_targets.get(v, v)
            meta_v = node_meta.get(v, {})

            is_output = (v_type_lower == 'output')
            is_explicit_add = (v_type_lower == 'add')
            is_explicit_concat = (v_type_lower in ('cat', 'concat', 'torch.cat'))

            if is_output:
                var_names[v] = feed_sources[0] if feed_sources else primary_input_var
                continue

            if is_explicit_concat:
                var_names[v] = target_v
                if len(feed_sources) <= 1:
                    src = feed_sources[0] if feed_sources else primary_input_var
                    entry = {
                        'id': target_v,
                        'op': 'assign',
                        'target': target_v,
                        'inputs': [src],
                        'args_str': src
                    }
                    if feed_edges and is_special_edge(feed_edges[0]):
                        entry = set_edge_meta_for(entry, feed_edges[0])
                    fx_nodes.append(entry)
                else:
                    entry = {
                        'id': target_v,
                        'op': 'call_function',
                        'target': 'cat',
                        'inputs': feed_sources,
                        'args_str': f"[{', '.join(feed_sources)}], dim=1",
                        'params': {'dim': 1}
                    }
                    special_skips = [e for e in feed_edges if is_special_edge(e)]
                    if special_skips:
                        entry = set_edge_meta_for(entry, special_skips[0])
                        all_comments = []
                        for sp in special_skips:
                            etype = (str(sp.get('edgeType') or sp.get('type') or 'Skip')).capitalize()
                            eidx = sp.get('index', 0)
                            efrom = str(node_map.get(sp['from'], {}).get('label', sp['from'])).replace('\n', ' ')
                            eto = str(node_map.get(sp['to'], {}).get('label', sp['to'])).replace('\n', ' ')
                            all_comments.append(f"{etype} Edge #{eidx}: {efrom} -> {eto}")
                        entry['edge_comments'] = all_comments
                    fx_nodes.append(entry)

            elif is_explicit_add:
                var_names[v] = target_v
                all_sources = feed_sources + [var_names.get(e['from'], primary_input_var) for e in res_edges if e['from'] in var_names]
                all_in_edges = feed_edges + res_edges
                if not all_sources:
                    all_sources = [primary_input_var]

                if len(all_sources) <= 1:
                    entry = {
                        'id': target_v,
                        'op': 'assign',
                        'target': target_v,
                        'inputs': [all_sources[0]],
                        'args_str': all_sources[0]
                    }
                    if all_in_edges and is_special_edge(all_in_edges[0]):
                        entry = set_edge_meta_for(entry, all_in_edges[0])
                    fx_nodes.append(entry)
                else:
                    entry0 = {
                        'id': target_v,
                        'op': 'assign',
                        'target': target_v,
                        'inputs': [all_sources[0]],
                        'args_str': all_sources[0]
                    }
                    if all_in_edges and is_special_edge(all_in_edges[0]):
                        entry0 = set_edge_meta_for(entry0, all_in_edges[0])
                    fx_nodes.append(entry0)
                    for ed, src in zip(all_in_edges[1:], all_sources[1:]):
                        acc = {
                            'id': target_v,
                            'op': 'accumulate',
                            'target': 'add',
                            'inputs': [target_v, src],
                            'args_str': src
                        }
                        acc = set_edge_meta_for(acc, ed)
                        fx_nodes.append(acc)

            else:
                # Standard PyTorch nn.Module layer (e.g. nn.Conv2d, nn.Linear, IntegratedModel)
                var_names[v] = target_v
                if len(feed_sources) <= 1:
                    src = feed_sources[0] if feed_sources else primary_input_var
                    entry = make_module_node(target_v, meta_v, [src], src)
                    if feed_edges and is_special_edge(feed_edges[0]):
                        entry = set_edge_meta_for(entry, feed_edges[0])
                    fx_nodes.append(entry)
                else:
                    cat_str = f"torch.cat([{', '.join(feed_sources)}], dim=1)"
                    entry = make_module_node(target_v, meta_v, feed_sources, cat_str)
                    special_skips = [e for e in feed_edges if is_special_edge(e)]
                    if special_skips:
                        entry = set_edge_meta_for(entry, special_skips[0])
                        all_comments = []
                        for sp in special_skips:
                            etype = (str(sp.get('edgeType') or sp.get('type') or 'Skip')).capitalize()
                            eidx = sp.get('index', 0)
                            efrom = str(node_map.get(sp['from'], {}).get('label', sp['from'])).replace('\n', ' ')
                            eto = str(node_map.get(sp['to'], {}).get('label', sp['to'])).replace('\n', ' ')
                            all_comments.append(f"{etype} Edge #{eidx}: {efrom} -> {eto}")
                        entry['edge_comments'] = all_comments
                    fx_nodes.append(entry)

                # Residual shortcuts (if any)
                for ed in res_edges:
                    res_src = var_names.get(ed['from'], primary_input_var)
                    acc = {
                        'id': target_v,
                        'op': 'accumulate',
                        'target': 'add',
                        'inputs': [target_v, res_src],
                        'args_str': res_src
                    }
                    acc = set_edge_meta_for(acc, ed)
                    fx_nodes.append(acc)

        # Leaf outputs: nodes with inputs but no outgoing edges
        leaf_nodes = [
            nid for nid in node_map
            if nid in var_names
            and not is_input_node(node_map[nid])
            and len([ed for ed in valid_edges if str(ed.get('from', '')) == nid]) == 0
        ]
        if not leaf_nodes and topo_order:
            non_input_topo = [nid for nid in topo_order if not is_input_node(node_map[nid]) and nid in var_names]
            if non_input_topo:
                leaf_nodes = [non_input_topo[-1]]

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
            fx_nodes.append(make_module_node(meta['target'], meta, [], '', in_forward=False))

    print(f"DEBUG topo_order: {topo_order}")
    print(f"DEBUG valid_edges: {[(e['from'], e['to']) for e in valid_edges]}")
    print(f"DEBUG fx_nodes: {[n['id'] for n in fx_nodes]}")

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
