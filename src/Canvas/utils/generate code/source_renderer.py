"""Assemble standalone nn.Module source from a canvas or computational graph."""
import json

from shared.common import fix_model_name
from read_canvas.canvas import canvas_to_json_graph
if __package__:
    from .fx_builder import build_fx_graph
    from .source_helpers import render_imports, render_example_inputs
else:
    from fx_builder import build_fx_graph
    from source_helpers import render_imports, render_example_inputs

def generate_code_from_json(json_data, model_name=None, base_dir=None, **kwargs):
    """
    Synthesizes standalone executable PyTorch nn.Module Python code
    from computational graph JSON using torch.fx.Graph.
    """
    if isinstance(json_data, str):
        data = json.loads(json_data)
    else:
        data = json_data

    if isinstance(data, dict) and ('edges' in data or (len(data.get('nodes', [])) > 0 and 'op' not in data['nodes'][0])):
        if not model_name and 'name' in data:
            model_name = data['name']
        data = json.loads(canvas_to_json_graph(data))

    if isinstance(data, dict) and 'nodes' in data:
        nodes = data['nodes']
        device = data.get('metadata', {}).get('device', 'cpu')
        if not model_name:
            model_name = data.get('metadata', {}).get('name')
    else:
        nodes = data
        device = 'cpu'

    if not model_name:
        class_name = 'Model'
    else:
        class_name = fix_model_name(str(model_name))

    imports = render_imports(nodes, base_dir)
    graph, init_lines = build_fx_graph(nodes)

    python_code = graph.python_code(root_module="self")

    forward_lines = []
    for line in python_code.src.splitlines():
        clean_line = line.strip()
        if clean_line:
            forward_lines.append("    " + line)

    if not forward_lines:
        forward_lines.append("        pass")

    indented_forward = "\n".join(forward_lines)
    init_src = "\n".join(init_lines)

    test_inputs_str, test_calls_str = render_example_inputs(nodes)

    full_source = f'''{imports}
class {class_name}(nn.Module):
    def __init__(self, device='{device}'):
        super().__init__()
        self.device = device
{init_src}

{indented_forward}

if __name__ == '__main__':
    print("Testing {class_name}...")
    model = {class_name}()

{test_inputs_str}

    try:
        output = model({test_calls_str})
        print("Forward pass successful!")
        if isinstance(output, torch.Tensor):
            print("Output shape:", output.shape)
        elif isinstance(output, tuple):
            print("Output shapes:", [o.shape for o in output])
    except Exception as e:
        print("Forward pass failed:", e)
'''
    return full_source


def generate_code_from_canvas(canvas_data, base_dir=None, **kwargs):
    """Generate source directly from an editable canvas without fitting shapes."""
    graph = canvas_to_json_graph(canvas_data)
    return generate_code_from_json(graph, base_dir=base_dir, **kwargs)
