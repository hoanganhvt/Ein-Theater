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

    runner_code = f"""
if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = {safe_name}(device=device)
    print(f"Model '{safe_name}' initialized successfully on {{device}}:")
    print(model)
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

    for node in nodes:
        if node['op'] == 'placeholder':
            inputs.append(node['id'])

    forward_code += ", ".join(inputs) + "):\n"

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
