import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("code_compile", Path(__file__).with_name("compile.py"))
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class CompileTests(unittest.TestCase):
    def test_class_scan(self):
        source = "class Helper: pass\nclass Net(nn.Module): pass\nclass Other(Net): pass\n"
        self.assertEqual(TOOL.classes(source), ["Net", "Other"])

    def test_syntax_error(self):
        with self.assertRaises(SyntaxError):
            TOOL.classes("class Model(nn.Module:\n    pass")

    @unittest.skipUnless(importlib.util.find_spec("torch"), "PyTorch unavailable")
    def test_trace_linear_relu_and_two_inputs(self):
        source = """import torch
from torch import nn
class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(4, 2)
        self.relu = nn.ReLU()
    def forward(self, x, y):
        return self.relu(self.linear(x + y))
"""
        graph = TOOL.convert(source, "Model", str(Path(__file__).with_name("model.py")),
                             ["Input", "torch.add", "nn.Linear", "nn.ReLU"])
        self.assertEqual([node["layerType"] for node in graph["nodes"]],
                         ["Input", "Input", "torch.add", "nn.Linear", "nn.ReLU"])
        self.assertEqual(graph["nodes"][3]["params"]["in_features"], 4)
        self.assertEqual(len(graph["edges"]), 4)

    @unittest.skipUnless(importlib.util.find_spec("torch"), "PyTorch unavailable")
    def test_unsupported_function_is_error(self):
        source = """from torch import nn
class Model(nn.Module):
    def forward(self, x): return x.sin()
"""
        with self.assertRaisesRegex(ValueError, "unsupported FX node"):
            TOOL.convert(source, "Model", str(Path(__file__).with_name("model.py")), ["Input"])

    @unittest.skipUnless(importlib.util.find_spec("torch"), "PyTorch unavailable")
    def test_constructor_requires_arguments(self):
        source = """from torch import nn
class Model(nn.Module):
    def __init__(self, width):
        super().__init__()
        self.layer = nn.Linear(width, 2)
    def forward(self, x): return self.layer(x)
"""
        with self.assertRaisesRegex(ValueError, "constructible without arguments"):
            TOOL.convert(source, "Model", str(Path(__file__).with_name("model.py")), ["Input", "nn.Linear"])


if __name__ == "__main__":
    unittest.main()
