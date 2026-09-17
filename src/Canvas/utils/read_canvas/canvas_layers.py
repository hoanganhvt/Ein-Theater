"""Resolve layer names, constructors, and integrated-model metadata."""
from shared.common import fix_model_name
from read_canvas.canvas_inputs import is_input_node
from shared.module_registry import module_class, constructor_kwargs, parameters

def build_layers(node_map, modules_map, used_targets):
    # 2. Pre-calculate targets and metadata for all non-input nodes
    node_targets = {}
    node_meta = {}
    for nid, node in node_map.items():
        if is_input_node(node):
            continue

        layer_type = node.get('layerType', 'nn.Identity')
        params = node.get('params', {}) or {}

        is_integrated = (layer_type == 'IntegratedModel' or bool(params.get('model_path')))
        sub_name = fix_model_name(params.get('model_name') or 'IntegratedModel') if is_integrated else ''

        clean_type = (sub_name.lower() if is_integrated else layer_type.replace('nn.', '').replace('torch.', '').replace('.', '_').lower())
        if clean_type == 'conv2d':
            clean_type = 'conv'
        elif clean_type == 'batchnorm2d':
            clean_type = 'batchnorm'
        elif clean_type == 'maxpool2d':
            clean_type = 'maxpool'

        clean_id = str(nid).replace('-', '_').replace(' ', '_').lower()
        if clean_id.startswith(clean_type + "_"):
            base_target = clean_id
        else:
            base_target = f"{clean_type}_{clean_id}"
        target = base_target
        counter = 1
        while target in used_targets:
            target = f"{base_target}_{counter}"
            counter += 1
        used_targets.add(target)
        node_targets[nid] = target

        mod_def = modules_map.get(layer_type, {})
        code_template = mod_def.get('code', '')
        defaults = {}
        if 'fields' in mod_def:
            for f in mod_def['fields']:
                if 'default' in f:
                    defaults[f['key']] = f['default']
        merged_params = {**defaults, **params}

        constructor_resolved = False
        if is_integrated:
            code_template = f"{sub_name}()"
            actual_type = sub_name
        elif layer_type.startswith('nn.') and not params.get('customArgs'):
            merged_params = parameters(node)
            ctor = constructor_kwargs(module_class(layer_type), merged_params)
            # Use the same constructor arguments as dummy execution, including
            # inferred fields absent from older palette code templates.
            arguments = ', '.join(f'{key}={value!r}' for key, value in ctor.items())
            code_template = f'{layer_type}({arguments})'
            actual_type = layer_type
            constructor_resolved = True
        elif not code_template:
            if 'customArgs' in params and params['customArgs']:
                code_template = f"{layer_type}({params['customArgs']})"
            else:
                args_parts = [f"{k}={repr(v)}" for k, v in merged_params.items() if k != 'customArgs']
                code_template = f"{layer_type}({', '.join(args_parts)})"
            actual_type = layer_type
        else:
            actual_type = layer_type

        node_meta[nid] = {
            'target': target,
            'canvas_id': str(nid),
            'layer_type': actual_type,
            'params': merged_params,
            'codeTemplate': code_template,
            'constructorResolved': constructor_resolved,
            'is_integrated': is_integrated,
            'model_name': sub_name,
            'model_path': params.get('model_path', ''),
            'weights_path': params.get('weights_path', ''),
            'freeze_weights': params.get('freeze_weights', False)
        }

    return node_targets, node_meta


def make_module_node(target, meta, inputs, args_str, in_forward=True):
    return {
        'id': target,
        'canvas_id': meta.get('canvas_id', ''),
        'op': 'call_module',
        'target': target,
        'type': meta.get('layer_type', 'nn.Identity'),
        'inputs': inputs,
        'args_str': args_str,
        'params': meta.get('params', {}),
        'codeTemplate': meta.get('codeTemplate', ''),
        'constructorResolved': meta.get('constructorResolved', False),
        'is_integrated': meta.get('is_integrated', False),
        'model_name': meta.get('model_name', ''),
        'model_path': meta.get('model_path', ''),
        'weights_path': meta.get('weights_path', ''),
        'freeze_weights': meta.get('freeze_weights', False),
        'in_forward': in_forward
    }
