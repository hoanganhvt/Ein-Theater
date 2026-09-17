"""Public shape API and JSON-lines worker used by the Go backend."""
import argparse
import json
import sys
from pathlib import Path

if not __package__:
    _utils_dir = str(Path(__file__).resolve().parent.parent)
    if _utils_dir not in sys.path:
        sys.path.insert(0, _utils_dir)

from auto_shape_fitting.shape_engine import ShapeEngine, infer_shapes, validate_for_save
from shared.module_registry import register_adapter, register_module

__all__ = ["ShapeEngine", "infer_shapes", "validate_for_save", "register_adapter", "register_module"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--base-dir', default='')
    args = parser.parse_args()
    if args.worker:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                result = {'graph': infer_shapes(request['graph'], request.get('baseDir', ''))}
            except Exception as error:
                result = {'error': str(error)}
            print(json.dumps(result), flush=True)
    else:
        print(json.dumps(infer_shapes(json.load(sys.stdin), args.base_dir)))


if __name__ == '__main__':
    main()
