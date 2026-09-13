import os
import sys
import json

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import fix_model_name, load_modules_map
from canvas import canvas_to_json_graph


def get_auto_shape_fit_fn():
    """Dynamically resolves and imports auto_shape_size_fit function."""
    try:
        from shape_fitter import auto_shape_size_fit
        return auto_shape_size_fit
    except ImportError:
        pass

    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'auto shape size fit')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'Canvas', 'utils', 'auto shape size fit')),
    ]
    for c in candidates:
        if os.path.exists(c) and c not in sys.path:
            sys.path.insert(0, c)
            try:
                from shape_fitter import auto_shape_size_fit
                return auto_shape_size_fit
            except ImportError:
                pass

    import importlib.util
    for c in candidates:
        sf_path = os.path.join(c, 'shape_fitter.py')
        if os.path.exists(sf_path):
            try:
                spec = importlib.util.spec_from_file_location("shape_fitter", sf_path)
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                return mod.auto_shape_size_fit
            except Exception:
                pass
    return None


def generate_code_from_canvas(canvas_data):
    """Generates PyTorch model code directly from canvas graph data."""
    json_graph_str = canvas_to_json_graph(canvas_data)
    fit_fn = get_auto_shape_fit_fn()
    if fit_fn is not None:
        try:
            fit_res = fit_fn(json_graph_str)
            json_graph_str = json.dumps(fit_res['model'], indent=2)
        except Exception:
            pass
    return generate_code_from_json(json_graph_str)


def save_model_to_folder(canvas_data, output_dir=None):
    """
    Saves the model in output_dir inside a folder named after the model:
      <output_dir>/<model_name>/
        - <model_name>.json
        - <model_name>.py

    Lifecycle:
      1. Generates initial raw JSON graph from canvas.
      2. Writes <target_folder>/temp.json.
      3. Invokes auto_shape_size_fit on temp.json to fix shapes and padding.
      4. Generates final Python code (<model_name>.py) and final JSON (<model_name>.json).
      5. Removes temp.json.
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

    # 1. Generate initial raw graph from canvas
    raw_graph_str = canvas_to_json_graph(data)

    # 2. Write temp.json
    temp_json_path = os.path.join(target_folder, "temp.json")
    with open(temp_json_path, 'w', encoding='utf-8') as f:
        f.write(raw_graph_str)

    # 3. Read and fix shapes from temp.json via auto_shape_size_fit
    adjustments = []
    pad_adjustments = []
    warnings = []
    try:
        with open(temp_json_path, 'r', encoding='utf-8') as f:
            temp_model_data = json.load(f)

        fit_fn = get_auto_shape_fit_fn()
        if fit_fn is not None:
            fit_res = fit_fn(temp_model_data)
            fitted_model = fit_res.get('model', temp_model_data)
            adjustments = fit_res.get('adjustments', [])
            pad_adjustments = fit_res.get('padding_adjustments', [])
            warnings = fit_res.get('warnings', [])
            final_graph_str = json.dumps(fitted_model, indent=2)
        else:
            final_graph_str = raw_graph_str
    except Exception as e:
        final_graph_str = raw_graph_str
        warnings.append(f"Auto shape fit encountered error: {e}")

    # 4. Only after that, generate final code and final json
    py_code = generate_code_from_json(final_graph_str, model_name=safe_name)

    parsed_graph = json.loads(final_graph_str) if isinstance(final_graph_str, str) else final_graph_str
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
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\\nModel Parameters: {{total_params:,}} total ({{trainable_params:,}} trainable)")

{dummy_code}
    try:
        output = model({call_args_str})
        if output is not None:
            print("\\n[OK] Forward pass test successful!")
            if isinstance(output, torch.Tensor):
                print(f"Output tensor shape: {{tuple(output.shape)}}")
            elif isinstance(output, (list, tuple)):
                print(f"Output shapes: {{[tuple(o.shape) if hasattr(o, 'shape') else type(o) for o in output]}}")
        else:
            print("\\n[OK] Model forward is empty (no edges connected).")
    except Exception as e:
        print(f"\\n[!] Note: Forward pass test with dummy inputs encountered: {{e}}")
"""
    if "__main__" not in py_code:
        py_code = py_code + "\n" + runner_code

    json_file_path = os.path.join(target_folder, f"{safe_name}.json")
    py_file_path = os.path.join(target_folder, f"{safe_name}.py")

    with open(json_file_path, 'w', encoding='utf-8') as f:
        f.write(final_graph_str)

    with open(py_file_path, 'w', encoding='utf-8') as f:
        f.write(py_code)

    # 5. Afterwards, remove temp.json
    if os.path.exists(temp_json_path):
        try:
            os.remove(temp_json_path)
        except OSError:
            pass

    return {
        'status': 'ok',
        'folder': target_folder,
        'folderName': safe_name,
        'jsonFile': json_file_path,
        'pyFile': py_file_path,
        'modelName': safe_name,
        'adjustments': adjustments,
        'padding_adjustments': pad_adjustments,
        'warnings': warnings
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

    modules_map = load_modules_map()
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

    instantiated_modules = set()
    forward_lines = []

    for node in nodes:
        if node['op'] == 'placeholder':
            continue

        edge_comment = ""
        if 'edge_index' in node and node['edge_index'] is not None:
            edge_type = node.get('edge_type', '')
            if edge_type == 'residual':
                edge_comment = f"        # Residual Edge #{node['edge_index']}: {node.get('edge_from', '')} -> {node.get('edge_to', '')}\n"
            elif edge_type == 'skip':
                edge_comment = f"        # Skip Edge #{node['edge_index']}: {node.get('edge_from', '')} -> {node.get('edge_to', '')}\n"
            else:
                edge_comment = f"        # Special Edge #{node['edge_index']}: {node.get('edge_from', '')} -> {node.get('edge_to', '')}\n"

        if node['op'] == 'call_module':
            safe_target = node['target'].replace('.', '_')
            if safe_target not in instantiated_modules:
                instantiated_modules.add(safe_target)
                params = dict(node.get('params', {}) or {})
                if not params:
                    mod_def = modules_map.get(node.get('type', ''), {})
                    if 'fields' in mod_def:
                        for f in mod_def['fields']:
                            if 'default' in f:
                                params[f['key']] = f['default']
                try:
                    template = node.get('codeTemplate', '')
                    if template:
                        instantiation = template.format(**params)
                    else:
                        raise ValueError("no template")
                except Exception:
                    args_parts = [f"{k}={repr(v)}" for k, v in params.items() if k != 'customArgs']
                    if not args_parts and params.get('customArgs'):
                        args_parts = [params['customArgs']]
                    instantiation = f"{node.get('type', 'nn.Identity')}({', '.join(args_parts)})"
                init_code += f"        self.{safe_target} = {instantiation}\n"

            if node.get('in_forward', True) and node.get('args_str'):
                line = ""
                if edge_comment:
                    line += edge_comment
                line += f"        {node['id']} = self.{safe_target}({node.get('args_str', '')})\n"
                forward_lines.append(line)

        elif node['op'] == 'assign':
            if node.get('in_forward', True):
                line = ""
                if edge_comment:
                    line += edge_comment
                line += f"        {node['id']} = {node.get('args_str', '')}\n"
                forward_lines.append(line)

        elif node['op'] == 'accumulate':
            if node.get('in_forward', True):
                line = ""
                if edge_comment:
                    line += edge_comment
                line += f"        {node['id']} = {node['id']} + {node.get('args_str', '')}\n"
                forward_lines.append(line)

        elif node['op'] == 'call_function':
            if node.get('in_forward', True):
                line = ""
                if edge_comment:
                    line += edge_comment
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
                line += f"        {node['id']} = {func}({args_str})\n"
                forward_lines.append(line)

        elif node['op'] == 'call_method':
            if node.get('in_forward', True):
                line = ""
                if edge_comment:
                    line += edge_comment
                obj = node['inputs'][0]
                args_str = node.get('args_str', '')
                if args_str.startswith(obj):
                    rest = args_str[len(obj):].lstrip(', ')
                else:
                    rest = ""
                line += f"        {node['id']} = {obj}.{node['target']}({rest})\n"
                forward_lines.append(line)

        elif node['op'] == 'output':
            outputs_str = ", ".join(node['inputs'])
            if outputs_str:
                forward_lines.append(f"        return {outputs_str}\n")

    if forward_lines:
        forward_code += "".join(forward_lines)
    else:
        forward_code += "        pass\n"

    if not init_code:
        init_code = ""
    init_code += "        self.to(self.device)\n"

    code = imports + header + init_code + "\n" + forward_code
    
    code += f"\n\n# steve once here\n\n"
    return code
