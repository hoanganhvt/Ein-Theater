"""Render integrated-model imports and generated example inputs."""
import os

if __package__:
    from .model_paths import to_relative_path
else:
    from model_paths import to_relative_path

def render_imports(nodes, base_dir):
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
                module_name = sub_name if norm_path in ('', '.', './') else os.path.basename(norm_path.rstrip('/'))
                index = len(integrated_imports)
                integrated_imports.append(
                    f"_sub_dir_{index} = os.path.normpath(os.path.join(_curr_dir, {norm_path!r}))\n"
                    f"_sub_spec_{index} = importlib.util.spec_from_file_location('ein_sub_{index}', os.path.join(_sub_dir_{index}, {module_name + '.py'!r}))\n"
                    f"if _sub_spec_{index} is None or _sub_spec_{index}.loader is None:\n"
                    f"    raise ImportError('Cannot load integrated model: {module_name}')\n"
                    f"_sub_module_{index} = importlib.util.module_from_spec(_sub_spec_{index})\n"
                    f"_sub_spec_{index}.loader.exec_module(_sub_module_{index})\n"
                    f"{sub_name} = getattr(_sub_module_{index}, {sub_name!r})"
                )

    imports = "import torch\nimport torch.nn as nn\n"
    if integrated_imports:
        imports += "import importlib.util\nimport os\n\n_curr_dir = os.path.dirname(os.path.abspath(__file__))\n\n"
        imports += "\n".join(integrated_imports) + "\n\n"
    else:
        imports += "\n"

    return imports


def render_example_inputs(nodes):
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

    return test_inputs_str, test_calls_str
