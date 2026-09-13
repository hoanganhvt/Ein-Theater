"""
Padding Solver Module for Residual and Skip Connections.

Solves for exact convolution padding and output_padding required to reconcile
spatial dimension mismatches across branching/residual connections (ResNet, U-Net).
"""

import math
from typing import Dict, Any, Tuple, Optional, List


def to_tuple_2d(val: Any) -> Tuple[int, int]:
    """Normalizes a dimension parameter (int, list, tuple) to a 2-element tuple."""
    if isinstance(val, (list, tuple)):
        if len(val) >= 2:
            return (int(val[0]), int(val[1]))
        elif len(val) == 1:
            return (int(val[0]), int(val[0]))
    try:
        v = int(val)
        return (v, v)
    except (ValueError, TypeError):
        return (1, 1)


def ensure_min_padding(dim_in: int, k: int, s: int, d: int, curr_p: int) -> int:
    """
    Ensures padding is sufficient so that the spatial output dimension is >= 1.
    Formula: dim_in + 2p - d(k - 1) - 1 >= 0  =>  2p >= d(k - 1) + 1 - dim_in
    """
    min_required = d * (k - 1) + 1 - dim_in
    if min_required > 0:
        needed_p = math.ceil(min_required / 2)
        if needed_p > curr_p:
            return needed_p
    return curr_p


def find_upstream_conv_node(
    start_node_id: str,
    node_map: Dict[str, Dict[str, Any]]
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Traces upstream from start_node_id through shape-preserving operations
    (activations, normalizations, dropouts, identities) to find the producing Conv2d
    or ConvTranspose2d node.

    Returns:
        Tuple of (target_conv_node, path_nodes_traversed).
    """
    path_nodes: List[Dict[str, Any]] = []
    curr_id: Optional[str] = start_node_id
    visited = set()

    shape_preserving_types = {
        'nn.ReLU', 'ReLU', 'nn.LeakyReLU', 'LeakyReLU',
        'nn.GELU', 'GELU', 'nn.Sigmoid', 'Sigmoid', 'nn.Tanh', 'Tanh',
        'nn.BatchNorm2d', 'BatchNorm2d', 'nn.InstanceNorm2d', 'InstanceNorm2d',
        'nn.Dropout', 'Dropout', 'nn.Dropout2d', 'Dropout2d',
        'nn.Identity', 'Identity'
    }

    while curr_id and curr_id in node_map and curr_id not in visited:
        visited.add(curr_id)
        node = node_map[curr_id]
        ntype = node.get('type', '')
        op = node.get('op', '')

        if ntype in ('nn.Conv2d', 'Conv2d', 'nn.ConvTranspose2d', 'ConvTranspose2d'):
            return node, path_nodes

        if ntype in shape_preserving_types or op in ('assign', 'call_function', 'accumulate'):
            path_nodes.append(node)
            inputs = node.get('inputs', [])
            curr_id = inputs[0] if inputs else None
        else:
            break

    return None, []


def try_resolve_spatial_padding(
    target_spatial: Tuple[int, int],
    source_node_id: str,
    consumer_node_id: str,
    node_map: Dict[str, Dict[str, Any]],
    shapes: Dict[str, List[int]],
    context: str = "Operation"
) -> Tuple[bool, Optional[str]]:
    """
    Attempts to solve for and apply the required padding on an upstream convolution layer
    to match target_spatial dimensions (H_target, W_target).

    Args:
        target_spatial: Desired (height, width).
        source_node_id: Node providing the mismatched tensor.
        consumer_node_id: Node consuming the tensor (e.g. Add, Concat).
        node_map: Dictionary of all graph nodes by ID.
        shapes: Current dictionary of known node output shapes.
        context: Context string for logging (e.g. 'Add', 'Concat').

    Returns:
        Tuple of (success_flag, log_message).
    """
    src_node, path_nodes = find_upstream_conv_node(source_node_id, node_map)
    if not src_node:
        return False, None

    actual_src_id = src_node['id']
    src_type = src_node.get('type', '')
    params = src_node.setdefault('params', {})

    k = to_tuple_2d(params.get('kernel_size', 3))
    s = to_tuple_2d(params.get('stride', 1))
    d = to_tuple_2d(params.get('dilation', 1))
    curr_p = to_tuple_2d(params.get('padding', 0))

    # Retrieve input tensor shape to this conv
    conv_inputs = src_node.get('inputs', [])
    if not conv_inputs or conv_inputs[0] not in shapes:
        return False, None

    in_shape = shapes[conv_inputs[0]]
    if len(in_shape) != 4:
        return False, None

    h_in, w_in = in_shape[2], in_shape[3]
    h_target, w_target = target_spatial

    # Case A: Standard 2D Convolution
    if src_type in ('nn.Conv2d', 'Conv2d'):
        # Equation:
        # H_target = floor((H_in + 2p - d(k - 1) - 1) / s) + 1
        # => s * (H_target - 1) = H_in + 2p - d(k - 1) - 1
        # => 2p = s * (H_target - 1) + d(k - 1) + 1 - H_in
        two_p_h = s[0] * (h_target - 1) + d[0] * (k[0] - 1) + 1 - h_in
        two_p_w = s[1] * (w_target - 1) + d[1] * (k[1] - 1) + 1 - w_in

        if two_p_h < 0 or two_p_w < 0:
            return False, None

        # Symmetric integer padding requires two_p to be even
        if two_p_h % 2 != 0 or two_p_w % 2 != 0:
            return False, None

        req_p_h = two_p_h // 2
        req_p_w = two_p_w // 2

        # Verify that output spatial dimensions strictly match target
        calc_h = math.floor((h_in + 2 * req_p_h - d[0] * (k[0] - 1) - 1) / s[0]) + 1
        calc_w = math.floor((w_in + 2 * req_p_w - d[1] * (k[1] - 1) - 1) / s[1]) + 1

        if (calc_h, calc_w) != (h_target, w_target):
            return False, None

        # Apply padding adjustment
        new_padding = req_p_h if req_p_h == req_p_w else [req_p_h, req_p_w]
        params['padding'] = new_padding

        # Update shapes along the path
        out_c = params.get('out_channels', 64)
        new_shape = [in_shape[0], out_c, h_target, w_target]
        shapes[actual_src_id] = list(new_shape)
        for pn in path_nodes:
            shapes[pn['id']] = list(new_shape)

        msg = (
            f"Node '{actual_src_id}' (nn.Conv2d): adjusted padding {curr_p} -> {new_padding} "
            f"to match target spatial dimensions ({h_target}, {w_target}) for {context} at node '{consumer_node_id}'."
        )
        return True, msg

    # Case B: Transposed 2D Convolution (ConvTranspose2d)
    elif src_type in ('nn.ConvTranspose2d', 'ConvTranspose2d'):
        # Equation:
        # H_out = (H_in - 1) * s - 2p + d(k - 1) + out_p + 1
        # => 2p - out_p = (H_in - 1) * s + d(k - 1) + 1 - H_target
        diff_h = (h_in - 1) * s[0] + d[0] * (k[0] - 1) + 1 - h_target
        diff_w = (w_in - 1) * s[1] + d[1] * (k[1] - 1) + 1 - w_target

        req_p_h, req_out_p_h = None, None
        if diff_h <= 0 and -diff_h < s[0]:
            req_p_h = 0
            req_out_p_h = -diff_h
        elif diff_h > 0 and diff_h % 2 == 0:
            req_p_h = diff_h // 2
            req_out_p_h = 0

        req_p_w, req_out_p_w = None, None
        if diff_w <= 0 and -diff_w < s[1]:
            req_p_w = 0
            req_out_p_w = -diff_w
        elif diff_w > 0 and diff_w % 2 == 0:
            req_p_w = diff_w // 2
            req_out_p_w = 0

        if req_p_h is not None and req_p_w is not None:
            params['padding'] = req_p_h if req_p_h == req_p_w else [req_p_h, req_p_w]
            params['output_padding'] = req_out_p_h if req_out_p_h == req_out_p_w else [req_out_p_h, req_out_p_w]

            out_c = params.get('out_channels', 32)
            new_shape = [in_shape[0], out_c, h_target, w_target]
            shapes[actual_src_id] = list(new_shape)
            for pn in path_nodes:
                shapes[pn['id']] = list(new_shape)

            msg = (
                f"Node '{actual_src_id}' (nn.ConvTranspose2d): adjusted padding to {params['padding']} "
                f"and output_padding to {params['output_padding']} to match target spatial dimensions "
                f"({h_target}, {w_target}) for {context} at node '{consumer_node_id}'."
            )
            return True, msg

    return False, None
