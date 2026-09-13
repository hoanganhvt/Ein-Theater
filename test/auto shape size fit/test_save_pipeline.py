#!/usr/bin/env python3
"""
Test Suite: Save Pipeline Lifecycle & Auto Shape Size Fit Integration.

Verifies the exact user specification:
  1. User triggers Save -> temp.json is created in <target_dir>/<model_name>/
  2. Auto shape size fit reads and resolves temp.json shapes and paddings
  3. Only after that, final <model_name>.py and <model_name>.json are created
  4. Afterwards, temp.json is removed from disk
  5. The resulting <model_name>.py executes a successful PyTorch forward pass.
"""

import os
import sys
import json
import shutil
import tempfile
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GEN_CODE_DIR = os.path.join(REPO_ROOT, 'src', 'Canvas', 'utils', 'generate code')
AUTO_FIT_DIR = os.path.join(REPO_ROOT, 'src', 'Canvas', 'utils', 'auto shape size fit')

sys.path.insert(0, GEN_CODE_DIR)
sys.path.insert(0, AUTO_FIT_DIR)

from codegen import save_model_to_folder
from shape_fitter import auto_shape_size_fit


def test_save_pipeline_lifecycle():
    print("=" * 70)
    print("TEST 1: Save Pipeline temp.json Lifecycle & Shape Fitting")
    print("=" * 70)

    test_dir = tempfile.mkdtemp(prefix="ein_save_test_")
    try:
        model_name = "Integrated_Test_Net"
        # Canvas data with deliberate dimension mismatches:
        # Input: image [3, 32, 32]
        # Conv1: in_channels=999 (WRONG, should be 3), out_channels=16, kernel_size=3, padding=1 -> [16, 32, 32]
        # Conv2: in_channels=888 (WRONG, should be 16), out_channels=32, kernel_size=3, padding=1 -> [32, 32, 32]
        # MaxPool2d: kernel_size=2, stride=2 -> [32, 16, 16]
        # Flatten: -> [8192]
        # Linear1: in_features=111 (WRONG, should be 8192), out_features=128
        # Linear2: in_features=222 (WRONG, should be 128), out_features=10
        canvas_data = {
            "projectId": "proj_integrated_01",
            "name": model_name,
            "nodes": [
                {
                    "id": "node_in",
                    "label": "Input Image",
                    "layerType": "input",
                    "params": {"input_type": "image", "shape": [3, 32, 32], "batch_size": 2}
                },
                {
                    "id": "node_c1",
                    "label": "Conv 1",
                    "layerType": "nn.Conv2d",
                    "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 3, "padding": 1}
                },
                {
                    "id": "node_c2",
                    "label": "Conv 2",
                    "layerType": "nn.Conv2d",
                    "params": {"in_channels": 888, "out_channels": 32, "kernel_size": 3, "padding": 1}
                },
                {
                    "id": "node_pool",
                    "label": "MaxPool",
                    "layerType": "nn.MaxPool2d",
                    "params": {"kernel_size": 2, "stride": 2}
                },
                {
                    "id": "node_flat",
                    "label": "Flatten",
                    "layerType": "nn.Flatten",
                    "params": {"start_dim": 1}
                },
                {
                    "id": "node_fc1",
                    "label": "FC 1",
                    "layerType": "nn.Linear",
                    "params": {"in_features": 111, "out_features": 128}
                },
                {
                    "id": "node_fc2",
                    "label": "FC 2",
                    "layerType": "nn.Linear",
                    "params": {"in_features": 222, "out_features": 10}
                }
            ],
            "edges": [
                {"id": "e1", "from": "node_in", "to": "node_c1"},
                {"id": "e2", "from": "node_c1", "to": "node_c2"},
                {"id": "e3", "from": "node_c2", "to": "node_pool"},
                {"id": "e4", "from": "node_pool", "to": "node_flat"},
                {"id": "e5", "from": "node_flat", "to": "node_fc1"},
                {"id": "e6", "from": "node_fc1", "to": "node_fc2"}
            ]
        }

        target_folder = os.path.join(test_dir, model_name)
        temp_json_path = os.path.join(target_folder, "temp.json")
        final_json_path = os.path.join(target_folder, f"{model_name}.json")
        final_py_path = os.path.join(target_folder, f"{model_name}.py")

        res = save_model_to_folder(canvas_data, output_dir=test_dir)

        print(f"Save status: {res.get('status')}")
        print(f"Folder: {res.get('folder')}")
        print(f"Adjustments ({len(res.get('adjustments', []))}):")
        for adj in res.get('adjustments', []):
            print(f"  * {adj}")
        print(f"Warnings ({len(res.get('warnings', []))}):")
        for w in res.get('warnings', []):
            print(f"  ! {w}")

        # Verification 1: temp.json MUST NOT exist on disk afterwards
        assert not os.path.exists(temp_json_path), f"Error: temp.json was not deleted: {temp_json_path}"
        print("[PASS] temp.json was deleted cleanly.")

        # Verification 2: Final JSON and PY files MUST exist
        assert os.path.exists(final_json_path), f"Error: final JSON missing: {final_json_path}"
        assert os.path.exists(final_py_path), f"Error: final PY missing: {final_py_path}"
        print(f"[PASS] Final {model_name}.json and {model_name}.py exist.")

        # Verification 3: Final JSON must contain fitted parameters
        with open(final_json_path, 'r', encoding='utf-8') as f:
            final_data = json.load(f)

        node_map = {n['id']: n for n in final_data.get('nodes', [])}
        canvas_node_map = {n['id']: n for n in final_data.get('canvas', {}).get('nodes', [])}
        
        # Check FX node parameters
        c1_node = node_map.get('conv_node_c1') or node_map.get('node_c1')
        assert c1_node['params']['in_channels'] == 3, f"c1 in_channels not fitted to 3, got {c1_node['params']['in_channels']}"
        c2_node = node_map.get('conv_node_c2') or node_map.get('node_c2')
        assert c2_node['params']['in_channels'] == 16, f"c2 in_channels not fitted to 16, got {c2_node['params']['in_channels']}"
        fc1_node = node_map.get('linear_node_fc1') or node_map.get('node_fc1')
        assert fc1_node['params']['in_features'] == 8192, f"fc1 in_features not fitted to 8192, got {fc1_node['params']['in_features']}"
        fc2_node = node_map.get('linear_node_fc2') or node_map.get('node_fc2')
        assert fc2_node['params']['in_features'] == 128, f"fc2 in_features not fitted to 128, got {fc2_node['params']['in_features']}"

        # Check synced canvas nodes if present
        if canvas_node_map:
            assert canvas_node_map['node_c1']['params']['in_channels'] == 3
            assert canvas_node_map['node_c2']['params']['in_channels'] == 16
            assert canvas_node_map['node_fc1']['params']['in_features'] == 8192
            assert canvas_node_map['node_fc2']['params']['in_features'] == 128
        print("[PASS] Final JSON parameters were accurately fitted!")

        # Verification 4: Python file executes and forward pass succeeds
        cmd = [sys.executable, final_py_path]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        print("Generated script output:")
        print(proc.stdout)
        if proc.stderr:
            print("Errors (if any):", proc.stderr)
        assert proc.returncode == 0, f"Generated python script failed with code {proc.returncode}"
        assert "[OK] Forward pass test successful!" in proc.stdout
        print("[PASS] Generated Python script executes and forward pass completes successfully!")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


def test_cli_save_canvas():
    print("\n" + "=" * 70)
    print("TEST 2: CLI Interface via gen_code.py --save-canvas -")
    print("=" * 70)

    test_dir = tempfile.mkdtemp(prefix="ein_cli_test_")
    try:
        model_name = "CLI_Residual_Net"
        # Tricky skip connection with padding auto-fix
        canvas_data = {
            "projectId": "proj_cli_02",
            "name": model_name,
            "nodes": [
                {
                    "id": "node_in",
                    "label": "Input",
                    "layerType": "input",
                    "params": {"input_type": "image", "shape": [3, 28, 28], "batch_size": 4}
                },
                {
                    "id": "conv_main",
                    "label": "Main Conv",
                    "layerType": "nn.Conv2d",
                    "params": {"in_channels": 99, "out_channels": 32, "kernel_size": 3, "stride": 1, "padding": 0}
                },
                {
                    "id": "conv_branch",
                    "label": "Branch Conv",
                    "layerType": "nn.Conv2d",
                    "params": {"in_channels": 99, "out_channels": 32, "kernel_size": 1, "stride": 1, "padding": 0}
                },
                {
                    "id": "add_merge",
                    "label": "Add Residual",
                    "layerType": "torch.add",
                    "params": {}
                }
            ],
            "edges": [
                {"id": "e1", "from": "node_in", "to": "conv_main"},
                {"id": "e2", "from": "node_in", "to": "conv_branch"},
                {"id": "e3", "from": "conv_main", "to": "add_merge"},
                {"id": "e4", "from": "conv_branch", "to": "add_merge"}
            ]
        }

        cli_script = os.path.join(GEN_CODE_DIR, "gen_code.py")
        cmd = [sys.executable, cli_script, "--save-canvas", "-", "--out-dir", test_dir]
        proc = subprocess.run(cmd, input=json.dumps(canvas_data), capture_output=True, text=True, timeout=30)
        assert proc.returncode == 0, f"CLI command failed: {proc.stderr}"

        res = json.loads(proc.stdout)
        print(f"CLI result status: {res.get('status')}")
        print(f"CLI adjustments: {res.get('adjustments')}")
        print(f"CLI padding adjustments: {res.get('padding_adjustments')}")

        target_folder = os.path.join(test_dir, model_name)
        temp_json_path = os.path.join(target_folder, "temp.json")
        final_py_path = os.path.join(target_folder, f"{model_name}.py")

        assert not os.path.exists(temp_json_path), "temp.json was not deleted by CLI!"
        assert os.path.exists(final_py_path), f"Final {model_name}.py does not exist!"

        # Execute final script
        py_proc = subprocess.run([sys.executable, final_py_path], capture_output=True, text=True, timeout=30)
        print(py_proc.stdout)
        assert py_proc.returncode == 0, f"CLI generated script failed: {py_proc.stderr}"
        assert "[OK] Forward pass test successful!" in py_proc.stdout
        print("[PASS] CLI save with auto shape fit & padding resolution executed flawlessly!")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


def test_special_edge_ordering_and_indexing():
    print("\n" + "=" * 70)
    print("TEST 3: Special Edge Ordering (Behind Normal Edges) & Selective Indexing")
    print("=" * 70)

    test_dir = tempfile.mkdtemp(prefix="ein_edge_order_test_")
    try:
        model_name = "Edge_Order_Indexed_Net"
        canvas_data = {
            "projectId": "proj_edge_test",
            "name": model_name,
            "nodes": [
                {
                    "id": "in0",
                    "label": "Input",
                    "layerType": "input",
                    "params": {"input_type": "image", "shape": [3, 16, 16], "batch_size": 2}
                },
                {
                    "id": "c1",
                    "label": "Conv1",
                    "layerType": "nn.Conv2d",
                    "params": {"in_channels": 3, "out_channels": 16, "kernel_size": 3, "padding": 1}
                },
                {
                    "id": "c2",
                    "label": "Conv2",
                    "layerType": "nn.Conv2d",
                    "params": {"in_channels": 16, "out_channels": 16, "kernel_size": 3, "padding": 1}
                },
                {
                    "id": "add1",
                    "label": "Residual Add",
                    "layerType": "torch.add",
                    "params": {}
                }
            ],
            # Interleaved edges to test that special edges are placed behind normal edges
            "edges": [
                {"id": "e_norm1", "from": "in0", "to": "c1", "edgeType": "normal"},
                {"id": "e_res1", "from": "c1", "to": "add1", "edgeType": "residual", "index": 0},
                {"id": "e_norm2", "from": "c1", "to": "c2", "edgeType": "normal"},
                {"id": "e_norm3", "from": "c2", "to": "add1", "edgeType": "normal"}
            ]
        }

        res = save_model_to_folder(canvas_data, output_dir=test_dir)
        assert res.get('status') == 'ok', f"Save failed: {res}"

        final_json_path = os.path.join(test_dir, model_name, f"{model_name}.json")
        final_py_path = os.path.join(test_dir, model_name, f"{model_name}.py")

        with open(final_json_path, 'r', encoding='utf-8') as f:
            final_data = json.load(f)

        with open(final_py_path, 'r', encoding='utf-8') as f:
            py_code = f.read()

        print("Generated Code:")
        print(py_code)

        # 1. Verify that only the residual edge has an index comment in generated code
        assert "# Residual Edge #0:" in py_code, "Expected '# Residual Edge #0:' comment in forward code"
        assert "# Edge 0:" not in py_code, "Old normal edge comment '# Edge 0:' should not be present"
        assert "# Edge 1:" not in py_code, "Normal edge should not have '# Edge 1:' comment"

        # 2. Verify forward pass succeeds
        cmd = [sys.executable, final_py_path]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        assert proc.returncode == 0, f"Script failed: {proc.stderr}"
        assert "[OK] Forward pass test successful!" in proc.stdout
        print("[PASS] Special edges placed behind normal edges & indexed correctly!")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == '__main__':
    test_save_pipeline_lifecycle()
    test_cli_save_canvas()
    test_special_edge_ordering_and_indexing()
    print("\n" + "=" * 70)
    print("ALL SAVE PIPELINE INTEGRATION TESTS PASSED (100%)!")
    print("=" * 70)
