"""
Layer Dimension Fitting & Shape Computation Module.

Contains dedicated handlers for calculating output shapes and adapting parameters
across dense, convolutional, recurrent, attention, normalization, and tensor transform blocks.
"""

import math
from typing import Dict, Any, List, Tuple
from padding_solver import to_tuple_2d, ensure_min_padding


def fit_linear(node: Dict[str, Any], in_shape: List[int]) -> Tuple[List[int], List[str]]:
    """
    Fits nn.Linear: in_features matches the last dimension of input tensor.
    Output shape: (*in_shape[:-1], out_features).
    """
    nid = node['id']
    params = node.setdefault('params', {})
    adjustments = []

    expected_in = in_shape[-1]
    current_in = params.get('in_features')

    if current_in != expected_in:
        params['in_features'] = expected_in
        adjustments.append(
            f"Node '{nid}' (nn.Linear): adjusted in_features {current_in} -> {expected_in} to match input shape {in_shape}."
        )

    out_features = params.get('out_features', 64)
    out_shape = list(in_shape[:-1]) + [out_features]
    return out_shape, adjustments


def fit_conv2d(
    node: Dict[str, Any],
    in_shape: List[int]
) -> Tuple[List[int], List[str], List[str], List[str]]:
    """
    Fits nn.Conv2d: in_channels matches input channel dimension.
    Verifies and calculates spatial dimensions, auto-adjusting padding if dim would collapse.

    Returns:
        Tuple of (out_shape, adjustments, padding_adjustments, warnings).
    """
    nid = node['id']
    params = node.setdefault('params', {})
    adjustments, pad_adjustments, warnings = [], [], []

    if len(in_shape) != 4:
        warnings.append(
            f"Node '{nid}' (nn.Conv2d) expects a 4D tensor (B, C, H, W), but received {len(in_shape)}D tensor {in_shape}. Please adapt upstream layers or reshape."
        )
        return list(in_shape), adjustments, pad_adjustments, warnings

    expected_c = in_shape[1]
    current_c = params.get('in_channels')
    if current_c != expected_c:
        params['in_channels'] = expected_c
        adjustments.append(
            f"Node '{nid}' (nn.Conv2d): adjusted in_channels {current_c} -> {expected_c} to match input channels {expected_c}."
        )

    out_c = params.get('out_channels', 64)
    k = to_tuple_2d(params.get('kernel_size', 3))
    s = to_tuple_2d(params.get('stride', 1))
    p = to_tuple_2d(params.get('padding', 0))
    d = to_tuple_2d(params.get('dilation', 1))

    h_in, w_in = in_shape[2], in_shape[3]

    # Check for spatial dimension collapse and resolve minimum required padding
    p_h = ensure_min_padding(h_in, k[0], s[0], d[0], p[0])
    p_w = ensure_min_padding(w_in, k[1], s[1], d[1], p[1])

    if (p_h, p_w) != p:
        new_padding = p_h if p_h == p_w else [p_h, p_w]
        params['padding'] = new_padding
        pad_adjustments.append(
            f"Node '{nid}' (nn.Conv2d): updated padding {p} -> {new_padding} to prevent spatial collapse on input ({h_in}, {w_in})."
        )
        p = (p_h, p_w)

    h_out = math.floor((h_in + 2 * p[0] - d[0] * (k[0] - 1) - 1) / s[0]) + 1
    w_out = math.floor((w_in + 2 * p[1] - d[1] * (k[1] - 1) - 1) / s[1]) + 1

    if h_out <= 0 or w_out <= 0:
        warnings.append(
            f"Node '{nid}' (nn.Conv2d) output spatial dimensions ({h_out}, {w_out}) invalid on input ({h_in}, {w_in}). Please adjust kernel_size, stride, or padding manually."
        )

    out_shape = [in_shape[0], out_c, h_out, w_out]
    return out_shape, adjustments, pad_adjustments, warnings


def fit_conv_transpose2d(
    node: Dict[str, Any],
    in_shape: List[int]
) -> Tuple[List[int], List[str], List[str]]:
    """
    Fits nn.ConvTranspose2d: in_channels matches input channels.
    Calculates upsampled spatial dimensions.
    """
    nid = node['id']
    params = node.setdefault('params', {})
    adjustments, warnings = [], []

    if len(in_shape) != 4:
        warnings.append(f"Node '{nid}' (nn.ConvTranspose2d) expects a 4D tensor, but received {in_shape}.")
        return list(in_shape), adjustments, warnings

    expected_c = in_shape[1]
    current_c = params.get('in_channels')
    if current_c != expected_c:
        params['in_channels'] = expected_c
        adjustments.append(f"Node '{nid}' (nn.ConvTranspose2d): adjusted in_channels {current_c} -> {expected_c}.")

    out_c = params.get('out_channels', 32)
    k = to_tuple_2d(params.get('kernel_size', 2))
    s = to_tuple_2d(params.get('stride', 2))
    p = to_tuple_2d(params.get('padding', 0))
    out_p = to_tuple_2d(params.get('output_padding', 0))
    d = to_tuple_2d(params.get('dilation', 1))

    h_in, w_in = in_shape[2], in_shape[3]
    h_out = (h_in - 1) * s[0] - 2 * p[0] + d[0] * (k[0] - 1) + out_p[0] + 1
    w_out = (w_in - 1) * s[1] - 2 * p[1] + d[1] * (k[1] - 1) + out_p[1] + 1

    out_shape = [in_shape[0], out_c, h_out, w_out]
    return out_shape, adjustments, warnings


def fit_conv1d(
    node: Dict[str, Any],
    in_shape: List[int]
) -> Tuple[List[int], List[str], List[str]]:
    """Fits nn.Conv1d: in_channels matches input channel dimension."""
    nid = node['id']
    params = node.setdefault('params', {})
    adjustments, warnings = [], []

    if len(in_shape) != 3:
        warnings.append(f"Node '{nid}' (nn.Conv1d) expects a 3D tensor (B, C, L), but received {len(in_shape)}D tensor {in_shape}.")
        return list(in_shape), adjustments, warnings

    expected_c = in_shape[1]
    current_c = params.get('in_channels')
    if current_c != expected_c:
        params['in_channels'] = expected_c
        adjustments.append(f"Node '{nid}' (nn.Conv1d): adjusted in_channels {current_c} -> {expected_c}.")

    out_c = params.get('out_channels', 64)
    k = int(params.get('kernel_size', 3))
    s = int(params.get('stride', 1))
    p = int(params.get('padding', 0))
    d = int(params.get('dilation', 1))

    l_in = in_shape[2]
    p = ensure_min_padding(l_in, k, s, d, p)
    params['padding'] = p

    l_out = math.floor((l_in + 2 * p - d * (k - 1) - 1) / s) + 1
    out_shape = [in_shape[0], out_c, l_out]
    return out_shape, adjustments, warnings


def fit_pooling(node: Dict[str, Any], in_shape: List[int]) -> List[int]:
    """Computes output shape for MaxPool2d and AvgPool2d."""
    params = node.get('params', {})
    k = to_tuple_2d(params.get('kernel_size', 2))
    s = to_tuple_2d(params.get('stride', params.get('kernel_size', 2)))
    p = to_tuple_2d(params.get('padding', 0))

    if len(in_shape) == 4:
        h_in, w_in = in_shape[2], in_shape[3]
        h_out = math.floor((h_in + 2 * p[0] - k[0]) / s[0]) + 1
        w_out = math.floor((w_in + 2 * p[1] - k[1]) / s[1]) + 1
        return [in_shape[0], in_shape[1], h_out, w_out]

    return list(in_shape)


def fit_norm(node: Dict[str, Any], in_shape: List[int]) -> Tuple[List[int], List[str]]:
    """Fits normalization layers (BatchNorm1d, BatchNorm2d, LayerNorm)."""
    nid = node['id']
    ntype = node.get('type', '')
    params = node.setdefault('params', {})
    adjustments = []

    if ntype in ('nn.BatchNorm2d', 'BatchNorm2d'):
        c = in_shape[1] if len(in_shape) >= 2 else in_shape[0]
        if params.get('num_features') != c:
            params['num_features'] = c
            adjustments.append(f"Node '{nid}' (nn.BatchNorm2d): adjusted num_features to {c}.")

    elif ntype in ('nn.BatchNorm1d', 'BatchNorm1d'):
        c = in_shape[1] if len(in_shape) >= 2 else in_shape[0]
        if params.get('num_features') != c:
            params['num_features'] = c
            adjustments.append(f"Node '{nid}' (nn.BatchNorm1d): adjusted num_features to {c}.")

    elif ntype in ('nn.LayerNorm', 'LayerNorm'):
        last_dim = in_shape[-1]
        if params.get('normalized_shape') != last_dim:
            params['normalized_shape'] = last_dim
            adjustments.append(f"Node '{nid}' (nn.LayerNorm): adjusted normalized_shape to {last_dim}.")

    return list(in_shape), adjustments


def fit_attention(node: Dict[str, Any], in_shape: List[int]) -> Tuple[List[int], List[str]]:
    """Fits nn.MultiheadAttention embed_dim and ensures num_heads divides embed_dim."""
    nid = node['id']
    params = node.setdefault('params', {})
    adjustments = []

    embed_dim = in_shape[-1]
    curr_dim = params.get('embed_dim')
    if curr_dim != embed_dim:
        params['embed_dim'] = embed_dim
        adjustments.append(f"Node '{nid}' (nn.MultiheadAttention): adjusted embed_dim to {embed_dim}.")

    num_heads = params.get('num_heads', 4)
    if embed_dim % num_heads != 0:
        divisors = [d for d in range(1, embed_dim + 1) if embed_dim % d == 0]
        best_head = max([d for d in divisors if d <= num_heads] or [1])
        params['num_heads'] = best_head
        adjustments.append(
            f"Node '{nid}' (nn.MultiheadAttention): adjusted num_heads {num_heads} -> {best_head} (must divide embed_dim {embed_dim})."
        )

    return list(in_shape), adjustments


def compute_flatten(in_shape: List[int], start_dim: int = 1, end_dim: int = -1) -> List[int]:
    """Computes resulting tensor shape after flattening a range of dimensions."""
    if start_dim >= len(in_shape):
        return list(in_shape)
    if end_dim < 0:
        end_dim = len(in_shape) + end_dim
    end_dim = min(end_dim, len(in_shape) - 1)

    if start_dim >= end_dim:
        return list(in_shape)

    flat_dim = math.prod(in_shape[start_dim:end_dim + 1])
    return in_shape[:start_dim] + [flat_dim] + in_shape[end_dim + 1:]
