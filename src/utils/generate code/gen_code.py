import torch
import torch.nn as nn
import operator
from torch.fx import symbolic_trace
from typing import Union, Type, List, Dict, Tuple, Any


def is_addition_node(node) -> bool:
    """Check if an FX node performs an addition operation (+ or torch.add)."""
    if node.op == "call_function":
        if node.target in (operator.add, operator.iadd, torch.add):
            return True
        if hasattr(node.target, "__name__") and node.target.__name__ in ("add", "iadd"):
            return True
    elif node.op == "call_method":
        if str(node.target) in ("add", "add_", "__add__", "__iadd__"):
            return True
    return False


def is_sub_node(node) -> bool:
    """Check if an FX node performs a subtraction operation (- or torch.sub)."""
    if node.op == "call_function":
        if node.target in (operator.sub, operator.isub, torch.sub):
            return True
        if hasattr(node.target, "__name__") and node.target.__name__ in ("sub", "isub"):
            return True
    elif node.op == "call_method":
        if str(node.target) in ("sub", "sub_", "__sub__", "__isub__"):
            return True
    return False


def is_concat_node(node) -> bool:
    """Check if an FX node performs a concatenation / stacking operation."""
    if node.op == "call_function":
        concat_targets = [torch.cat, torch.stack]
        if hasattr(torch, "concat"):
            concat_targets.append(torch.concat)
        if node.target in concat_targets:
            return True
        if hasattr(node.target, "__name__") and node.target.__name__ in ("cat", "concat", "stack"):
            return True
    elif node.op == "call_method":
        if str(node.target) in ("cat", "concat", "stack"):
            return True
    return False


def is_mul_node(node) -> bool:
    """Check if an FX node performs an element-wise multiplication (gating / Hadamard)."""
    if node.op == "call_function":
        if node.target in (operator.mul, operator.imul, torch.mul):
            return True
        if hasattr(node.target, "__name__") and node.target.__name__ in ("mul", "imul"):
            return True
    elif node.op == "call_method":
        if str(node.target) in ("mul", "mul_", "__mul__", "__imul__"):
            return True
    return False


def get_layer_type_label(node, model: nn.Module) -> str:
    """Get a human-readable label for the operation or module type."""
    if node.op == "placeholder":
        return "Input (placeholder)"
    elif node.op == "output":
        return "Output"
    elif node.op == "call_module":
        try:
            submodule = model.get_submodule(str(node.target))
            return submodule.__class__.__name__
        except Exception:
            return f"Module ({node.target})"
    elif node.op == "call_function":
        target = node.target
        name = getattr(target, "__name__", str(target))
        if is_addition_node(node):
            return f"add (+) [{name}]"
        elif is_sub_node(node):
            return f"sub (-) [{name}]"
        elif is_concat_node(node):
            return f"concat [{name}]"
        elif is_mul_node(node):
            return f"mul (*) [{name}]"
        return f"torch.{name}"
    elif node.op == "call_method":
        return f".{node.target}()"
    elif node.op == "get_attr":
        return f"getattr({node.target})"
    return str(node.target)


def classify_connection(
    src_node,
    dst_node,
    src_idx: int,
    dst_idx: int,
    dst_inputs: Dict[Any, int],
) -> Tuple[str, str]:
    """
    Classify a connection into:
      - Normal Connection (sequential feed-forward)
      - Skip Connection (e.g. U-Net/DenseNet concat or cross-layer bypass)
      - Residual Connection (additive shortcut into addition)
      - Gated Skip Connection (element-wise multiplication / modulation)
      - Residual Difference (subtractive shortcut)

    Returns:
        (conn_type, description)
    """
    dist = dst_idx - src_idx

    # 1. Output collector node
    if dst_node.op == "output":
        if len(dst_inputs) > 1:
            return "Multi-Output Flow", f"Parallel output channel (distance {dist})"
        return "Normal Connection", "Final model output collection"

    # 2. Residual Addition (+ / torch.add)
    if is_addition_node(dst_node):
        if dist > 1:
            return "Residual Connection", f"Shortcut bypassing {dist - 1} node(s) into addition"
        elif len(dst_inputs) > 1 and any(dst_idx - inp_idx > 1 for inp_idx in dst_inputs.values()):
            return "Normal (Main Branch)", "Main transformation path into residual add"
        else:
            return "Normal Connection", "Direct addition operand"

    # 3. Subtraction (- / torch.sub)
    if is_sub_node(dst_node):
        if dist > 1:
            return "Residual Difference", f"Subtractive shortcut bypassing {dist - 1} node(s)"
        return "Normal Connection", "Direct subtraction operand"

    # 4. Skip Concatenation (torch.cat / torch.stack)
    if is_concat_node(dst_node):
        if dist > 1:
            return "Skip Connection", f"Skip connection bypassing {dist - 1} node(s) into concat"
        else:
            return "Normal Connection", "Main sequential path into concat"

    # 5. Gating / Multiplication (* / torch.mul)
    if is_mul_node(dst_node):
        if dist > 1:
            return "Gated Skip", f"Gating / modulation signal bypassing {dist - 1} node(s)"
        return "Normal Connection", "Direct multiplication operand"

    # 6. General Multi-hop Bypass
    if dist > 1:
        return "Skip Connection", f"Bypass connection across {dist - 1} intermediate node(s)"

    return "Normal Connection", "Direct sequential flow"


def inspect_model_graph(
    model_input: Union[Type[nn.Module], nn.Module],
    *model_args,
    print_output: bool = True,
    **model_kwargs,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Inspects any PyTorch model class (or instance), traces it via PyTorch FX,
    and extracts all nodes and connections (edges), classifying them into:
      - Normal Connections (sequential feed-forward)
      - Skip Connections (e.g. U-Net/DenseNet concatenations across layers)
      - Residual Connections (e.g. ResNet additive shortcuts)
      - Gated Skips (multiplicative modulation / attention)
      - Multi-Output Flows / Dead Nodes

    Args:
        model_input: A PyTorch nn.Module class or instantiated model.
        *model_args: Positional arguments passed to model constructor if a class is provided.
        print_output: Whether to print formatted tables of nodes and connections.
        **model_kwargs: Keyword arguments passed to model constructor if a class is provided.

    Returns:
        A tuple of (nodes, edges):
          - nodes: List of dictionaries describing each node
          - edges: List of dictionaries describing each directed connection
    """
    # 1. Instantiate the model if a class was provided
    if isinstance(model_input, type):
        model = model_input(*model_args, **model_kwargs)
        model_name = model_input.__name__
    elif isinstance(model_input, nn.Module):
        model = model_input
        model_name = model.__class__.__name__
    else:
        raise TypeError(f"Expected nn.Module class or instance, got {type(model_input)}")

    # 2. Trace the model using PyTorch FX
    traced_model = symbolic_trace(model)
    fx_nodes = list(traced_model.graph.nodes)
    node_to_idx = {node: i for i, node in enumerate(fx_nodes)}

    # 3. Extract Nodes
    nodes = []
    for idx, node in enumerate(fx_nodes):
        layer_type = get_layer_type_label(node, traced_model)
        input_names = [inp.name for inp in node.all_input_nodes]
        output_names = [user.name for user in node.users]
        is_dead = (node.op != "output" and len(node.users) == 0)

        nodes.append({
            "index": idx,
            "id": node.name,
            "name": node.name,
            "op": node.op,
            "target": str(node.target),
            "layer_type": layer_type,
            "inputs": input_names,
            "outputs": output_names,
            "is_dead": is_dead,
        })

    # 4. Extract Connections (Edges)
    edges = []
    edge_counter = 1
    for dst_idx, dst_node in enumerate(fx_nodes):
        dst_inputs_map = {inp: node_to_idx[inp] for inp in dst_node.all_input_nodes}

        for src_node in dst_node.all_input_nodes:
            src_idx = node_to_idx[src_node]
            dist = dst_idx - src_idx
            conn_type, description = classify_connection(
                src_node=src_node,
                dst_node=dst_node,
                src_idx=src_idx,
                dst_idx=dst_idx,
                dst_inputs=dst_inputs_map,
            )

            edges.append({
                "edge_id": edge_counter,
                "id": f"{src_node.name}->{dst_node.name}",
                "from": src_node.name,
                "to": dst_node.name,
                "type": conn_type,
                "distance": dist,
                "is_skip": "Skip" in conn_type,
                "is_residual": "Residual" in conn_type,
                "description": description,
            })
            edge_counter += 1

    # 5. Formatted display
    if print_output:
        print("=" * 105)
        print(f" MODEL: {model_name} | FX GRAPH ANALYSIS")
        print("=" * 105)

        # Print Nodes Table
        print(f"\n[+] GRAPH NODES (Total: {len(nodes)})")
        print(f"{'Idx':<4} | {'Node Name':<16} | {'Op Type':<14} | {'Layer / Target':<24} | {'Inputs':<25} | {'Status'}")
        print("-" * 105)
        for n in nodes:
            inputs_str = ", ".join(n["inputs"]) if n["inputs"] else "(None - Input)"
            status_str = "DEAD NODE (Unused)" if n["is_dead"] else "Active"
            print(f"{n['index']:<4} | {n['name']:<16} | {n['op']:<14} | {n['layer_type']:<24} | {inputs_str:<25} | {status_str}")

        # Print Edges Table
        print(f"\n[+] GRAPH CONNECTIONS / EDGES (Total: {len(edges)})")
        print(f"{'#':<3} | {'From':<14} | {'To':<14} | {'Connection Type':<25} | {'Dist':<4} | {'Description'}")
        print("-" * 105)
        for e in edges:
            print(f"{e['edge_id']:<3} | {e['from']:<14} | {e['to']:<14} | {e['type']:<25} | {e['distance']:<4} | {e['description']}")

        # Summary Breakdown
        normal_cnt = sum(1 for e in edges if "Normal" in e["type"])
        skip_cnt = sum(1 for e in edges if e["is_skip"])
        residual_cnt = sum(1 for e in edges if e["is_residual"])
        multi_out_cnt = sum(1 for e in edges if "Multi-Output" in e["type"])
        dead_cnt = sum(1 for n in nodes if n["is_dead"])

        print("-" * 105)
        print("SUMMARY:")
        print(f"  - Total Nodes:                {len(nodes)}")
        print(f"  - Total Connections:          {len(edges)}")
        print(f"  - Normal Connections:         {normal_cnt}")
        print(f"  - Skip Connections:           {skip_cnt}")
        print(f"  - Residual Connections:       {residual_cnt}")
        if multi_out_cnt > 0:
            print(f"  - Multi-Output Flows:         {multi_out_cnt}")
        if dead_cnt > 0:
            print(f"  - Dead (Unused) Nodes:        {dead_cnt}")
        print("=" * 105 + "\n")

    return nodes, edges


# =====================================================================
# Super Weird & Complex Model Architectures for Testing
# =====================================================================

# Weird Model 1: Multi-Input, Multi-Output with Gating and Cross-Connections
class WeirdMultiInputMultiOutput(nn.Module):
    """
    Features:
      - 2 input tensors (x, y)
      - Self-reuse operand (x + x)
      - Cross-input residual addition (h1 + y_feat)
      - Gated multiplicative modulation (res1 * sigmoid(gate))
      - Multi-source concat merging 3 different branches
      - 2 parallel output returns (out1, out2)
    """
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 16, 3, padding=1)
        self.conv_y = nn.Conv2d(3, 16, 1)
        self.gate_conv = nn.Conv2d(16, 16, 1)
        self.out_conv = nn.Conv2d(48, 8, 1)

    def forward(self, x, y):
        x_doubled = x + x                         # Self-reuse of x
        h1 = torch.relu(self.conv1(x_doubled))

        y_feat = self.conv_y(y)
        res1 = h1 + y_feat                        # Cross-input addition

        gate = torch.sigmoid(self.gate_conv(res1))
        gated = res1 * gate                       # Multiplicative gating skip

        # Wide concat of 3 paths at different depths
        merged = torch.cat([gated, h1, y_feat], dim=1)
        out1 = self.out_conv(merged)

        # Second parallel output with residual sum
        out2 = res1 + gated
        return out1, out2


# Weird Model 2: HyperDenseBlock (Complete DAG of Skip Connections)
class HyperDenseSpiderweb(nn.Module):
    """
    Features:
      - Every single layer concatenates ALL preceding layers!
      - Rapidly expanding dense web of skip connections.
    """
    def __init__(self, in_c=8, growth=4):
        super().__init__()
        self.conv1 = nn.Conv2d(in_c, growth, 3, padding=1)
        self.conv2 = nn.Conv2d(in_c + growth, growth, 3, padding=1)
        self.conv3 = nn.Conv2d(in_c + 2 * growth, growth, 3, padding=1)
        self.out_conv = nn.Conv2d(in_c + 3 * growth, 8, 1)

    def forward(self, x):
        l1 = torch.relu(self.conv1(x))
        c1 = torch.cat([x, l1], dim=1)                 # 1 skip

        l2 = torch.relu(self.conv2(c1))
        c2 = torch.cat([x, l1, l2], dim=1)             # 2 skips

        l3 = torch.relu(self.conv3(c2))
        c3 = torch.cat([x, l1, l2, l3], dim=1)         # 3 skips

        return self.out_conv(c3)


# Weird Model 3: Nested Residuals + Projection Shortcut + Long-Range Residual
class NestedResidualAndProjection(nn.Module):
    """
    Features:
      - Inner residual block: conv -> bn -> add(shortcut)
      - Projection residual block: 1x1 conv downsample shortcut
      - Outer multi-hop residual spanning across both inner blocks
    """
    def __init__(self):
        super().__init__()
        # Inner block 1
        self.c1 = nn.Conv2d(16, 16, 3, padding=1)
        self.c2 = nn.Conv2d(16, 16, 3, padding=1)
        # Inner block 2 with projection shortcut
        self.c3 = nn.Conv2d(16, 32, 3, padding=1)
        self.c4 = nn.Conv2d(32, 32, 3, padding=1)
        self.proj = nn.Conv2d(16, 32, 1)
        # Long-range projection shortcut
        self.long_proj = nn.Conv2d(16, 32, 1)

    def forward(self, x):
        # Long-range outer shortcut
        long_res = self.long_proj(x)

        # Block 1 (identity residual)
        h1 = torch.relu(self.c1(x))
        h2 = self.c2(h1)
        res1 = h2 + x                             # Inner identity residual

        # Block 2 (projection residual)
        proj_res = self.proj(res1)
        h3 = torch.relu(self.c3(res1))
        h4 = self.c4(h3)
        res2 = h4 + proj_res                      # Inner projection residual

        # Outer residual sum combining Block 2 output + long-range shortcut
        total = res2 + long_res                   # Long-range outer residual
        return total


# Weird Model 4: Weight Sharing (Module Reuse) + Dead-End Unused Branch
class SharedWeightAndDeadBranch(nn.Module):
    """
    Features:
      - Module reuse: self.reused_conv is called 3 times in a row!
      - Dead-end branch: self.dead_conv is computed but NEVER used in output!
      - Tensor method call: x.add(shortcut)
    """
    def __init__(self):
        super().__init__()
        self.dead_conv = nn.Conv2d(16, 16, 3, padding=1)
        self.reused_conv = nn.Conv2d(16, 16, 3, padding=1)
        self.out_conv = nn.Conv2d(16, 8, 1)

    def forward(self, x):
        # Dead-end computation! (Never consumed by output)
        dead_val = torch.relu(self.dead_conv(x))

        # Weight sharing: calling the same Conv2d module multiple times
        step1 = torch.relu(self.reused_conv(x))
        step2 = torch.relu(self.reused_conv(step1))
        step3 = torch.relu(self.reused_conv(step2))

        # Recombining step3 with step1 via method call .add()
        merged = step3.add(step1)
        return self.out_conv(merged)


# =====================================================================
# Main Execution: Running All Weird Models
# =====================================================================
import json
import os

def get_module_params(module):
    import torch.nn as nn
    params = {}
    if isinstance(module, nn.Linear):
        params = {'in_features': module.in_features, 'out_features': module.out_features, 'bias': module.bias is not None}
    elif isinstance(module, nn.Conv2d):
        params = {'in_channels': module.in_channels, 'out_channels': module.out_channels, 'kernel_size': module.kernel_size[0] if isinstance(module.kernel_size, tuple) else module.kernel_size, 'stride': module.stride[0] if isinstance(module.stride, tuple) else module.stride, 'padding': module.padding[0] if isinstance(module.padding, tuple) else module.padding, 'bias': module.bias is not None}
    elif isinstance(module, nn.ConvTranspose2d):
        params = {'in_channels': module.in_channels, 'out_channels': module.out_channels, 'kernel_size': module.kernel_size[0] if isinstance(module.kernel_size, tuple) else module.kernel_size, 'stride': module.stride[0] if isinstance(module.stride, tuple) else module.stride, 'padding': module.padding[0] if isinstance(module.padding, tuple) else module.padding, 'output_padding': module.output_padding[0] if isinstance(module.output_padding, tuple) else module.output_padding, 'bias': module.bias is not None}
    elif isinstance(module, nn.ReLU):
        params = {'inplace': module.inplace}
    elif isinstance(module, nn.MaxPool2d):
        params = {'kernel_size': module.kernel_size, 'stride': module.stride, 'padding': module.padding}
    elif isinstance(module, nn.Dropout):
        params = {'p': module.p}
    elif isinstance(module, nn.BatchNorm2d):
        params = {'num_features': module.num_features, 'eps': module.eps}
    elif isinstance(module, nn.LayerNorm):
        params = {'normalized_shape': module.normalized_shape[0] if isinstance(module.normalized_shape, tuple) else module.normalized_shape, 'eps': module.eps}
    elif isinstance(module, nn.LSTM):
        params = {'input_size': module.input_size, 'hidden_size': module.hidden_size, 'num_layers': module.num_layers, 'batch_first': module.batch_first}
    elif isinstance(module, nn.Embedding):
        params = {'num_embeddings': module.num_embeddings, 'embedding_dim': module.embedding_dim}
    elif isinstance(module, nn.MultiheadAttention):
        params = {'embed_dim': module.embed_dim, 'num_heads': module.num_heads, 'dropout': module.dropout}
    elif isinstance(module, nn.Transformer):
        params = {'d_model': module.d_model, 'nhead': module.nhead, 'num_encoder_layers': module.encoder.num_layers, 'num_decoder_layers': module.decoder.num_layers, 'dim_feedforward': module.encoder.layers[0].linear1.out_features if module.encoder.num_layers > 0 else 2048, 'dropout': module.encoder.layers[0].dropout.p if module.encoder.num_layers > 0 else 0.1, 'activation': 'relu', 'custom_encoder': None, 'custom_decoder': None, 'layer_norm_eps': module.encoder.layers[0].norm1.eps if module.encoder.num_layers > 0 else 1e-5, 'batch_first': module.batch_first, 'norm_first': module.encoder.layers[0].norm_first if module.encoder.num_layers > 0 else False}
    return params


def arg_to_str(arg):
    import torch
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
    args_str = ", ".join(arg_to_str(a) for a in node.args)
    kwargs_str = ", ".join(f"{k}={arg_to_str(v)}" for k, v in node.kwargs.items())
    if args_str and kwargs_str:
        return args_str + ", " + kwargs_str
    return args_str or kwargs_str


def model_to_json_graph(model_input):
    if isinstance(model_input, type):
        model_name = getattr(model_input, '__name__', 'Model')
        model = model_input()
    else:
        model_name = getattr(model_input.__class__, '__name__', 'Model')
        model = model_input
        
    from torch.fx import Tracer
    class NodeTracer(Tracer):
        def is_leaf_module(self, m, module_qualified_name):
            import torch.nn as nn
            if isinstance(m, (nn.Transformer, nn.TransformerEncoder, nn.TransformerDecoder, nn.TransformerEncoderLayer, nn.TransformerDecoderLayer)):
                return True
            return super().is_leaf_module(m, module_qualified_name)
            
    tracer = NodeTracer()
    graph = tracer.trace(model)
    from torch.fx import GraphModule
    traced_model = GraphModule(tracer.root, graph)
    
    nodes_out = []
    
    def _find_modules_path():
        curr = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.join(curr, '..', '..', 'data', 'modules.json'),
            os.path.join(curr, '..', '..', 'static', 'data', 'modules.json'),
            os.path.join(curr, '..', '..', '..', 'src', 'data', 'modules.json'),
            os.path.join(curr, '..', '..', '..', 'src', 'static', 'data', 'modules.json'),
            os.path.join(os.getcwd(), 'src', 'data', 'modules.json'),
            os.path.join(os.getcwd(), 'src', 'static', 'data', 'modules.json'),
            os.path.join(os.getcwd(), 'data', 'modules.json'),
        ]
        for c in candidates:
            norm = os.path.normpath(c)
            if os.path.exists(norm):
                return norm
        return None

    modules_file = _find_modules_path()
    module_templates = {}
    if modules_file:
        try:
            with open(modules_file, 'r', encoding='utf-8') as f:
                modules_data = json.load(f)
            module_templates = {m['type']: m for m in modules_data}
        except Exception:
            module_templates = {}
    
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


def canvas_to_json_graph(canvas_data):
    """
    Converts visual canvas graph data ({projectId, name, nodes, edges})
    into structured FX-style computational graph JSON.
    """
    if isinstance(canvas_data, str):
        data = json.loads(canvas_data)
    else:
        data = canvas_data

    curr_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(curr_dir, '..', '..', 'data', 'modules.json'),
        os.path.join(curr_dir, '..', '..', 'static', 'data', 'modules.json'),
        os.path.join(curr_dir, '..', '..', '..', 'src', 'data', 'modules.json'),
        os.path.join(curr_dir, '..', '..', '..', 'src', 'static', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'src', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'src', 'static', 'data', 'modules.json'),
        os.path.join(os.getcwd(), 'data', 'modules.json'),
    ]
    modules_map = {}
    for c in candidates:
        norm = os.path.normpath(c)
        if os.path.exists(norm):
            try:
                with open(norm, 'r', encoding='utf-8') as f:
                    mods = json.load(f)
                    modules_map = {m['type']: m for m in mods}
                    break
            except Exception:
                pass

    nodes = data.get('nodes', [])
    edges = data.get('edges', [])
    raw_name = data.get('name', 'Untitled_Model').strip() or 'Untitled_Model'
    model_name = fix_model_name(raw_name)

    if not nodes:
        return json.dumps({
            'metadata': {'device': 'cpu', 'name': model_name, 'projectId': data.get('projectId', '')},
            'nodes': [
                {'id': 'x', 'op': 'placeholder', 'inputs': [], 'args_str': '', 'params': {}, 'type': 'input'},
                {'id': 'output', 'op': 'output', 'inputs': ['x'], 'args_str': 'x', 'params': {}, 'type': 'output'}
            ],
            'canvas': data
        }, indent=2)

    node_map = {str(n['id']): n for n in nodes}
    succ = {str(n['id']): [] for n in nodes}
    pred = {str(n['id']): [] for n in nodes}
    in_degree = {str(n['id']): 0 for n in nodes}

    for e in edges:
        u = str(e.get('from', ''))
        v = str(e.get('to', ''))
        if u in node_map and v in node_map and u != v:
            if v not in succ[u]:
                succ[u].append(v)
            if u not in pred[v]:
                pred[v].append(u)
                in_degree[v] += 1

    # If no edges exist and multiple nodes, chain them in spatial layout order (left-to-right)
    if len(edges) == 0 and len(nodes) > 1:
        spatial_nodes = sorted(nodes, key=lambda n: (n.get('x', 0), n.get('y', 0)))
        topo_order = [str(n['id']) for n in spatial_nodes]
        for i in range(len(topo_order) - 1):
            curr_id = topo_order[i]
            next_id = topo_order[i + 1]
            succ[curr_id].append(next_id)
            pred[next_id].append(curr_id)
    else:
        roots = [nid for nid, deg in in_degree.items() if deg == 0]
        roots.sort(key=lambda nid: (node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
        queue = list(roots)
        topo_order = []
        deg_copy = dict(in_degree)
        while queue:
            queue.sort(key=lambda nid: (node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
            curr = queue.pop(0)
            topo_order.append(curr)
            for nxt in succ[curr]:
                deg_copy[nxt] -= 1
                if deg_copy[nxt] == 0:
                    queue.append(nxt)

        if len(topo_order) < len(nodes):
            remaining = [str(n['id']) for n in nodes if str(n['id']) not in topo_order]
            remaining.sort(key=lambda nid: (node_map[nid].get('x', 0), node_map[nid].get('y', 0)))
            topo_order.extend(remaining)

    fx_nodes = []
    root_nodes = [nid for nid in topo_order if len(pred[nid]) == 0]
    input_var_names = {}

    if len(root_nodes) <= 1:
        fx_nodes.append({
            'id': 'x',
            'op': 'placeholder',
            'inputs': [],
            'args_str': '',
            'params': {},
            'type': 'input'
        })
    else:
        for idx, r_id in enumerate(root_nodes):
            inp_name = f'x{idx + 1}'
            fx_nodes.append({
                'id': inp_name,
                'op': 'placeholder',
                'inputs': [],
                'args_str': '',
                'params': {},
                'type': 'input'
            })
            input_var_names[r_id] = inp_name

    var_names = {}
    used_targets = set()

    for nid in topo_order:
        node = node_map[nid]
        layer_type = node.get('layerType', 'nn.Identity')
        params = node.get('params', {}) or {}

        clean_type = layer_type.replace('nn.', '').replace('.', '_').lower()
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
        var_names[nid] = target

        preds = pred[nid]
        if not preds:
            if len(root_nodes) <= 1:
                args_str = 'x'
                inps = ['x']
            else:
                inp_name = input_var_names.get(nid, 'x1')
                args_str = inp_name
                inps = [inp_name]
        else:
            inps = [var_names[p] for p in preds if p in var_names]
            label_lower = (node.get('label', '') or '').lower()
            type_lower = layer_type.lower()
            if len(inps) == 1:
                if 'flatten' in type_lower:
                    args_str = f"{inps[0]}, 1"
                else:
                    args_str = inps[0]
            elif 'add' in type_lower or 'add' in label_lower or 'residual' in label_lower:
                args_str = f"{inps[0]}, {inps[1]}" if len(inps) >= 2 else inps[0]
            elif 'attention' in type_lower or 'multihead' in type_lower:
                if len(inps) >= 3:
                    args_str = f"{inps[0]}, {inps[1]}, {inps[2]}"
                else:
                    args_str = f"{inps[0]}, {inps[0]}, {inps[0]}"
            else:
                # Multiple incoming edges into module: concatenate along channel dimension
                args_str = f"torch.cat([{', '.join(inps)}], dim=1)"

        mod_def = modules_map.get(layer_type, {})
        code_template = mod_def.get('code', '')
        defaults = {}
        if 'fields' in mod_def:
            for f in mod_def['fields']:
                if 'default' in f:
                    defaults[f['key']] = f['default']
        merged_params = {**defaults, **params}

        if not code_template:
            if 'customArgs' in params and params['customArgs']:
                code_template = f"{layer_type}({params['customArgs']})"
            else:
                args_parts = [f"{k}={repr(v)}" for k, v in merged_params.items() if k != 'customArgs']
                code_template = f"{layer_type}({', '.join(args_parts)})"

        fx_nodes.append({
            'id': target,
            'op': 'call_module',
            'target': target,
            'type': layer_type,
            'inputs': inps,
            'args_str': args_str,
            'params': merged_params,
            'codeTemplate': code_template
        })

    leaf_nodes = [nid for nid in topo_order if len(succ[nid]) == 0]
    if not leaf_nodes and topo_order:
        leaf_nodes = [topo_order[-1]]

    out_vars = [var_names[nid] for nid in leaf_nodes if nid in var_names]
    if not out_vars and fx_nodes:
        out_vars = [fx_nodes[-1]['id']]

    fx_nodes.append({
        'id': 'output',
        'op': 'output',
        'inputs': out_vars,
        'args_str': ', '.join(out_vars),
        'params': {},
        'type': 'output'
    })

    return json.dumps({
        'metadata': {
            'device': 'cpu',
            'name': model_name,
            'projectId': data.get('projectId', '')
        },
        'nodes': fx_nodes,
        'canvas': data
    }, indent=2)


def generate_code_from_canvas(canvas_data):
    """Generates PyTorch model code directly from canvas graph data."""
    json_graph_str = canvas_to_json_graph(canvas_data)
    return generate_code_from_json(json_graph_str)


def fix_model_name(name: str) -> str:
    """
    Validates and fixes an invalid model name:
    - If the model name has space, replace space with _
    - If the model name has number before the text, add the word model_ infront of it
    """
    if not name or not name.strip():
        return "model"
    name = name.strip()

    # If the model name has space, replace space with _
    if ' ' in name:
        name = name.replace(' ', '_')

    # If the model name has number before the text
    has_num_before = False
    for ch in name:
        if ch.isdigit():
            has_num_before = True
            break
        if ch.isalpha():
            break

    if has_num_before:
        name = f"model_{name}"

    # Ensure valid characters for python identifier / folder name
    import re
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    if not name:
        return "model"
    if not name[0].isalpha():
        name = f"model_{name.lstrip('_')}"
        if name == "model_":
            name = "model"
    return name


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
    if class_name != 'GeneratedModel':
        code += f"\n\n# Alias for backwards compatibility\nGeneratedModel = {class_name}\n"
    return code

if __name__ == "__main__":
    import sys
    import argparse

    parser = argparse.ArgumentParser(description="Ein Theater PyTorch Model Generator & Tracer")
    parser.add_argument("--save-canvas", help="Path to JSON file containing canvas graph data to save")
    parser.add_argument("--canvas-json", help="Direct JSON string of canvas graph data")
    parser.add_argument("--out-dir", help="Target directory where model_name/ folder will be saved", default=None)
    parser.add_argument("--test", action="store_true", help="Run weird models test suite")

    args, unknown = parser.parse_known_args()

    if args.save_canvas or args.canvas_json:
        if args.save_canvas:
            if args.save_canvas == '-':
                canvas_data = json.loads(sys.stdin.read())
            else:
                with open(args.save_canvas, 'r', encoding='utf-8') as f:
                    canvas_data = json.load(f)
        else:
            canvas_data = json.loads(args.canvas_json)

        res = save_model_to_folder(canvas_data, output_dir=args.out_dir)
        print(json.dumps(res))
        sys.exit(0)
    else:
        weird_models = [
            ("Weird Model 1: Multi-Input, Multi-Output, Gating & Cross-Addition", WeirdMultiInputMultiOutput),
            ("Weird Model 2: HyperDenseSpiderweb (Quadratic Skip DAG)", HyperDenseSpiderweb),
            ("Weird Model 3: Nested Residuals + Projection + Long-Range Shortcut", NestedResidualAndProjection),
            ("Weird Model 4: Shared Weights + Dead Branch + Tensor Method .add()", SharedWeightAndDeadBranch),
        ]

        for title, model_cls in weird_models:
            print(f"\n>>>> EXECUTING: {title}")
            inspect_model_graph(model_cls)