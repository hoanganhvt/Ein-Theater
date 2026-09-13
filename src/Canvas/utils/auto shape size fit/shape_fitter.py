#!/usr/bin/env python3
"""
Ein Theater - Auto Shape Size Fit Orchestrator.

Main coordinator for topological sorting, shape propagation, layer parameter
adaptation, and skip/residual padding resolution.
"""

import os
import sys
import json
import copy
from typing import Dict, Any, List, Optional, Tuple

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from topo import topological_sort
from padding_solver import try_resolve_spatial_padding, to_tuple_2d
import layers

__all__ = [
    'ShapeFitter',
    'auto_shape_size_fit',
    'topological_sort',
]


class ShapeFitter:
    """
    Orchestrates automated tensor shape propagation across visual computational graphs.
    """

    def __init__(self, model_data: Any):
        if isinstance(model_data, str):
            if os.path.isfile(model_data):
                with open(model_data, 'r', encoding='utf-8') as f:
                    self.data = json.load(f)
            else:
                self.data = json.loads(model_data)
        else:
            self.data = copy.deepcopy(model_data)

        self.metadata = self.data.get('metadata', {})
        self.nodes = self.data.get('nodes', [])
        self.node_map: Dict[str, Dict[str, Any]] = {}
        for n in self.nodes:
            nid = n['id']
            if nid not in self.node_map or n.get('op') != 'accumulate':
                self.node_map[nid] = n

        self.shapes: Dict[str, List[int]] = {}
        self.adjustments: List[str] = []
        self.padding_adjustments: List[str] = []
        self.warnings: List[str] = []

    def fit(self) -> Dict[str, Any]:
        """
        Executes the topological sort and forward shape propagation pipeline.
        Returns:
            Dictionary with status, fitted model dict, adjustments, padding adjustments, warnings, and shapes.
        """
        if not self.nodes:
            return {
                'status': 'ok',
                'model': self.data,
                'adjustments': [],
                'padding_adjustments': [],
                'warnings': ['Model graph contains no nodes.'],
                'shapes': {}
            }

        # Step 1: Topological sort (Kahn's algorithm)
        ordered_nodes, has_cycle = topological_sort(self.nodes)
        if has_cycle:
            self.warnings.append("Graph contains cyclic dependencies; topological order may be partial.")

        self.nodes = ordered_nodes
        self.node_map = {}
        for n in self.nodes:
            nid = n['id']
            if nid not in self.node_map or n.get('op') != 'accumulate':
                self.node_map[nid] = n

        # Step 2: Sequential shape propagation and parameter fitting
        for node in self.nodes:
            self._process_node(node)

        # Step 3: Synchronize canvas representation if present
        self._sync_canvas_nodes()

        self.data['nodes'] = self.nodes
        return {
            'status': 'ok',
            'model': self.data,
            'adjustments': self.adjustments,
            'padding_adjustments': self.padding_adjustments,
            'warnings': self.warnings,
            'shapes': {k: list(v) for k, v in self.shapes.items()}
        }

    def _get_input_shapes(self, node: Dict[str, Any]) -> List[Optional[List[int]]]:
        """Collects the output shapes of all upstream predecessor nodes."""
        inputs = node.get('inputs', [])
        return [self.shapes.get(inp_id) for inp_id in inputs]

    def _process_node(self, node: Dict[str, Any]):
        """Dispatches a single node to its appropriate layer or function handler."""
        nid = node['id']
        op = node.get('op', '')
        ntype = node.get('type', '')

        # 1. Placeholders / Inputs
        if op == 'placeholder' or ntype in ('input', 'Input'):
            shape = self._infer_placeholder_shape(node)
            self.shapes[nid] = shape
            return

        in_shapes = self._get_input_shapes(node)
        valid_in_shapes = [s for s in in_shapes if s is not None]

        if not valid_in_shapes:
            if op != 'output':
                self.warnings.append(f"Node '{nid}' ({ntype}) has no connected inputs or preceding shapes.")
            return

        primary_shape = valid_in_shapes[0]

        # 2. Module Calls (nn.Linear, nn.Conv2d, nn.MaxPool2d, etc.)
        if op == 'call_module':
            self._process_module(node, primary_shape, valid_in_shapes)

        # 3. Function Calls (torch.cat, torch.add, flatten, etc.)
        elif op == 'call_function' or op == 'accumulate':
            self._process_function(node, primary_shape, valid_in_shapes)

        # 4. Method Calls (.flatten(), .transpose(), .mean())
        elif op == 'call_method':
            self._process_method(node, primary_shape)

        # 5. Passthroughs (assign, output)
        elif op in ('assign', 'output'):
            self.shapes[nid] = list(primary_shape)
        else:
            self.shapes[nid] = list(primary_shape)

        # Re-sync node codeTemplate with any modified parameters
        self._update_code_template(node)

    def _infer_placeholder_shape(self, node: Dict[str, Any]) -> List[int]:
        """Deduces the shape of an input placeholder node."""
        params = node.get('params', {})
        shape = params.get('shape')
        batch_size = int(params.get('batch_size', 1)) if str(params.get('batch_size', 1)).isdigit() else 1

        if shape and isinstance(shape, (list, tuple)) and len(shape) > 0:
            return [batch_size] + [int(d) for d in shape]

        # Check metadata
        meta_shape = self.metadata.get('input_shape')
        if meta_shape and isinstance(meta_shape, (list, tuple)) and len(meta_shape) > 0:
            return [batch_size] + [int(d) for d in meta_shape]

        itype = (node.get('input_type') or params.get('input_type') or self.metadata.get('input_type', '')).lower().strip()
        if itype in ('image', 'img'):
            return [batch_size, 3, 224, 224]
        elif itype in ('text', 'txt'):
            return [batch_size, 128]
        elif itype in ('audio', 'sound'):
            return [batch_size, 1, 16000]
        elif itype in ('raw data', 'raw_data', 'raw'):
            return [batch_size, 64]

        # Inspect downstream consumers if modality is unspecified
        downstream = [n for n in self.nodes if node['id'] in n.get('inputs', [])]
        if downstream:
            first_type = downstream[0].get('type', '')
            if first_type in ('nn.Conv2d', 'Conv2d', 'nn.MaxPool2d', 'MaxPool2d'):
                in_c = downstream[0].get('params', {}).get('in_channels', 3)
                return [batch_size, in_c, 224, 224]
            elif first_type in ('nn.Conv1d', 'Conv1d'):
                in_c = downstream[0].get('params', {}).get('in_channels', 1)
                return [batch_size, in_c, 16000]
            elif first_type in ('nn.Embedding', 'Embedding'):
                return [batch_size, 128]
            elif first_type in ('nn.Linear', 'Linear'):
                in_f = downstream[0].get('params', {}).get('in_features', 64)
                return [batch_size, in_f]

        return [batch_size, 64]

    def _process_module(self, node: Dict[str, Any], in_shape: List[int], all_in_shapes: List[List[int]]):
        """Fits module parameters and computes output shape."""
        nid = node['id']
        ntype = node.get('type', '')
        args_str = str(node.get('args_str', ''))

        # Multi-input module with implicit concatenation
        if ('torch.cat' in args_str or len(all_in_shapes) > 1) and len(all_in_shapes) > 1:
            in_shape = self._compute_concat_shape(all_in_shapes, dim=1, node_id=nid)

        if ntype in ('nn.Linear', 'Linear'):
            out_shape, adjs = layers.fit_linear(node, in_shape)
            self.shapes[nid] = out_shape
            self.adjustments.extend(adjs)

        elif ntype in ('nn.Conv2d', 'Conv2d'):
            out_shape, adjs, pads, warns = layers.fit_conv2d(node, in_shape)
            self.shapes[nid] = out_shape
            self.adjustments.extend(adjs)
            self.padding_adjustments.extend(pads)
            self.warnings.extend(warns)

        elif ntype in ('nn.ConvTranspose2d', 'ConvTranspose2d'):
            out_shape, adjs, warns = layers.fit_conv_transpose2d(node, in_shape)
            self.shapes[nid] = out_shape
            self.adjustments.extend(adjs)
            self.warnings.extend(warns)

        elif ntype in ('nn.Conv1d', 'Conv1d'):
            out_shape, adjs, warns = layers.fit_conv1d(node, in_shape)
            self.shapes[nid] = out_shape
            self.adjustments.extend(adjs)
            self.warnings.extend(warns)

        elif ntype in ('nn.MaxPool2d', 'nn.AvgPool2d', 'MaxPool2d', 'AvgPool2d'):
            self.shapes[nid] = layers.fit_pooling(node, in_shape)

        elif ntype in ('nn.MaxPool1d', 'nn.AvgPool1d', 'MaxPool1d', 'AvgPool1d'):
            k = int(node.get('params', {}).get('kernel_size', 2))
            s = int(node.get('params', {}).get('stride', k))
            p = int(node.get('params', {}).get('padding', 0))
            l_in = in_shape[-1]
            l_out = (l_in + 2 * p - k) // s + 1
            self.shapes[nid] = list(in_shape[:-1]) + [l_out]

        elif ntype in ('nn.AdaptiveAvgPool2d', 'nn.AdaptiveMaxPool2d', 'AdaptiveAvgPool2d', 'AdaptiveMaxPool2d'):
            out_sz = to_tuple_2d(node.get('params', {}).get('output_size', (1, 1)))
            self.shapes[nid] = [in_shape[0], in_shape[1], out_sz[0], out_sz[1]]

        elif ntype in ('nn.AdaptiveAvgPool1d', 'nn.AdaptiveMaxPool1d', 'AdaptiveAvgPool1d', 'AdaptiveMaxPool1d'):
            out_sz = int(node.get('params', {}).get('output_size', 1))
            self.shapes[nid] = list(in_shape[:-1]) + [out_sz]

        elif ntype in ('nn.BatchNorm2d', 'BatchNorm2d', 'nn.BatchNorm1d', 'BatchNorm1d', 'nn.LayerNorm', 'LayerNorm'):
            out_shape, adjs = layers.fit_norm(node, in_shape)
            self.shapes[nid] = out_shape
            self.adjustments.extend(adjs)

        elif ntype in ('nn.MultiheadAttention', 'MultiheadAttention'):
            out_shape, adjs = layers.fit_attention(node, in_shape)
            self.shapes[nid] = out_shape
            self.adjustments.extend(adjs)

        elif ntype in ('nn.Embedding', 'Embedding'):
            emb_dim = node.get('params', {}).get('embedding_dim', 64)
            self.shapes[nid] = list(in_shape) + [emb_dim]

        elif ntype in ('nn.Flatten', 'Flatten'):
            start_dim = int(node.get('params', {}).get('start_dim', 1))
            end_dim = int(node.get('params', {}).get('end_dim', -1))
            self.shapes[nid] = layers.compute_flatten(in_shape, start_dim, end_dim)

        else:
            # Default shape-preserving layer (ReLU, GELU, Dropout, Identity, etc.)
            self.shapes[nid] = list(in_shape)

    def _process_function(self, node: Dict[str, Any], in_shape: List[int], all_in_shapes: List[List[int]]):
        """Processes function calls such as cat, add, flatten, getitem."""
        nid = node['id']
        target = node.get('target', '')
        op = node.get('op', '')

        if target in ('cat', 'torch.cat'):
            dim = int(node.get('params', {}).get('dim', 1))
            self.shapes[nid] = self._compute_concat_shape(all_in_shapes, dim=dim, node_id=nid)

        elif target in ('add', 'torch.add', 'operator.add') or op == 'accumulate':
            self.shapes[nid] = self._compute_add_shape(all_in_shapes, node_id=nid)

        elif target in ('flatten', 'torch.flatten'):
            start_dim = 1
            args_str = str(node.get('args_str', ''))
            parts = [p.strip() for p in args_str.split(',') if p.strip()]
            if len(parts) >= 2 and parts[1].isdigit():
                start_dim = int(parts[1])
            self.shapes[nid] = layers.compute_flatten(in_shape, start_dim, -1)

        elif target == 'getitem':
            self.shapes[nid] = list(in_shape)
        else:
            self.shapes[nid] = list(in_shape)

    def _process_method(self, node: Dict[str, Any], in_shape: List[int]):
        """Processes tensor methods such as .flatten(), .transpose(), .mean(), .view()."""
        nid = node['id']
        target = node.get('target', '')
        args_str = str(node.get('args_str', ''))

        if target == 'flatten':
            start_dim = 1
            parts = [p.strip() for p in args_str.split(',') if p.strip()]
            if len(parts) >= 2 and parts[1].isdigit():
                start_dim = int(parts[1])
            self.shapes[nid] = layers.compute_flatten(in_shape, start_dim, -1)

        elif target == 'transpose':
            parts = [p.strip() for p in args_str.split(',') if p.strip()]
            dims = [int(p) for p in parts[1:] if p.isdigit()]
            new_shape = list(in_shape)
            if len(dims) >= 2:
                d1, d2 = dims[0], dims[1]
                if d1 < len(new_shape) and d2 < len(new_shape):
                    new_shape[d1], new_shape[d2] = new_shape[d2], new_shape[d1]
            self.shapes[nid] = new_shape

        elif target == 'mean':
            parts = [p.strip() for p in args_str.split(',') if p.strip()]
            dim = None
            for p in parts:
                if 'dim=' in p:
                    dim = int(p.split('dim=')[1].strip())
                elif p.isdigit():
                    dim = int(p)
            if dim is not None and dim < len(in_shape):
                new_shape = list(in_shape)
                del new_shape[dim]
                self.shapes[nid] = new_shape
            else:
                self.shapes[nid] = list(in_shape)

        elif target == 'permute':
            parts = [p.strip() for p in args_str.split(',') if p.strip()]
            dims = [int(p) for p in parts if p.isdigit()]
            if len(dims) == len(in_shape):
                self.shapes[nid] = [in_shape[d] for d in dims]
            else:
                self.shapes[nid] = list(in_shape)

        elif target in ('view', 'reshape'):
            parts = [p.strip() for p in args_str.split(',') if p.strip()]
            dims = [int(p) for p in parts[1:] if p.lstrip('-').isdigit()]
            self.shapes[nid] = dims if dims else list(in_shape)
        else:
            self.shapes[nid] = list(in_shape)

    def _compute_concat_shape(self, in_shapes: List[List[int]], dim: int = 1, node_id: Optional[str] = None) -> List[int]:
        """Computes concatenation tensor shape and auto-solves spatial padding mismatches."""
        if not in_shapes:
            return [1, 64]
        if len(in_shapes) == 1:
            return list(in_shapes[0])

        base_shape = list(in_shapes[0])
        accum_channel = base_shape[dim] if dim < len(base_shape) else 0

        for other_idx, other_shape in enumerate(in_shapes[1:], start=1):
            if len(base_shape) == 4 and len(other_shape) == 4:
                h1, w1 = base_shape[2], base_shape[3]
                h2, w2 = other_shape[2], other_shape[3]

                if (h1, w1) != (h2, w2):
                    source_id = self._get_input_node_id(node_id, other_idx)
                    resolved, msg = try_resolve_spatial_padding(
                        target_spatial=(h1, w1),
                        source_node_id=source_id,
                        consumer_node_id=node_id,
                        node_map=self.node_map,
                        shapes=self.shapes,
                        context="Concat"
                    )
                    if resolved and msg:
                        self.padding_adjustments.append(msg)
                    else:
                        self.warnings.append(
                            f"Node '{node_id}' (Concat): spatial dimension mismatch ({h1}, {w1}) vs ({h2}, {w2}) could not be resolved automatically. Please adjust padding or stride manually."
                        )

            if dim < len(other_shape):
                accum_channel += other_shape[dim]

        base_shape[dim] = accum_channel
        return base_shape

    def _compute_add_shape(self, in_shapes: List[List[int]], node_id: Optional[str] = None) -> List[int]:
        """Computes addition shape and auto-solves spatial padding for residual connections."""
        if not in_shapes:
            return [1, 64]
        if len(in_shapes) == 1:
            return list(in_shapes[0])

        shape1 = in_shapes[0]
        shape2 = in_shapes[1]

        if shape1 == shape2:
            return list(shape1)

        # Handle 4D spatial tensors (e.g. ResNet residual block)
        if len(shape1) == 4 and len(shape2) == 4:
            c1, h1, w1 = shape1[1], shape1[2], shape1[3]
            c2, h2, w2 = shape2[1], shape2[2], shape2[3]

            if c1 != c2:
                self.warnings.append(
                    f"Node '{node_id}' (Add): channel mismatch ({c1} vs {c2}). An adapter layer (1x1 conv) is required to match channels."
                )

            if (h1, w1) != (h2, w2):
                # Try adjusting branch 2 to match branch 1
                source_id_2 = self._get_input_node_id(node_id, 1)
                resolved, msg = try_resolve_spatial_padding(
                    target_spatial=(h1, w1),
                    source_node_id=source_id_2,
                    consumer_node_id=node_id,
                    node_map=self.node_map,
                    shapes=self.shapes,
                    context="Add"
                )
                if resolved and msg:
                    self.padding_adjustments.append(msg)
                    return [shape1[0], c1, h1, w1]

                # Try adjusting branch 1 to match branch 2
                source_id_1 = self._get_input_node_id(node_id, 0)
                resolved_1, msg_1 = try_resolve_spatial_padding(
                    target_spatial=(h2, w2),
                    source_node_id=source_id_1,
                    consumer_node_id=node_id,
                    node_map=self.node_map,
                    shapes=self.shapes,
                    context="Add"
                )
                if resolved_1 and msg_1:
                    self.padding_adjustments.append(msg_1)
                    return [shape1[0], c2, h2, w2]

                self.warnings.append(
                    f"Node '{node_id}' (Add): spatial mismatch ({h1}, {w1}) vs ({h2}, {w2}) could not be resolved by padding adjustments. Please adjust stride or padding manually."
                )

        return list(shape1)

    def _get_input_node_id(self, consumer_id: Optional[str], input_index: int) -> Optional[str]:
        """Finds the node ID of the input at input_index for consumer_id."""
        if not consumer_id or consumer_id not in self.node_map:
            return None
        inputs = self.node_map[consumer_id].get('inputs', [])
        if input_index < len(inputs):
            return inputs[input_index]
        return None

    def _update_code_template(self, node: Dict[str, Any]):
        """Ensures codeTemplate reflects current module parameters."""
        template = node.get('codeTemplate')
        params = node.get('params', {})
        ntype = node.get('type', '')

        if not template and params:
            args_parts = [f"{k}={{{k}}}" for k in params.keys()]
            node['codeTemplate'] = f"{ntype}({', '.join(args_parts)})"

    def _sync_canvas_nodes(self):
        """Synchronizes fitted layer parameters back to canvas.nodes for visual schematic parity."""
        canvas = self.data.get('canvas')
        if not isinstance(canvas, dict):
            return

        c_nodes = canvas.get('nodes', [])
        for c_node in c_nodes:
            cid = str(c_node.get('id', ''))
            fx_node = self.node_map.get(cid)
            if not fx_node:
                for fn in self.nodes:
                    if fn.get('target') == cid or fn.get('id') == cid or str(fn.get('id', '')).endswith(f"_{cid}"):
                        fx_node = fn
                        break

            if fx_node and 'params' in fx_node:
                c_params = c_node.setdefault('params', {})
                c_params.update(fx_node['params'])


def auto_shape_size_fit(model_json_or_dict: Any) -> Dict[str, Any]:
    """
    Public entry point for auto shape size fit.
    Accepts model dict or JSON string, returns fitting report and fitted model.
    """
    fitter = ShapeFitter(model_json_or_dict)
    return fitter.fit()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Ein Theater Auto Shape Size Fit CLI")
    parser.add_argument("--input", "-i", required=True, help="Path to input model JSON file")
    parser.add_argument("--output", "-o", help="Path to save fitted model JSON file")
    args = parser.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        data = json.load(f)

    res = auto_shape_size_fit(data)

    print(f"[Auto Shape Size Fit] Completed for '{args.input}':")
    print(f"  Adjustments made: {len(res['adjustments'])}")
    for a in res['adjustments']:
        print(f"    - {a}")
    print(f"  Padding adjustments: {len(res['padding_adjustments'])}")
    for p in res['padding_adjustments']:
        print(f"    - {p}")
    print(f"  Warnings: {len(res['warnings'])}")
    for w in res['warnings']:
        print(f"    ! {w}")

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(res['model'], f, indent=2)
        print(f"[OK] Saved fitted model to {args.output}")
