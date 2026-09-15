import os
import sys
import json

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import fix_model_name, fix_input_name, load_modules_map
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
    fit_fn = get_auto_shape_fit_fn()
    shapes = None
    if fit_fn is not None:
        try:
            fit_res = fit_fn(json_graph_str)
            json_graph_str = json.dumps(fit_res['model'], indent=2)
            shapes = fit_res.get('shapes')
        except Exception:
            pass
    return generate_code_from_json(json_graph_str, base_dir=base_dir, shapes=shapes, **kwargs)



def save_model_to_folder(canvas_data, output_dir=None, confirm_autofit=False):
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
            integrated_mismatches = fit_res.get('integrated_mismatches', [])

            # Check if user confirmation is needed before modifying the integrated model
            if integrated_mismatches and not confirm_autofit:
                if os.path.exists(temp_json_path):
                    try:
                        os.remove(temp_json_path)
                    except OSError:
                        pass
                warn_lines = [f"• {m['warning']}" for m in integrated_mismatches]
                full_warning = "\n".join(warn_lines)
                m0 = integrated_mismatches[0]
                model_names = ", ".join(list(dict.fromkeys(m.get('model_name', 'model') for m in integrated_mismatches)))
                return {
                    'status': 'needs_confirmation',
                    'needs_confirmation': True,
                    'mismatches': integrated_mismatches,
                    'warning': full_warning,
                    'model_name': model_names,
                    'expected_shape': m0['expected_shape'],
                    'actual_shape': m0['actual_shape']
                }

            # User confirmed autofitting integrated model internal nodes
            if integrated_mismatches and confirm_autofit:
                # ponytail: support multiple integrated models with distinct fitted folders per unique input shape
                fitted_models_map = {}  # (sub_name, tuple(in_spec)) -> { 'name': new_sub_name, 'clean_path': clean_new_path, 'out_shape': sub_out_shape }
                name_counters = {}

                for m in integrated_mismatches:
                    sub_path = m.get('model_path')
                    sub_name = m.get('model_name')
                    new_shape = m.get('actual_shape')
                    in_spec = new_shape[1:] if len(new_shape) > 1 else new_shape
                    key = (sub_name, tuple(in_spec))

                    clean_new_path = ''
                    new_sub_name = ''
                    sub_out_shape = None

                    if key in fitted_models_map:
                        cached = fitted_models_map[key]
                        new_sub_name = cached['name']
                        clean_new_path = cached['clean_path']
                        sub_out_shape = cached['out_shape']
                    elif sub_path:
                        resolved_sub_path = sub_path
                        if not os.path.exists(resolved_sub_path):
                            for cand_dir in [target_folder, output_dir, os.getcwd()]:
                                if cand_dir:
                                    cand = os.path.join(cand_dir, sub_path)
                                    if os.path.exists(cand):
                                        resolved_sub_path = cand
                                        break
                        if os.path.exists(resolved_sub_path):
                            sub_json_path = os.path.join(resolved_sub_path, f"{sub_name}.json")
                            if not os.path.exists(sub_json_path):
                                for fn in os.listdir(resolved_sub_path):
                                    if fn.endswith('.json') and not fn.startswith('temp'):
                                        sub_json_path = os.path.join(resolved_sub_path, fn)
                                        sub_name = os.path.splitext(fn)[0]
                                        break
                            if os.path.exists(sub_json_path):
                                try:
                                    with open(sub_json_path, 'r', encoding='utf-8') as f_sub:
                                        sub_data = json.load(f_sub)

                                    name_counters[sub_name] = name_counters.get(sub_name, 0) + 1
                                    count = name_counters[sub_name]
                                    new_sub_name = f"{sub_name}_fitted" if count == 1 else f"{sub_name}_fitted_{count}"
                                    new_sub_dir = os.path.join(target_folder, new_sub_name)
                                    os.makedirs(new_sub_dir, exist_ok=True)
                                    new_sub_json_path = os.path.join(new_sub_dir, f"{new_sub_name}.json")
                                    new_sub_py_path = os.path.join(new_sub_dir, f"{new_sub_name}.py")

                                    sub_canvas = sub_data.get('canvas', {})
                                    sub_nodes = sub_canvas.get('nodes', []) or sub_data.get('nodes', [])
                                    for sn in sub_nodes:
                                        stype = str(sn.get('layerType') or sn.get('type') or '').lower()
                                        if stype == 'input' or sn.get('op') == 'placeholder':
                                            sparams = sn.setdefault('params', {})
                                            sparams['shape'] = in_spec
                                            sparams['custom_shape'] = ', '.join(str(x) for x in in_spec)

                                    if 'metadata' in sub_data:
                                        sub_data['metadata']['input_shape'] = in_spec
                                        sub_data['metadata']['name'] = new_sub_name
                                    if 'canvas' in sub_data:
                                        sub_data['canvas']['name'] = new_sub_name

                                    sub_fit = fit_fn(sub_data)
                                    sub_fitted_model = sub_fit.get('model', sub_data)
                                    sub_py_code = generate_code_from_json(sub_fitted_model, model_name=new_sub_name, base_dir=new_sub_dir)

                                    with open(new_sub_json_path, 'w', encoding='utf-8') as f_sub_out:
                                        json.dump(sub_fitted_model, f_sub_out, indent=2)
                                    with open(new_sub_py_path, 'w', encoding='utf-8') as f_sub_py:
                                        f_sub_py.write(sub_py_code)

                                    clean_new_path = f"./{new_sub_name}"

                                    if 'shapes' in sub_fit and sub_fit['shapes']:
                                        last_nid = list(sub_fit['shapes'].keys())[-1]
                                        sub_out_shape = sub_fit['shapes'][last_nid]
                                        if isinstance(sub_out_shape, list) and len(sub_out_shape) > 1:
                                            sub_out_shape = sub_out_shape[1:]

                                    fitted_models_map[key] = {
                                        'name': new_sub_name,
                                        'clean_path': clean_new_path,
                                        'out_shape': sub_out_shape
                                    }
                                    adjustments.append(f"Created shape-fitted model '{new_sub_name}' in '{new_sub_name}/' and integrated path into model JSON")
                                except Exception as sub_err:
                                    warnings.append(f"Autofit sub-model error: {sub_err}")

                    if new_sub_name and clean_new_path:
                        # Update integrated model path and port shapes in parent model
                        for n in temp_model_data.get('nodes', []):
                            if n.get('id') == m['node_id'] or n.get('target') == m['node_id']:
                                n['model_path'] = clean_new_path
                                n['model_name'] = new_sub_name
                                n['type'] = new_sub_name
                                n_params = n.setdefault('params', {})
                                n_params['model_path'] = clean_new_path
                                n_params['model_name'] = new_sub_name
                                if 'inputs' in n_params and isinstance(n_params['inputs'], list) and len(n_params['inputs']) > 0:
                                    n_params['inputs'][0]['shape'] = in_spec
                                if sub_out_shape and 'outputs' in n_params and isinstance(n_params['outputs'], list) and len(n_params['outputs']) > 0:
                                    n_params['outputs'][0]['shape'] = sub_out_shape

                        # Update visual canvas representation in parent model
                        canvas_nodes = temp_model_data.get('canvas', {}).get('nodes', [])
                        for cn in canvas_nodes:
                            if str(cn.get('id', '')) == str(m['node_id']):
                                c_params = cn.setdefault('params', {})
                                c_params['model_path'] = clean_new_path
                                c_params['model_name'] = new_sub_name
                                if 'inputs' in c_params and isinstance(c_params['inputs'], list) and len(c_params['inputs']) > 0:
                                    c_params['inputs'][0]['shape'] = in_spec
                                if sub_out_shape and 'outputs' in c_params and isinstance(c_params['outputs'], list) and len(c_params['outputs']) > 0:
                                    c_params['outputs'][0]['shape'] = sub_out_shape

                                inst_id = str(cn.get('id', '')).split('_')[-1] if '_' in str(cn.get('id', '')) else ''
                                header = f"⚡ [IC] {new_sub_name} #{inst_id}" if inst_id else f"⚡ [IC] {new_sub_name}"
                                lines = [header, "────────────────────────"]
                                for inp in c_params.get('inputs', []):
                                    s = inp.get('shape', '')
                                    s_str = f"[{', '.join(str(x) for x in s)}]" if isinstance(s, list) else str(s)
                                    lines.append(f"▶ IN:  {inp.get('name', 'in')} {s_str}".strip())
                                lines.append("────────────────────────")
                                for out in c_params.get('outputs', []):
                                    s = out.get('shape', '')
                                    s_str = f"[{', '.join(str(x) for x in s)}]" if isinstance(s, list) else str(s)
                                    lines.append(f"◀ OUT: {out.get('name', 'out')} {s_str}".strip())
                                cn['label'] = "\n".join(lines)
                                cn['title'] = f"Integrated Model: {new_sub_name} (#{inst_id})\nPath: {clean_new_path}"

                # Re-run shape fitter on the parent graph
                fit_res = fit_fn(temp_model_data)

            fitted_model = fit_res.get('model', temp_model_data)
            adjustments.extend(fit_res.get('adjustments', []))
            pad_adjustments = fit_res.get('padding_adjustments', [])
            warnings.extend(fit_res.get('warnings', []))
        else:
            fitted_model = temp_model_data
    except Exception as e:
        fitted_model = temp_model_data
        warnings.append(f"Auto shape fit encountered error: {e}")

    # Convert all model_path and weights_path inside fitted_model to relative paths
    for n in fitted_model.get('nodes', []):
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

    for cn in fitted_model.get('canvas', {}).get('nodes', []):
        c_params = cn.get('params')
        if isinstance(c_params, dict):
            if c_params.get('model_path'):
                c_params['model_path'] = to_relative_path(c_params['model_path'], base_dir=target_folder)
                inst_id = str(cn.get('id', '')).split('_')[-1] if '_' in str(cn.get('id', '')) else ''
                mname = c_params.get('model_name') or 'Submodel'
                cn['title'] = f"Integrated Model: {mname}{' (#' + inst_id + ')' if inst_id else ''}\nPath: {c_params['model_path']}"
            if c_params.get('weights_path'):
                c_params['weights_path'] = to_relative_path(c_params['weights_path'], base_dir=target_folder)

    final_graph_str = json.dumps(fitted_model, indent=2)

    # 4. Only after that, generate final code and final json
    shapes = fit_res.get('shapes') if 'fit_res' in locals() and isinstance(fit_res, dict) else None
    py_code = generate_code_from_json(final_graph_str, model_name=safe_name, base_dir=target_folder, shapes=shapes)

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


def generate_code_from_json(json_data, model_name=None, base_dir=None, **kwargs):
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

    # Integrated models import
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

    imports = "import torch\nimport torch.nn as nn\nimport operator\n"
    if integrated_imports:
        imports += "import sys\nimport os\n\n_curr_dir = os.path.dirname(os.path.abspath(__file__))\n\n"
        imports += "\n".join(integrated_imports) + "\n\n"
    else:
        imports += "\n"

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
        if node.get('edge_comments'):
            edge_comment = "".join([f"        # {c}\n" for c in node['edge_comments']])
        elif 'edge_index' in node and node['edge_index'] is not None:
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
                is_sub = node.get('is_integrated') or (isinstance(node.get('params'), dict) and bool(node.get('params', {}).get('model_path')))
                if is_sub:
                    sub_name = node.get('model_name') or node.get('type')
                    p_map = node.get('params', {}) or {}
                    raw_w = str(node.get('weights_path') or p_map.get('weights_path', '')).strip()
                    rel_w = to_relative_path(raw_w, base_dir=base_dir) if raw_w else ""
                    freeze = bool(node.get('freeze_weights', p_map.get('freeze_weights', False)))

                    init_code += f"        # Integrated Model: {sub_name}\n"
                    init_code += f"        self.{safe_target} = {sub_name}(device=self.device)\n"
                    init_code += f"        # [Coming Soon] Load weights from checkpoint\n"
                    init_code += f"        weights_path = r\"{rel_w}\"\n"
                    init_code += f"        if weights_path:\n"
                    init_code += f"            # self.{safe_target}.load_state_dict(torch.load(weights_path, map_location=self.device))\n"
                    init_code += f"            pass\n"
                    init_code += f"        # [Coming Soon] Freeze model weights\n"
                    init_code += f"        freeze_weights = {freeze}\n"
                    init_code += f"        if freeze_weights:\n"
                    init_code += f"            # for p in self.{safe_target}.parameters():\n"
                    init_code += f"            #     p.requires_grad = False\n"
                    init_code += f"            pass\n"
                else:
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
