"""Regression tests for loading modes and disconnected layer generation."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from bootstrap import UTILS, GENERATOR

import torch

from source_renderer import generate_code_from_canvas
from test_shape_inference import chain, node, source

ROOT = GENERATOR


class CodeGenerationTests(unittest.TestCase):
    def test_disconnected_module_is_initialized_but_not_called(self):
        graph = chain(source(), node('active', 'nn.ReLU'))
        graph['nodes'].append(node('unused', 'nn.Linear', in_features=9, out_features=2))
        namespace = {'__name__': 'generated_test'}
        exec(compile(generate_code_from_canvas(graph), '<generated>', 'exec'), namespace)
        model = namespace['model']()
        self.assertIsInstance(model.linear_unused, torch.nn.Linear)
        value = torch.randn(2, 4)
        torch.testing.assert_close(model(value), value.relu())

    def test_package_import_does_not_load_top_level_implementation(self):
        script = '''
import importlib.util
import sys
from pathlib import Path
root = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('canvas_codegen', root / '__init__.py')
package = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = package
spec.loader.exec_module(package)
assert callable(package.save_model_to_folder)
assert 'read_canvas.canvas' in sys.modules
assert 'canvas' not in sys.modules
assert str(root) not in sys.path
'''
        subprocess.run([sys.executable, '-B', '-c', script, str(ROOT)], check=True,
                       capture_output=True, text=True, cwd=tempfile.gettempdir())

    def test_dynamic_entry_point_and_cli_save(self):
        spec = importlib.util.spec_from_file_location('generator_entry', ROOT / 'gen_code.py')
        api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(api)
        graph = chain(source(), node('dense', 'nn.Linear', out_features=3))
        with tempfile.TemporaryDirectory() as output:
            result = subprocess.run(
                [sys.executable, '-B', str(ROOT / 'gen_code.py'), '--save-canvas', '-', '--out-dir', output],
                input=json.dumps(graph), capture_output=True, text=True, check=True,
                cwd=tempfile.gettempdir())
            saved = json.loads(result.stdout)
            self.assertTrue(Path(saved['pyFile']).is_file())
            self.assertEqual(saved['modelName'], 'model')
            self.assertTrue(callable(api.generate_code_from_json))


if __name__ == '__main__':
    unittest.main()
