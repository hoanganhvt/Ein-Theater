"""Prepare nested model artifacts before writing the complete compilation plan."""
import ast
import copy
import hashlib
import json
import os
import re

from shared.common import fix_model_name
from read_canvas.canvas import canvas_to_json_graph
from auto_shape_fitting.shape_engine import infer_shapes, validate_for_save
if __package__:
    from .model_paths import to_relative_path
    from .source_renderer import generate_code_from_json
else:
    from model_paths import to_relative_path
    from source_renderer import generate_code_from_json

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
    data = copy.deepcopy(data)
    # Prepare every nested model before writing any files. Failed compilation
    # must not leave a parent pointing at an incomplete adapted child.
    plan = kwargs.get('_plan')
    root_save = plan is None
    if root_save:
        plan = []
        data = infer_shapes(data, kwargs.get('base_dir') or output_dir or os.getcwd())
        validate_for_save(data)
    depth = kwargs.get('_depth', 0)
    if depth > 32:
        raise ValueError('Integrated model nesting exceeds 32 levels')
    adapted_folders = kwargs.get('_adapted_folders')
    if adapted_folders is None:
        adapted_folders = []

    raw_name = data.get('name', 'Untitled_Model').strip() or 'Untitled_Model'
    safe_name = fix_model_name(raw_name)

    if output_dir is None:
        output_dir = os.getcwd()

    target_folder = os.path.join(output_dir, safe_name)
    for node in data.get('nodes', []):
        adapted = node.pop('adaptedModel', None)
        if adapted is None:
            continue
        params = node.setdefault('params', {})
        identity = {'source': params.get('model_path', ''), 'canvas': adapted}
        digest = hashlib.sha256(json.dumps(identity, sort_keys=True).encode('utf-8')).hexdigest()[:16]
        base_name = fix_model_name(adapted.get('name') or params.get('model_name') or 'Model')
        base_name = re.sub(r'(?:_adapted_[0-9a-f]{16})+$', '', base_name)
        variant_name = f'{base_name}_adapted_{digest}'
        adapted['name'] = variant_name
        child = save_model_to_folder(adapted, target_folder, _plan=plan,
                                     _depth=depth + 1, _adapted_folders=adapted_folders)
        params['model_name'] = variant_name
        params['model_path'] = os.path.abspath(child['folder'])
        params['weights_path'] = ''
        params['freeze_weights'] = False
        adapted_folders.append(child['folder'])

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

    ast.parse(py_code)
    plan.append((target_folder, json_file_path, final_graph_str, py_file_path, py_code))
    if root_save:
        for folder, json_path, graph_text, py_path, source in plan:
            os.makedirs(folder, exist_ok=True)
            with open(json_path, 'w', encoding='utf-8') as f:
                f.write(graph_text)
            with open(py_path, 'w', encoding='utf-8') as f:
                f.write(source)

    return {
        'status': 'ok',
        'folder': target_folder,
        'folderName': safe_name,
        'jsonFile': json_file_path,
        'pyFile': py_file_path,
        'modelName': safe_name,
        'adaptedModels': list(dict.fromkeys(adapted_folders)) if root_save else []
    }
