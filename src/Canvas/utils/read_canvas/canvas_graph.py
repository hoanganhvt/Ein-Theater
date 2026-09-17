"""Translate canvas connections into forward operations and leaf outputs."""
from read_canvas.canvas_inputs import is_input_node
from read_canvas.canvas_layers import make_module_node

def topological_order(nodes, node_map, valid_edges):
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

    return topo_order


def build_forward(nodes, node_map, valid_edges, sorted_edges, input_nodes,
                  fx_nodes, var_names, node_targets, node_meta, primary_input_var):
    if valid_edges:
        topo_order = topological_order(nodes, node_map, valid_edges)

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

            feed_sources = []
            for ed in in_edges:
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

            v_type_lower = str(v_node.get('layerType') or v_node.get('type') or '').lower()
            target_v = node_targets.get(v, v)
            meta_v = node_meta.get(v, {})

            is_output = (v_type_lower == 'output')
            is_explicit_add = (v_type_lower in ('add', 'torch.add'))
            is_explicit_concat = (v_type_lower in ('cat', 'concat', 'torch.cat'))
            is_tensor_select = (v_type_lower == 'operator.getitem')

            if is_output:
                var_names[v] = feed_sources[0] if feed_sources else primary_input_var
                continue

            if is_tensor_select:
                var_names[v] = target_v
                fx_nodes.append({'id': target_v, 'op': 'call_function', 'target': 'getitem',
                                 'inputs': feed_sources, 'params': meta_v.get('params', {})})
            elif is_explicit_concat:
                var_names[v] = target_v
                sources = feed_sources if feed_sources else [primary_input_var]
                dim = meta_v.get('params', {}).get('dim', 1)
                try:
                    dim = int(dim)
                except (ValueError, TypeError):
                    dim = 1
                entry = {
                    'id': target_v,
                    'op': 'call_function',
                    'target': 'cat',
                    'inputs': sources,
                    'args_str': f"[{', '.join(sources)}], dim={dim}",
                    'params': {'dim': dim}
                }
                fx_nodes.append(entry)

            elif is_explicit_add:
                var_names[v] = target_v
                sources = feed_sources if feed_sources else [primary_input_var]
                entry = {
                    'id': target_v,
                    'op': 'call_function',
                    'target': 'add',
                    'inputs': sources,
                    'args_str': ' + '.join(sources),
                    'params': {}
                }
                fx_nodes.append(entry)

            else:
                # Standard PyTorch nn.Module layer (e.g. nn.Conv2d, nn.Linear, IntegratedModel)
                var_names[v] = target_v
                src = feed_sources[0] if feed_sources else primary_input_var
                sources = feed_sources or [src]
                entry = make_module_node(target_v, meta_v, sources, ', '.join(sources))
                fx_nodes.append(entry)

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
