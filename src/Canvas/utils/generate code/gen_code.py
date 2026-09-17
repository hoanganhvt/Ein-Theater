#!/usr/bin/env python3
"""Public API and CLI for saving Canvas models as standalone PyTorch source."""
from pathlib import Path
import sys

_utils_dir = str(Path(__file__).resolve().parent.parent)
if _utils_dir not in sys.path:
    sys.path.insert(0, _utils_dir)

import os
import json
import argparse

# Support direct importlib loading from this directory, whose name contains a space.
if not __package__:
    _curr_dir = os.path.dirname(os.path.abspath(__file__))
    if _curr_dir not in sys.path:
        sys.path.insert(0, _curr_dir)

from shared.common import find_modules_json_path, load_modules_map, fix_model_name, fix_input_name
from read_canvas.canvas import canvas_to_json_graph

if __package__:
    from .model_paths import to_relative_path
    from .source_renderer import generate_code_from_json, generate_code_from_canvas
    from .model_storage import save_model_to_folder
else:
    from model_paths import to_relative_path
    from source_renderer import generate_code_from_json, generate_code_from_canvas
    from model_storage import save_model_to_folder

__all__ = [
    # Common
    'find_modules_json_path',
    'load_modules_map',
    'fix_model_name',
    'fix_input_name',
    # Canvas
    'canvas_to_json_graph',
    # Codegen
    'to_relative_path',
    'generate_code_from_json',
    'generate_code_from_canvas',
    'save_model_to_folder',
]


def main():
    parser = argparse.ArgumentParser(description="Ein Theater PyTorch Model Generator")
    parser.add_argument("--save-canvas", help="Path to JSON file containing canvas graph data to save (use '-' for stdin)")
    parser.add_argument("--canvas-json", help="Direct JSON string of canvas graph data")
    parser.add_argument("--out-dir", help="Target directory where model_name/ folder will be saved", default=None)
    parser.add_argument("--base-dir", help="Directory used to resolve source model references", default=None)
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

        base_dir = args.base_dir
        if base_dir is None and args.save_canvas and args.save_canvas != '-':
            base_dir = os.path.dirname(os.path.abspath(args.save_canvas))
        res = save_model_to_folder(canvas_data, output_dir=args.out_dir, base_dir=base_dir)
        print(json.dumps(res))
        sys.exit(0)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
