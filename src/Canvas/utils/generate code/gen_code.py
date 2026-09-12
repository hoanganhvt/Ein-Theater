#!/usr/bin/env python3
"""
Ein Theater - PyTorch FX Graph Tracing & Code Generation CLI & Core API.

This module acts as the unified façade and CLI entry point for the PyTorch code
generation engine. Core functionalities are partitioned into:
  - common.py:     Naming sanitization (fix_model_name) and modules.json lookup.
  - classifier.py: Connection semantic classification and FX graph inspection.
  - tracer.py:     PyTorch module inspection and FX symbolic tracing to JSON.
  - canvas.py:     Visual canvas graph JSON to FX computational graph compiler.
  - codegen.py:    Executable PyTorch nn.Module AST code generation and saving.
"""

import os
import sys
import json
import argparse

# Ensure this directory is in sys.path for dynamic importlib loading and sub-script execution
_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

# Re-export all public functions, classes, and helpers for 100% backward compatibility
from common import (
    find_modules_json_path,
    load_modules_map,
    fix_model_name,
    fix_input_name,
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
    'fix_input_name',
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


def main():
    parser = argparse.ArgumentParser(description="Ein Theater PyTorch Model Generator & Tracer")
    parser.add_argument("--save-canvas", help="Path to JSON file containing canvas graph data to save (use '-' for stdin)")
    parser.add_argument("--canvas-json", help="Direct JSON string of canvas graph data")
    parser.add_argument("--out-dir", help="Target directory where model_name/ folder will be saved", default=None)

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
        parser.print_help()


if __name__ == "__main__":
    main()