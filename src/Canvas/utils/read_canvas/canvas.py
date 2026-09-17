"""Public conversion from canvas JSON to the code generator graph format."""
import json

from shared.common import fix_model_name, load_modules_map
from read_canvas.canvas_inputs import build_inputs
from read_canvas.canvas_layers import build_layers
from read_canvas.canvas_graph import build_forward
from shared.graph_order import ordered_edges

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

    (input_nodes, fx_nodes, var_names, used_targets, primary_input_type,
     primary_input_shape, primary_input_var) = build_inputs(nodes, node_map)
    node_targets, node_meta = build_layers(node_map, modules_map, used_targets)

    # 3. Filter valid edges preserving natural ID ordering
    valid_edges = [
        e for e in edges
        if str(e.get('from', '')) in node_map and str(e.get('to', '')) in node_map and str(e.get('from', '')) != str(e.get('to', ''))
    ]

    sorted_edges = ordered_edges(valid_edges)
    if valid_edges:
        data["edges"] = sorted_edges
    build_forward(nodes, node_map, valid_edges, sorted_edges, input_nodes,
                  fx_nodes, var_names, node_targets, node_meta, primary_input_var)
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
