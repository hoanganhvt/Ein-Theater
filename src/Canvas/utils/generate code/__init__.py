"""
Ein Theater PyTorch FX Graph Tracing & Code Synthesis Package.
"""

import os
import sys

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from common import (
    find_modules_json_path,
    load_modules_map,
    fix_model_name,
)

from classifier import (
    is_addition_node,
    is_sub_node,
    is_concat_node,
    is_mul_node,
    get_layer_type_label,
    classify_connection,
    inspect_model_graph,
)

from tracer import (
    get_module_params,
    arg_to_str,
    format_node_args,
    model_to_json_graph,
)

from canvas import (
    canvas_to_json_graph,
)

from codegen import (
    generate_code_from_json,
    generate_code_from_canvas,
    save_model_to_folder,
)

__all__ = [
    # Common
    'find_modules_json_path',
    'load_modules_map',
    'fix_model_name',
    # Classifier
    'is_addition_node',
    'is_sub_node',
    'is_concat_node',
    'is_mul_node',
    'get_layer_type_label',
    'classify_connection',
    'inspect_model_graph',
    # Tracer
    'get_module_params',
    'arg_to_str',
    'format_node_args',
    'model_to_json_graph',
    # Canvas
    'canvas_to_json_graph',
    # Codegen
    'generate_code_from_json',
    'generate_code_from_canvas',
    'save_model_to_folder',
]
