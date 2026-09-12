import os
import sys
import json

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import fix_model_name
from canvas import canvas_to_json_graph


def generate_code_from_canvas(canvas_data):
    """Generates PyTorch model code directly from canvas graph data."""
    json_graph_str = canvas_to_json_graph(canvas_data)
    return generate_code_from_json(json_graph_str)


def save_model_to_folder(canvas_data, output_dir=None):
    """
    Saves the model in output_dir inside a folder named after the model:
      <output_dir>/<model_name>/
        - <model_name>.json
        - <model_name>.py
    """
    if isinstance(canvas_data, str):
        data = json.loads(canvas_data)
    else:
        data = canvas_data

    raw_name = data.get('name', 'Untitled_Model').strip() or 'Untitled_Model'
    safe_name = fix_model_name(raw_name)

    if output_dir is None:
        output_dir = os.getcwd()

    target_folder = os.path.join(output_dir, safe_name)
    os.makedirs(target_folder, exist_ok=True)

    json_graph_str = canvas_to_json_graph(data)
    py_code = generate_code_from_json(json_graph_str, model_name=safe_name)

    parsed_graph = json.loads(json_graph_str) if isinstance(json_graph_str, str) else json_graph_str
    placeholders = [n for n in parsed_graph.get('nodes', []) if n.get('op') == 'placeholder']

    dummy_lines = []
    call_args = []

    if placeholders:
        for p in placeholders:
            p_id = p['id']
            itype = (p.get('input_type') or p.get('params', {}).get('input_type') or 'raw data').lower().strip()
            shape = p.get('params', {}).get('shape')
            bs = p.get('params', {}).get('batch_size', 1)
            try:
                bs = int(bs)
            except (ValueError, TypeError):
                bs = 1

            if itype in ('image', 'img'):
                dims = shape if shape else [3, 224, 224]
                dim_str = ", ".join(str(d) for d in dims)
                dummy_lines.append(f"    # Sample dummy image input (shape: [{bs}, {dim_str}])")
                dummy_lines.append(f"    dummy_{p_id} = torch.randn({bs}, {dim_str}, device=device)")
            elif itype in ('text', 'txt'):
                dims = shape if shape else [128]
                dim_str = ", ".join(str(d) for d in dims)
                dummy_lines.append(f"    # Sample dummy text token IDs (shape: [{bs}, {dim_str}])")
                dummy_lines.append(f"    dummy_{p_id} = torch.randint(0, 1000, ({bs}, {dim_str}), dtype=torch.long, device=device)")
            elif itype in ('audio', 'sound'):
                dims = shape if shape else [1, 16000]
                dim_str = ", ".join(str(d) for d in dims)
                dummy_lines.append(f"    # Sample dummy audio waveform (shape: [{bs}, {dim_str}])")
                dummy_lines.append(f"    dummy_{p_id} = torch.randn({bs}, {dim_str}, device=device)")
            else:
                dims = shape if shape else [64]
                dim_str = ", ".join(str(d) for d in dims)
                dummy_lines.append(f"    # Sample dummy tensor (shape: [{bs}, {dim_str}])")
                dummy_lines.append(f"    dummy_{p_id} = torch.randn({bs}, {dim_str}, device=device)")

            call_args.append(f"dummy_{p_id}")
    else:
        dummy_lines.append("    dummy_x = torch.randn(1, 64, device=device)")
        call_args.append("dummy_x")

    dummy_code = "\n".join(dummy_lines)
    call_args_str = ", ".join(call_args)

    runner_code = f"""
if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = {safe_name}(device=device)
    print(f"Model '{safe_name}' initialized successfully on {{device}}:")
    print(model)

{dummy_code}
    try:
        output = model({call_args_str})
        print("\\n[✓] Forward pass test successful!")
        if isinstance(output, torch.Tensor):
            print(f"Output tensor shape: {{tuple(output.shape)}}")
        elif isinstance(output, (list, tuple)):
            print(f"Output shapes: {{[tuple(o.shape) if hasattr(o, 'shape') else type(o) for o in output]}}")
    except Exception as e:
        print(f"\\n[!] Note: Forward pass test with dummy inputs encountered: {{e}}")
"""
    if "__main__" not in py_code:
        py_code = py_code + "\n" + runner_code

    json_file_path = os.path.join(target_folder, f"{safe_name}.json")
    py_file_path = os.path.join(target_folder, f"{safe_name}.py")

    with open(json_file_path, 'w', encoding='utf-8') as f:
        f.write(json_graph_str)

    with open(py_file_path, 'w', encoding='utf-8') as f:
        f.write(py_code)

    return {
        'status': 'ok',
        'folder': target_folder,
        'folderName': safe_name,
        'jsonFile': json_file_path,
        'pyFile': py_file_path,
        'modelName': safe_name
    }


def generate_code_from_json(json_data, model_name=None):
    """
    Synthesizes standalone executable PyTorch nn.Module Python code
    from computational graph JSON.
    """
    if isinstance(json_data, str):
        data = json.loads(json_data)
    else:
        data = json_data

    # If canvas graph data is passed, convert to FX graph JSON first
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

    imports = "import torch\nimport torch.nn as nn\nimport operator\n\n"
    header = f"class {class_name}(nn.Module):\n    def __init__(self, device='{device}'):\n        super().__init__()\n        self.device = device\n"

    init_code = ""
    forward_code = "    def forward(self, "

    inputs = []
    input_comments = []

    for node in nodes:
        if node['op'] == 'placeholder':
            in_id = node['id']
            inputs.append(in_id)
            itype = node.get('input_type') or node.get('params', {}).get('input_type', '')
            shape = node.get('params', {}).get('shape', '')
            bs = node.get('params', {}).get('batch_size', 1)
            dtype = node.get('params', {}).get('dtype', '')
            if itype:
                shape_desc = f", shape: [{bs}, {', '.join(str(s) for s in shape)}]" if shape else ""
                dtype_desc = f", dtype: torch.{dtype}" if dtype else ""
                input_comments.append(f"        # {in_id}: {itype.capitalize()}{shape_desc}{dtype_desc}")

    if not inputs:
        inputs = ['x']

    forward_code += ", ".join(inputs) + "):\n"
    if input_comments:
        forward_code += "\n".join(input_comments) + "\n"

    for node in nodes:
        if node['op'] == 'placeholder':
            continue
        elif node['op'] == 'call_module':
            try:
                instantiation = node['codeTemplate'].format(**node['params'])
            except KeyError:
                params_str = ", ".join([f"{k}={repr(v)}" for k, v in node['params'].items()])
                instantiation = f"{node['type']}({params_str})"

            safe_target = node['target'].replace('.', '_')
            init_code += f"        self.{safe_target} = {instantiation}\n"

            forward_code += f"        {node['id']} = self.{safe_target}({node.get('args_str', '')})\n"

        elif node['op'] == 'call_function':
            target = node['target']
            args_str = node.get('args_str', '')
            if target in ('add', 'mul', 'sub', 'getitem', 'floordiv', 'truediv', 'pow'):
                func = f"operator.{target}"
            elif target in ('cat', 'stack', 'relu', 'sigmoid', 'tanh', 'softmax', 'flatten', 'matmul', 'arange'):
                func = f"torch.{target}"
                if target == 'arange':
                    if args_str:
                        args_str += ", device=self.device"
                    else:
                        args_str = "device=self.device"
            else:
                func = target

            forward_code += f"        {node['id']} = {func}({args_str})\n"

        elif node['op'] == 'call_method':
            obj = node['inputs'][0]
            args_str = node.get('args_str', '')
            if args_str.startswith(obj):
                rest = args_str[len(obj):].lstrip(', ')
            else:
                rest = ""
            forward_code += f"        {node['id']} = {obj}.{node['target']}({rest})\n"

        elif node['op'] == 'output':
            outputs_str = ", ".join(node['inputs'])
            if outputs_str:
                forward_code += f"        return {outputs_str}\n"
            else:
                forward_code += "        return\n"

    if not init_code:
        init_code = ""
    init_code += "        self.to(self.device)\n"

    code = imports + header + init_code + "\n" + forward_code
    
    code += f"\n\n# steve once here\n\n"
    return code
