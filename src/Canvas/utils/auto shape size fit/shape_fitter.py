#!/usr/bin/env python3
import os
import sys
import json
import torch
import torch.nn as nn
import torch.fx as fx
from torch.fx.passes.shape_prop import ShapeProp
import copy

_curr_dir = os.path.dirname(os.path.abspath(__file__))
_gen_dir = os.path.join(os.path.dirname(_curr_dir), "generate code")
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)
if _gen_dir not in sys.path:
    sys.path.insert(0, _gen_dir)

from canvas import canvas_to_json_graph
from codegen import fix_model_name

class AutoFixShapeProp(ShapeProp):
    def __init__(self, module):
        super().__init__(module)
        self.adjustments = []
        self.shapes = {}
        self.padding_adjustments = []
        self.warnings = []

    def run_node(self, n: fx.Node):
        args, kwargs = self.fetch_args_kwargs_from_env(n)
        
        if n.op == 'call_module':
            target_mod = getattr(self.module, n.target)
            input_tensor = args[0] if len(args) > 0 else None
            
            if isinstance(input_tensor, torch.Tensor):
                actual_in_channels = input_tensor.shape[1] if input_tensor.ndim > 1 else input_tensor.shape[0]
                
                # Auto fix Conv
                if isinstance(target_mod, (nn.Conv2d, nn.ConvTranspose2d, nn.Conv1d)):
                    if getattr(target_mod, 'in_channels', None) != actual_in_channels:
                        old_val = target_mod.in_channels
                        self.adjustments.append(f"Fixed {n.target} in_channels: {old_val} -> {actual_in_channels}")
                        new_mod = type(target_mod)(
                            in_channels=actual_in_channels,
                            out_channels=target_mod.out_channels,
                            kernel_size=target_mod.kernel_size,
                            stride=target_mod.stride,
                            padding=target_mod.padding,
                            bias=(target_mod.bias is not None)
                        )
                        setattr(self.module, n.target, new_mod)
                        
                # Auto fix Linear
                elif isinstance(target_mod, nn.Linear):
                    actual_in_features = input_tensor.shape[-1]
                    if getattr(target_mod, 'in_features', None) != actual_in_features:
                        old_val = target_mod.in_features
                        self.adjustments.append(f"Fixed {n.target} in_features: {old_val} -> {actual_in_features}")
                        new_mod = nn.Linear(actual_in_features, target_mod.out_features, bias=(target_mod.bias is not None))
                        setattr(self.module, n.target, new_mod)
                        
                # Auto fix BatchNorm
                elif isinstance(target_mod, (nn.BatchNorm2d, nn.BatchNorm1d)):
                    if getattr(target_mod, 'num_features', None) != actual_in_channels:
                        old_val = target_mod.num_features
                        self.adjustments.append(f"Fixed {n.target} num_features: {old_val} -> {actual_in_channels}")
                        new_mod = type(target_mod)(actual_in_channels)
                        setattr(self.module, n.target, new_mod)
                        
        try:
            result = super().run_node(n)
        except RuntimeError as e:
            self.warnings.append(f"Node {n.target} failed during shape propagation: {e}")
            if n.op == 'call_function' and getattr(n.target, '__name__', '') == 'add':
                result = args[0]
            else:
                if len(args) > 0 and isinstance(args[0], torch.Tensor):
                    result = args[0]
                else:
                    raise e
                
        if isinstance(result, torch.Tensor):
            self.shapes[n.name] = list(result.shape)
        elif isinstance(result, tuple) and len(result) > 0 and isinstance(result[0], torch.Tensor):
            self.shapes[n.name] = list(result[0].shape)
            
        return result

def auto_shape_size_fit(model_json_or_dict):
    """
    Automated shape propagation using torch.fx.passes.shape_prop
    """
    if isinstance(model_json_or_dict, str):
        if os.path.isfile(model_json_or_dict):
            with open(model_json_or_dict, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            data = json.loads(model_json_or_dict)
    else:
        data = copy.deepcopy(model_json_or_dict)

    if not data.get('nodes'):
        return {
            'status': 'ok', 'model': data, 'adjustments': [],
            'padding_adjustments': [], 'warnings': ['Model graph contains no nodes.'],
            'shapes': {}, 'integrated_mismatches': []
        }

    if 'op' in data['nodes'][0]:
        fx_data = data
        nodes = data['nodes']
    else:
        fx_data = json.loads(canvas_to_json_graph(data))
        nodes = fx_data['nodes']
    
    root = nn.Module()
    graph = fx.Graph()
    env = {}
    
    target_to_canvas = {}
    
    dummy_inputs = []

    class DummyModule(nn.Module):
        def forward(self, *args, **kwargs):
            return args[0] if len(args) > 0 else None

    for node in nodes:
        op = node['op']
        nid = node['id']
        canvas_id = node.get('canvas_id', '')
        
        target = node.get('target', nid)
        target_to_canvas[target] = canvas_id

        if op == 'placeholder':
            env[nid] = graph.placeholder(target)
            
            params = node.get('params', {})
            shape = params.get('shape', [64])
            batch = params.get('batch_size', 1)
            dtype = params.get('dtype', 'float32')
            
            if isinstance(shape, str):
                cleaned = shape.strip("()[] ")
                parts = [p.strip() for p in cleaned.split(",") if p.strip()]
                shape = [int(p) for p in parts]
                
            if isinstance(shape, (list, tuple)):
                full_shape = [batch] + list(shape)
            else:
                full_shape = [batch, shape]
            
            if dtype.startswith('int') or dtype == 'long':
                dummy = torch.randint(0, 100, full_shape)
            else:
                dummy = torch.randn(full_shape)
            dummy_inputs.append(dummy)
            
        elif op == 'call_module':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            env[nid] = graph.call_module(target, args=tuple(inputs))
            
            codeTemplate = node.get('codeTemplate', '')
            params = node.get('params', {})
            if codeTemplate:
                try:
                    instantiation_str = codeTemplate.format(**params)
                    if instantiation_str.startswith('nn.'):
                        inst = eval(instantiation_str)
                        root.add_module(target, inst)
                    else:
                        root.add_module(target, DummyModule())
                except Exception:
                    root.add_module(target, DummyModule())
            else:
                layer_type = node.get('layer_type', 'DummyModule')
                if layer_type.startswith('nn.'):
                    try:
                        inst = eval(layer_type + "()")
                        root.add_module(target, inst)
                    except Exception:
                        root.add_module(target, DummyModule())
                else:
                    root.add_module(target, DummyModule())

        elif op == 'call_function':
            inputs = [env[i] for i in node.get('inputs', []) if i in env]
            if target == 'cat':
                env[nid] = graph.call_function(torch.cat, args=(inputs,), kwargs={'dim': 1})
            elif target == 'add':
                env[nid] = graph.call_function(torch.add, args=tuple(inputs))
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

    gm = fx.GraphModule(root, graph)
    
    prop = AutoFixShapeProp(gm)
    try:
        prop.propagate(*dummy_inputs)
    except Exception as e:
        prop.warnings.append(f"Propagation aborted: {e}")

    canvas_shapes = {}
    for target, shape in prop.shapes.items():
        cid = target_to_canvas.get(target)
        if cid:
            canvas_shapes[cid] = shape
            
    for node in data.get('nodes', []):
        cid = str(node.get('id', ''))
        target = next((t for t, c in target_to_canvas.items() if str(c) == cid), None)
        if target and hasattr(gm, target):
            mod = getattr(gm, target)
            if 'params' not in node:
                node['params'] = {}
            if hasattr(mod, 'in_channels'):
                node['params']['in_channels'] = mod.in_channels
            if hasattr(mod, 'in_features'):
                node['params']['in_features'] = mod.in_features
            if hasattr(mod, 'num_features'):
                node['params']['num_features'] = mod.num_features

    return {
        'status': 'ok',
        'model': data,
        'adjustments': prop.adjustments,
        'padding_adjustments': prop.padding_adjustments,
        'warnings': prop.warnings,
        'shapes': canvas_shapes,
        'integrated_mismatches': []
    }

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Ein Theater Auto Shape Size Fit CLI")
    parser.add_argument("--input", "-i", required=True, help="Path to input model JSON file")
    parser.add_argument("--output", "-o", help="Path to save fitted model JSON file")
    args = parser.parse_args()

    res = auto_shape_size_fit(args.input)

    print(f"[Auto Shape Size Fit] Completed for '{args.input}':")
    print(f"  Adjustments made: {len(res['adjustments'])}")
    for a in res['adjustments']:
        print(f"    - {a}")
    print(f"  Warnings: {len(res['warnings'])}")
    for w in res['warnings']:
        print(f"    ! {w}")

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(res['model'], f, indent=2)
        print(f"[OK] Saved fitted model to {args.output}")
