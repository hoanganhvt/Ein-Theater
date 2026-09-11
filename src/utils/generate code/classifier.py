import os
import sys
import operator
from typing import Union, Type, List, Dict, Tuple, Any
import torch
import torch.nn as nn
from torch.fx import symbolic_trace

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)


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
