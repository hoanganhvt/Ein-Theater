import os
import sys
import json
import torch
import torch.nn as nn
from torch.fx import Tracer, GraphModule

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import find_modules_json_path, load_modules_map


def get_module_params(module):
    """Extracts keyword initialization parameters from a PyTorch module."""
    params = {}
    if isinstance(module, nn.Linear):
        params = {
            'in_features': module.in_features,
            'out_features': module.out_features,
            'bias': module.bias is not None
        }
    elif isinstance(module, nn.Conv2d):
        params = {
            'in_channels': module.in_channels,
            'out_channels': module.out_channels,
            'kernel_size': module.kernel_size[0] if isinstance(module.kernel_size, tuple) else module.kernel_size,
            'stride': module.stride[0] if isinstance(module.stride, tuple) else module.stride,
            'padding': module.padding[0] if isinstance(module.padding, tuple) else module.padding,
            'bias': module.bias is not None
        }
    elif isinstance(module, nn.ConvTranspose2d):
        params = {
            'in_channels': module.in_channels,
            'out_channels': module.out_channels,
            'kernel_size': module.kernel_size[0] if isinstance(module.kernel_size, tuple) else module.kernel_size,
            'stride': module.stride[0] if isinstance(module.stride, tuple) else module.stride,
            'padding': module.padding[0] if isinstance(module.padding, tuple) else module.padding,
            'output_padding': module.output_padding[0] if isinstance(module.output_padding, tuple) else module.output_padding,
            'bias': module.bias is not None
        }
    elif isinstance(module, nn.ReLU):
        params = {'inplace': module.inplace}
    elif isinstance(module, nn.MaxPool2d):
        params = {
            'kernel_size': module.kernel_size,
            'stride': module.stride,
            'padding': module.padding
        }
    elif isinstance(module, nn.Dropout):
        params = {'p': module.p}
    elif isinstance(module, nn.BatchNorm2d):
        params = {
            'num_features': module.num_features,
            'eps': module.eps
        }
    elif isinstance(module, nn.LayerNorm):
        params = {
            'normalized_shape': module.normalized_shape[0] if isinstance(module.normalized_shape, tuple) else module.normalized_shape,
            'eps': module.eps
        }
    elif isinstance(module, nn.LSTM):
        params = {
            'input_size': module.input_size,
            'hidden_size': module.hidden_size,
            'num_layers': module.num_layers,
            'batch_first': module.batch_first
        }
    elif isinstance(module, nn.Embedding):
        params = {
            'num_embeddings': module.num_embeddings,
            'embedding_dim': module.embedding_dim
        }
    elif isinstance(module, nn.MultiheadAttention):
        params = {
            'embed_dim': module.embed_dim,
            'num_heads': module.num_heads,
            'dropout': module.dropout
        }
    elif isinstance(module, nn.Transformer):
        params = {
            'd_model': module.d_model,
            'nhead': module.nhead,
            'num_encoder_layers': module.encoder.num_layers,
            'num_decoder_layers': module.decoder.num_layers,
            'dim_feedforward': module.encoder.layers[0].linear1.out_features if module.encoder.num_layers > 0 else 2048,
            'dropout': module.encoder.layers[0].dropout.p if module.encoder.num_layers > 0 else 0.1,
            'activation': 'relu',
            'custom_encoder': None,
            'custom_decoder': None,
            'layer_norm_eps': module.encoder.layers[0].norm1.eps if module.encoder.num_layers > 0 else 1e-5,
            'batch_first': module.batch_first,
            'norm_first': module.encoder.layers[0].norm_first if module.encoder.num_layers > 0 else False
        }
    return params


def arg_to_str(arg):
    """Recursively formats FX node arguments to python string representations."""
    if isinstance(arg, torch.fx.Node):
        return arg.name
    elif isinstance(arg, (list, tuple)):
        items = ", ".join(arg_to_str(a) for a in arg)
        return f"[{items}]" if isinstance(arg, list) else f"({items})"
    elif isinstance(arg, str):
        return f"'{arg}'"
    else:
        return str(arg)


def format_node_args(node):
    """Formats positional and keyword arguments of an FX node into a single argument string."""
    args_str = ", ".join(arg_to_str(a) for a in node.args)
    kwargs_str = ", ".join(f"{k}={arg_to_str(v)}" for k, v in node.kwargs.items())
    if args_str and kwargs_str:
        return args_str + ", " + kwargs_str
    return args_str or kwargs_str


def model_to_json_graph(model_input):
    """
    Traces a PyTorch nn.Module class or instance using PyTorch FX
    and extracts a serializable JSON computational graph.
    """
    if isinstance(model_input, type):
        model_name = getattr(model_input, '__name__', 'Model')
        model = model_input()
    else:
        model_name = getattr(model_input.__class__, '__name__', 'Model')
        model = model_input

    class NodeTracer(Tracer):
        def is_leaf_module(self, m, module_qualified_name):
            if isinstance(m, (nn.Transformer, nn.TransformerEncoder, nn.TransformerDecoder, nn.TransformerEncoderLayer, nn.TransformerDecoderLayer)):
                return True
            return super().is_leaf_module(m, module_qualified_name)

    tracer = NodeTracer()
    graph = tracer.trace(model)
    traced_model = GraphModule(tracer.root, graph)

    nodes_out = []
    module_templates = load_modules_map()

    for node in traced_model.graph.nodes:
        node_info = {
            'id': node.name,
            'op': node.op,
            'inputs': [inp.name for inp in node.all_input_nodes],
            'args_str': format_node_args(node),
            'params': {},
            'type': None,
            'codeTemplate': ''
        }

        if node.op == 'placeholder':
            node_info['type'] = 'input'
        elif node.op == 'output':
            node_info['type'] = 'output'
            if isinstance(node.args[0], tuple):
                node_info['inputs'] = [n.name for n in node.args[0]]
            else:
                if hasattr(node.args[0], 'name'):
                    node_info['inputs'] = [node.args[0].name]
                else:
                    node_info['inputs'] = []
        elif node.op == 'call_module':
            submodule = model.get_submodule(str(node.target))
            layer_type = f'nn.{submodule.__class__.__name__}'
            node_info['type'] = layer_type
            node_info['target'] = str(node.target)

            params = get_module_params(submodule)
            node_info['params'] = params

            if layer_type in module_templates and 'code' in module_templates[layer_type]:
                node_info['codeTemplate'] = module_templates[layer_type]['code']
            else:
                args_str = ', '.join([f'{k}={{{k}!r}}' for k in params.keys()])
                node_info['codeTemplate'] = f'{layer_type}({args_str})'

        elif node.op == 'call_function':
            node_info['type'] = 'function'
            node_info['target'] = getattr(node.target, '__name__', str(node.target))
            node_info['params'] = {k: v for k, v in node.kwargs.items() if isinstance(v, (int, float, str, bool))}
        elif node.op == 'call_method':
            node_info['type'] = 'method'
            node_info['target'] = str(node.target)

        nodes_out.append(node_info)

    graph_data = {
        'metadata': {
            'device': 'cpu',  # Default device option
            'name': model_name
        },
        'nodes': nodes_out
    }
    return json.dumps(graph_data, indent=2)
