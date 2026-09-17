import os
import sys
import json
import torch
import torch.fx as fx
import ast

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import fix_model_name, fix_input_name, load_modules_map
from canvas import canvas_to_json_graph




def to_relative_path(path, base_dir=None):
    """
    Converts path to a relative path normalized with forward slashes.
    Ensures generated code only contains relative paths.
    """
    if not path or not str(path).strip():
        return ""
    p = str(path).strip().replace('\\', '/')
    base = (base_dir or os.getcwd()).replace('\\', '/')

    is_abs = os.path.isabs(p) or (len(p) > 1 and p[1] == ':')
    if not is_abs:
        if not p.startswith('.') and not p.startswith('/'):
            p = './' + p
        return p

    try:
        rel = os.path.relpath(p, base).replace('\\', '/')
        if not rel.startswith('.') and not rel.startswith('/'):
            rel = './' + rel
        return rel
    except Exception:
        return p


def generate_code_from_canvas(canvas_data, base_dir=None, **kwargs):
    """Generates PyTorch model code directly from canvas graph data."""
    json_graph_str = canvas_to_json_graph(canvas_data)
    return generate_code_from_json(json_graph_str, base_dir=base_dir, **kwargs)


def save_model_to_folder(canvas_data, output_dir=None, **kwargs):
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

    # 1. Generate computational graph directly from canvas
    raw_graph_str = canvas_to_json_graph(data)
    model_data = json.loads(raw_graph_str)

    # 2. Convert all model_path and weights_path inside model_data to relative paths
    for n in model_data.get('nodes', []):
        if n.get('model_path'):
            n['model_path'] = to_relative_path(n['model_path'], base_dir=target_folder)
        n_params = n.get('params')
        if isinstance(n_params, dict):
            if n_params.get('model_path'):
                n_params['model_path'] = to_relative_path(n_params['model_path'], base_dir=target_folder)
            if n_params.get('weights_path'):
                n_params['weights_path'] = to_relative_path(n_params['weights_path'], base_dir=target_folder)
        if n.get('weights_path'):
            n['weights_path'] = to_relative_path(n['weights_path'], base_dir=target_folder)

    for cn in model_data.get('canvas', {}).get('nodes', []):
        c_params = cn.get('params')
        if isinstance(c_params, dict):
            if c_params.get('model_path'):
                c_params['model_path'] = to_relative_path(c_params['model_path'], base_dir=target_folder)
                inst_id = str(cn.get('id', '')).split('_')[-1] if '_' in str(cn.get('id', '')) else ''
                mname = c_params.get('model_name') or 'Submodel'
                cn['title'] = f"Integrated Model: {mname}{' (#' + inst_id + ')' if inst_id else ''}\nPath: {c_params['model_path']}"
            if c_params.get('weights_path'):
                c_params['weights_path'] = to_relative_path(c_params['weights_path'], base_dir=target_folder)

    final_graph_str = json.dumps(model_data, indent=2)

    # 3. Generate final PyTorch code
    py_code = generate_code_from_json(final_graph_str, model_name=safe_name, base_dir=target_folder)

    json_file_path = os.path.join(target_folder, f"{safe_name}.json")
    py_file_path = os.path.join(target_folder, f"{safe_name}.py")

    with open(json_file_path, 'w', encoding='utf-8') as f:
        f.write(final_graph_str)

    clean_ast = ast.parse(py_code)
    pycode = ast.unparse(clean_ast)

    with open(py_file_path, 'w', encoding='utf-8') as f:
        f.write(py_code)
        print("steve done writing cool codes for you!")

    return {
        'status': 'ok',
        'folder': target_folder,
        'folderName': safe_name,
        'jsonFile': json_file_path,
        'pyFile': py_file_path,
        'modelName': safe_name
    }


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

    integrated_imports = []
    seen_integrated = set()
    for node in nodes:
        if node.get('is_integrated') or (isinstance(node.get('params'), dict) and node.get('params', {}).get('model_path')):
            sub_name = node.get('model_name') or node.get('type')
            sub_path = node.get('model_path') or node.get('params', {}).get('model_path', '')
            if sub_name and sub_name not in seen_integrated:
                seen_integrated.add(sub_name)
                rel_path = to_relative_path(sub_path, base_dir=base_dir)
                norm_path = rel_path.replace('\\', '/')
                if norm_path in ('', '.', './'):
                    integrated_imports.append(f"from {sub_name} import {sub_name}")
                else:
                    integrated_imports.append(
                        f"_sub_dir = os.path.normpath(os.path.join(_curr_dir, r'{norm_path}'))\n"
                        f"if _sub_dir not in sys.path:\n"
                        f"    sys.path.insert(0, _sub_dir)\n"
                        f"from {sub_name} import {sub_name}"
                    )

    imports = "import torch\nimport torch.nn as nn\n"
    if integrated_imports:
        imports += "import sys\nimport os\n\n_curr_dir = os.path.dirname(os.path.abspath(__file__))\n\n"
        imports += "\n".join(integrated_imports) + "\n\n"
    else:
        imports += "\n"

    graph = fx.Graph()
    env = {}
    init_lines = []

    for node in nodes:
        op = node['op']
        nid = node['id']
        target = node.get('target', nid)

        if op == 'placeholder':
            env[nid] = graph.placeholder(target)
            
        elif op == 'call_module':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            env[nid] = graph.call_module(target, args=tuple(inputs))

            codeTemplate = node.get('codeTemplate', '')
            params = node.get('params', {})
            if codeTemplate:
                try:
                    instantiation = codeTemplate.format(**params)
                except KeyError:
                    instantiation = codeTemplate
                init_lines.append(f"        self.{target} = {instantiation}")
            else:
                layer_type = node.get('layer_type', 'nn.Identity')
                init_lines.append(f"        self.{target} = {layer_type}()")

        elif op == 'call_function':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            if target == 'cat':
                dim = node.get('params', {}).get('dim', 1)
                try:
                    dim = int(dim)
                except (ValueError, TypeError):
                    dim = 1
                env[nid] = graph.call_function(torch.cat, args=(inputs,), kwargs={'dim': dim})
            elif target == 'add':
                if len(inputs) == 0:
                    pass
                elif len(inputs) == 1:
                    env[nid] = inputs[0]
                elif len(inputs) == 2:
                    env[nid] = graph.call_function(torch.add, args=tuple(inputs))
                else:
                    acc = inputs[0]
                    for inp in inputs[1:]:
                        acc = graph.call_function(torch.add, args=(acc, inp))
                    env[nid] = acc
            elif target == 'mul':
                env[nid] = graph.call_function(torch.mul, args=tuple(inputs))
            else:
                func = getattr(torch, target, getattr(torch.nn.functional, target, None))
                if func:
                    env[nid] = graph.call_function(func, args=tuple(inputs))
                else:
                    env[nid] = graph.call_function(torch.add, args=tuple(inputs))

        elif op == 'accumulate':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            env[nid] = graph.call_function(torch.add, args=tuple(inputs))

        elif op == 'assign':
            if node.get('inputs') and node['inputs'][0] in env:
                env[nid] = env[node['inputs'][0]]

        elif op == 'output':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            if len(inputs) == 1:
                graph.output(inputs[0])
            elif len(inputs) > 1:
                graph.output(tuple(inputs))

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

    test_inputs = []
    test_calls = []
    for node in nodes:
        if node['op'] == 'placeholder':
            params = node.get('params', {})
            shape = params.get('shape', [64])
            batch = params.get('batch_size', 1)
            dtype = params.get('dtype', 'float32')
            
            # parse string shapes
            if isinstance(shape, str):
                cleaned = shape.strip("()[] ")
                parts = [p.strip() for p in cleaned.split(",") if p.strip()]
                shape = [int(p) for p in parts]
                
            if isinstance(shape, (list, tuple)):
                full_shape = [batch] + list(shape)
            else:
                full_shape = [batch, shape]
            
            if dtype.startswith('int') or dtype == 'long':
                test_inputs.append(f"    {node['id']} = torch.randint(0, 100, {full_shape})")
            else:
                test_inputs.append(f"    {node['id']} = torch.randn({full_shape})")
            test_calls.append(node['id'])
    
    test_inputs_str = "\n".join(test_inputs)
    test_calls_str = ", ".join(test_calls)
    
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
