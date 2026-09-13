#!/usr/bin/env python3
"""
Test Suite for Auto Shape Size Fit Feature.
Tests 10 diverse neural network architectures from simple 4-layer linear models,
to LeNet, ViT, Transformer, UNet, ResNet with padding auto-fix, 1D Audio CNN,
Unfixable stride/padding warning case, and Multimodal Dual-Input model.

For each case:
  1. Creates model graph JSON with deliberately mismatched/unfitted parameters.
  2. Applies auto_shape_size_fit.
  3. Uses generate_code_from_json to generate standalone PyTorch nn.Module code.
  4. Executes the generated code and performs a live forward pass with dummy tensors.
  5. Asserts correct output shapes and warning behaviors.
"""

import os
import sys
import json
import torch
import importlib.util

# Setup paths
_base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
_gen_code_path = os.path.join(_base_dir, 'src', 'Canvas', 'utils', 'generate code', 'gen_code.py')
_shape_fitter_path = os.path.join(_base_dir, 'src', 'Canvas', 'utils', 'auto shape size fit', 'shape_fitter.py')

# Import gen_code dynamically
spec_gc = importlib.util.spec_from_file_location("gen_code", _gen_code_path)
gen_code = importlib.util.module_from_spec(spec_gc)
spec_gc.loader.exec_module(gen_code)
generate_code_from_json = gen_code.generate_code_from_json

# Import shape_fitter dynamically
spec_sf = importlib.util.spec_from_file_location("shape_fitter", _shape_fitter_path)
shape_fitter = importlib.util.module_from_spec(spec_sf)
spec_sf.loader.exec_module(shape_fitter)
auto_shape_size_fit = shape_fitter.auto_shape_size_fit


def run_and_verify_model(model_name, raw_json, dummy_inputs, expected_output_shape=None, expect_warning=False):
    """
    Helper function to run auto_shape_size_fit, generate PyTorch code,
    execute it, and run a forward pass.
    """
    print(f"\n========================================================")
    print(f"  TEST CASE: {model_name}")
    print(f"========================================================")

    # Step 1: Auto Shape Size Fit
    fit_res = auto_shape_size_fit(raw_json)
    fitted_json = fit_res['model']
    adjustments = fit_res['adjustments']
    padding_adjustments = fit_res['padding_adjustments']
    warnings = fit_res['warnings']
    shapes = fit_res['shapes']

    print(f"[*] Shape Fit Adjustments ({len(adjustments)}):")
    for a in adjustments:
        print(f"    - {a}")
    print(f"[*] Padding Adjustments ({len(padding_adjustments)}):")
    for p in padding_adjustments:
        print(f"    - {p}")
    print(f"[*] Warnings ({len(warnings)}):")
    for w in warnings:
        print(f"    ! {w}")

    if expect_warning:
        assert len(warnings) > 0, f"Expected warnings for {model_name}, but got none."
        print(f"[OK] Successfully caught expected warning for {model_name}.")
        return {
            'status': 'PASSED (Warning Caught as Expected)',
            'adjustments': len(adjustments),
            'padding_adjustments': len(padding_adjustments),
            'warnings': len(warnings),
            'output_shape': 'N/A (Expected Warning)'
        }

    # Step 2: Generate PyTorch AST Code
    py_code = generate_code_from_json(fitted_json, model_name=model_name)
    assert f"class {model_name}(nn.Module):" in py_code

    # Step 3: Execute Generated Python Code
    local_scope = {}
    exec(py_code, local_scope)
    model_cls = local_scope[model_name]
    model_instance = model_cls(device='cpu')
    model_instance.eval()

    # Step 4: Test Forward Pass
    with torch.no_grad():
        if isinstance(dummy_inputs, tuple):
            out = model_instance(*dummy_inputs)
        else:
            out = model_instance(dummy_inputs)

    if isinstance(out, torch.Tensor):
        actual_shape = list(out.shape)
    elif isinstance(out, (list, tuple)):
        actual_shape = [list(o.shape) if hasattr(o, 'shape') else str(type(o)) for o in out]
    else:
        actual_shape = str(type(out))

    print(f"[*] Forward Pass Successful! Output Shape: {actual_shape}")

    if expected_output_shape is not None:
        assert actual_shape == expected_output_shape, f"Shape mismatch! Expected {expected_output_shape}, got {actual_shape}"
        print(f"[OK] Verified output shape matches expected: {expected_output_shape}")

    return {
        'status': 'PASSED',
        'adjustments': len(adjustments),
        'padding_adjustments': len(padding_adjustments),
        'warnings': len(warnings),
        'output_shape': actual_shape
    }


# =====================================================================
# 10 TEST CASE DEFINITIONS
# =====================================================================

def test_case_1_simple_linear_4layer():
    """Case 1: 4-Layer Linear with mismatched in_features throughout."""
    raw_json = {
        "metadata": {"name": "SimpleLinear4Layer", "input_type": "raw data", "input_shape": [64]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [64], "input_type": "raw data"}},
            {"id": "fc1", "op": "call_module", "type": "nn.Linear", "target": "fc1", "inputs": ["x"], "args_str": "x", "params": {"in_features": 999, "out_features": 128, "bias": True}},
            {"id": "relu1", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc1"], "args_str": "fc1", "params": {}},
            {"id": "fc2", "op": "call_module", "type": "nn.Linear", "target": "fc2", "inputs": ["relu1"], "args_str": "relu1", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "relu2", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc2"], "args_str": "fc2", "params": {}},
            {"id": "fc3", "op": "call_module", "type": "nn.Linear", "target": "fc3", "inputs": ["relu2"], "args_str": "relu2", "params": {"in_features": 999, "out_features": 32, "bias": True}},
            {"id": "relu3", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc3"], "args_str": "fc3", "params": {}},
            {"id": "fc4", "op": "call_module", "type": "nn.Linear", "target": "fc4", "inputs": ["relu3"], "args_str": "relu3", "params": {"in_features": 999, "out_features": 10, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["fc4"], "args_str": "fc4", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 64)
    return run_and_verify_model("SimpleLinear4Layer", raw_json, dummy_x, expected_output_shape=[1, 10])


def test_case_2_lenet5():
    """Case 2: LeNet-5 Architecture with Conv2d, MaxPool, Flatten, and Linear."""
    raw_json = {
        "metadata": {"name": "LeNet5", "input_type": "image", "input_shape": [1, 28, 28]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [1, 28, 28], "input_type": "image"}},
            {"id": "c1", "op": "call_module", "type": "nn.Conv2d", "target": "c1", "inputs": ["x"], "args_str": "x", "params": {"in_channels": 999, "out_channels": 6, "kernel_size": 5, "stride": 1, "padding": 2, "bias": True}},
            {"id": "relu1", "op": "call_function", "type": "function", "target": "relu", "inputs": ["c1"], "args_str": "c1", "params": {}},
            {"id": "pool1", "op": "call_module", "type": "nn.MaxPool2d", "target": "pool1", "inputs": ["relu1"], "args_str": "relu1", "params": {"kernel_size": 2, "stride": 2}},
            {"id": "c2", "op": "call_module", "type": "nn.Conv2d", "target": "c2", "inputs": ["pool1"], "args_str": "pool1", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 5, "stride": 1, "padding": 0, "bias": True}},
            {"id": "relu2", "op": "call_function", "type": "function", "target": "relu", "inputs": ["c2"], "args_str": "c2", "params": {}},
            {"id": "pool2", "op": "call_module", "type": "nn.MaxPool2d", "target": "pool2", "inputs": ["relu2"], "args_str": "relu2", "params": {"kernel_size": 2, "stride": 2}},
            {"id": "flat", "op": "call_function", "type": "function", "target": "flatten", "inputs": ["pool2"], "args_str": "pool2, 1", "params": {}},
            {"id": "fc1", "op": "call_module", "type": "nn.Linear", "target": "fc1", "inputs": ["flat"], "args_str": "flat", "params": {"in_features": 999, "out_features": 120, "bias": True}},
            {"id": "relu3", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc1"], "args_str": "fc1", "params": {}},
            {"id": "fc2", "op": "call_module", "type": "nn.Linear", "target": "fc2", "inputs": ["relu3"], "args_str": "relu3", "params": {"in_features": 999, "out_features": 84, "bias": True}},
            {"id": "relu4", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc2"], "args_str": "fc2", "params": {}},
            {"id": "fc3", "op": "call_module", "type": "nn.Linear", "target": "fc3", "inputs": ["relu4"], "args_str": "relu4", "params": {"in_features": 999, "out_features": 10, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["fc3"], "args_str": "fc3", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 1, 28, 28)
    return run_and_verify_model("LeNet5", raw_json, dummy_x, expected_output_shape=[1, 10])


def test_case_3_vit_block():
    """Case 3: Vision Transformer (ViT) Block with Conv2d patch embedding, attention, and MLP."""
    raw_json = {
        "metadata": {"name": "VisionTransformerBlock", "input_type": "image", "input_shape": [3, 32, 32]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [3, 32, 32], "input_type": "image"}},
            {"id": "patch_embed", "op": "call_module", "type": "nn.Conv2d", "target": "patch_embed", "inputs": ["x"], "args_str": "x", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 4, "stride": 4, "padding": 0, "bias": True}},
            {"id": "flat", "op": "call_method", "type": "method", "target": "flatten", "inputs": ["patch_embed"], "args_str": "patch_embed, 2", "params": {}},
            {"id": "trans", "op": "call_method", "type": "method", "target": "transpose", "inputs": ["flat"], "args_str": "flat, 1, 2", "params": {}},
            {"id": "attn", "op": "call_module", "type": "nn.MultiheadAttention", "target": "attn", "inputs": ["trans"], "args_str": "trans, trans, trans", "params": {"embed_dim": 999, "num_heads": 4}},
            {"id": "get_attn", "op": "call_function", "type": "function", "target": "getitem", "inputs": ["attn"], "args_str": "attn, 0", "params": {}},
            {"id": "res1", "op": "call_function", "type": "function", "target": "add", "inputs": ["trans", "get_attn"], "args_str": "trans, get_attn", "params": {}},
            {"id": "norm1", "op": "call_module", "type": "nn.LayerNorm", "target": "norm1", "inputs": ["res1"], "args_str": "res1", "params": {"normalized_shape": 999}},
            {"id": "mlp1", "op": "call_module", "type": "nn.Linear", "target": "mlp1", "inputs": ["norm1"], "args_str": "norm1", "params": {"in_features": 999, "out_features": 32, "bias": True}},
            {"id": "relu", "op": "call_function", "type": "function", "target": "relu", "inputs": ["mlp1"], "args_str": "mlp1", "params": {}},
            {"id": "mlp2", "op": "call_module", "type": "nn.Linear", "target": "mlp2", "inputs": ["relu"], "args_str": "relu", "params": {"in_features": 999, "out_features": 16, "bias": True}},
            {"id": "res2", "op": "call_function", "type": "function", "target": "add", "inputs": ["res1", "mlp2"], "args_str": "res1, mlp2", "params": {}},
            {"id": "mean_pool", "op": "call_method", "type": "method", "target": "mean", "inputs": ["res2"], "args_str": "res2, dim=1", "params": {}},
            {"id": "head", "op": "call_module", "type": "nn.Linear", "target": "head", "inputs": ["mean_pool"], "args_str": "mean_pool", "params": {"in_features": 999, "out_features": 10, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["head"], "args_str": "head", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 3, 32, 32)
    return run_and_verify_model("VisionTransformerBlock", raw_json, dummy_x, expected_output_shape=[1, 10])


def test_case_4_transformer_encoder():
    """Case 4: Transformer Encoder Layer with Embedding, MultiheadAttention, and LayerNorm."""
    raw_json = {
        "metadata": {"name": "TransformerEncoderLayer", "input_type": "text", "input_shape": [128]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [128], "input_type": "text", "dtype": "int64"}},
            {"id": "tok_emb", "op": "call_module", "type": "nn.Embedding", "target": "tok_emb", "inputs": ["x"], "args_str": "x", "params": {"num_embeddings": 1000, "embedding_dim": 64}},
            {"id": "attn", "op": "call_module", "type": "nn.MultiheadAttention", "target": "attn", "inputs": ["tok_emb"], "args_str": "tok_emb, tok_emb, tok_emb", "params": {"embed_dim": 999, "num_heads": 8}},
            {"id": "get_attn", "op": "call_function", "type": "function", "target": "getitem", "inputs": ["attn"], "args_str": "attn, 0", "params": {}},
            {"id": "res1", "op": "call_function", "type": "function", "target": "add", "inputs": ["tok_emb", "get_attn"], "args_str": "tok_emb, get_attn", "params": {}},
            {"id": "ln1", "op": "call_module", "type": "nn.LayerNorm", "target": "ln1", "inputs": ["res1"], "args_str": "res1", "params": {"normalized_shape": 999}},
            {"id": "fc1", "op": "call_module", "type": "nn.Linear", "target": "fc1", "inputs": ["ln1"], "args_str": "ln1", "params": {"in_features": 999, "out_features": 256, "bias": True}},
            {"id": "relu", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc1"], "args_str": "fc1", "params": {}},
            {"id": "fc2", "op": "call_module", "type": "nn.Linear", "target": "fc2", "inputs": ["relu"], "args_str": "relu", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "res2", "op": "call_function", "type": "function", "target": "add", "inputs": ["ln1", "fc2"], "args_str": "ln1, fc2", "params": {}},
            {"id": "ln2", "op": "call_module", "type": "nn.LayerNorm", "target": "ln2", "inputs": ["res2"], "args_str": "res2", "params": {"normalized_shape": 999}},
            {"id": "head", "op": "call_module", "type": "nn.Linear", "target": "head", "inputs": ["ln2"], "args_str": "ln2", "params": {"in_features": 999, "out_features": 10, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["head"], "args_str": "head", "params": {}}
        ]
    }
    dummy_x = torch.randint(0, 1000, (1, 128))
    return run_and_verify_model("TransformerEncoderLayer", raw_json, dummy_x, expected_output_shape=[1, 128, 10])


def test_case_5_unet():
    """Case 5: U-Net Architecture with Conv, MaxPool, ConvTranspose, and Concat."""
    raw_json = {
        "metadata": {"name": "UNetModel", "input_type": "image", "input_shape": [1, 16, 16]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [1, 16, 16], "input_type": "image"}},
            {"id": "c1", "op": "call_module", "type": "nn.Conv2d", "target": "c1", "inputs": ["x"], "args_str": "x", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 3, "stride": 1, "padding": 1, "bias": True}},
            {"id": "relu1", "op": "call_function", "type": "function", "target": "relu", "inputs": ["c1"], "args_str": "c1", "params": {}},
            {"id": "c2", "op": "call_module", "type": "nn.Conv2d", "target": "c2", "inputs": ["relu1"], "args_str": "relu1", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 3, "stride": 1, "padding": 1, "bias": True}},
            {"id": "relu2", "op": "call_function", "type": "function", "target": "relu", "inputs": ["c2"], "args_str": "c2", "params": {}},
            {"id": "pool", "op": "call_module", "type": "nn.MaxPool2d", "target": "pool", "inputs": ["relu2"], "args_str": "relu2", "params": {"kernel_size": 2, "stride": 2}},
            {"id": "up", "op": "call_module", "type": "nn.ConvTranspose2d", "target": "up", "inputs": ["pool"], "args_str": "pool", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 2, "stride": 2, "padding": 0, "bias": True}},
            {"id": "cat", "op": "call_function", "type": "function", "target": "cat", "inputs": ["up", "relu2"], "args_str": "[up, relu2], dim=1", "params": {"dim": 1}},
            {"id": "out_conv", "op": "call_module", "type": "nn.Conv2d", "target": "out_conv", "inputs": ["cat"], "args_str": "cat", "params": {"in_channels": 999, "out_channels": 1, "kernel_size": 1, "stride": 1, "padding": 0, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["out_conv"], "args_str": "out_conv", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 1, 16, 16)
    return run_and_verify_model("UNetModel", raw_json, dummy_x, expected_output_shape=[1, 1, 16, 16])


def test_case_6_deep_linear_chain():
    """Case 6: Deep 8-Layer Linear Chain from model_j_do with sequential mismatched layers."""
    raw_json = {
        "metadata": {"name": "DeepLinearChain8", "input_type": "raw data", "input_shape": [128]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [128], "input_type": "raw data"}},
            {"id": "l0", "op": "call_module", "type": "nn.Linear", "target": "l0", "inputs": ["x"], "args_str": "x", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l1", "op": "call_module", "type": "nn.Linear", "target": "l1", "inputs": ["l0"], "args_str": "l0", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l2", "op": "call_module", "type": "nn.Linear", "target": "l2", "inputs": ["l1"], "args_str": "l1", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l3", "op": "call_module", "type": "nn.Linear", "target": "l3", "inputs": ["l2"], "args_str": "l2", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l4", "op": "call_module", "type": "nn.Linear", "target": "l4", "inputs": ["l3"], "args_str": "l3", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l5", "op": "call_module", "type": "nn.Linear", "target": "l5", "inputs": ["l4"], "args_str": "l4", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l6", "op": "call_module", "type": "nn.Linear", "target": "l6", "inputs": ["l5"], "args_str": "l5", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            {"id": "l7", "op": "call_module", "type": "nn.Linear", "target": "l7", "inputs": ["l6"], "args_str": "l6", "params": {"in_features": 999, "out_features": 10, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["l7"], "args_str": "l7", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 128)
    return run_and_verify_model("DeepLinearChain8", raw_json, dummy_x, expected_output_shape=[1, 10])


def test_case_7_resnet_padding_autofix():
    """Case 7: ResNet Residual block where main branch has padding=0 (30x30) vs skip branch (32x32).
    Auto shape fit MUST solve and adjust padding from 0 to 1 to match spatial sizes!"""
    raw_json = {
        "metadata": {"name": "ResNetPaddingAutoFix", "input_type": "image", "input_shape": [16, 32, 32]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [16, 32, 32], "input_type": "image"}},
            # Main branch with padding=0 (would reduce 32x32 to 30x30, breaking skip addition)
            {"id": "c1", "op": "call_module", "type": "nn.Conv2d", "target": "c1", "inputs": ["x"], "args_str": "x", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 3, "stride": 1, "padding": 0, "bias": True}},
            {"id": "bn1", "op": "call_module", "type": "nn.BatchNorm2d", "target": "bn1", "inputs": ["c1"], "args_str": "c1", "params": {"num_features": 999}},
            {"id": "relu1", "op": "call_function", "type": "function", "target": "relu", "inputs": ["bn1"], "args_str": "bn1", "params": {}},
            # Skip connection addition: x (32x32) + relu1 (30x30 if unfixed, 32x32 if fixed)
            {"id": "add", "op": "call_function", "type": "function", "target": "add", "inputs": ["x", "relu1"], "args_str": "x, relu1", "params": {}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["add"], "args_str": "add", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 16, 32, 32)
    return run_and_verify_model("ResNetPaddingAutoFix", raw_json, dummy_x, expected_output_shape=[1, 16, 32, 32])


def test_case_8_audio_1d_cnn():
    """Case 8: 1D Audio CNN with Conv1d, MaxPool1d, AdaptiveAvgPool1d, and Linear."""
    raw_json = {
        "metadata": {"name": "Audio1DCNN", "input_type": "audio", "input_shape": [1, 16000]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [1, 16000], "input_type": "audio"}},
            {"id": "c1", "op": "call_module", "type": "nn.Conv1d", "target": "c1", "inputs": ["x"], "args_str": "x", "params": {"in_channels": 999, "out_channels": 32, "kernel_size": 10, "stride": 2, "padding": 4, "bias": True}},
            {"id": "pool1", "op": "call_module", "type": "nn.MaxPool1d", "target": "pool1", "inputs": ["c1"], "args_str": "c1", "params": {"kernel_size": 4, "stride": 4}},
            {"id": "c2", "op": "call_module", "type": "nn.Conv1d", "target": "c2", "inputs": ["pool1"], "args_str": "pool1", "params": {"in_channels": 999, "out_channels": 64, "kernel_size": 5, "stride": 1, "padding": 2, "bias": True}},
            {"id": "adap_pool", "op": "call_module", "type": "nn.AdaptiveAvgPool1d", "target": "adap_pool", "inputs": ["c2"], "args_str": "c2", "params": {"output_size": 1}},
            {"id": "flat", "op": "call_function", "type": "function", "target": "flatten", "inputs": ["adap_pool"], "args_str": "adap_pool, 1", "params": {}},
            {"id": "fc", "op": "call_module", "type": "nn.Linear", "target": "fc", "inputs": ["flat"], "args_str": "flat", "params": {"in_features": 999, "out_features": 10, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["fc"], "args_str": "fc", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 1, 16000)
    return run_and_verify_model("Audio1DCNN", raw_json, dummy_x, expected_output_shape=[1, 10])


def test_case_9_unfixable_warning():
    """Case 9: Unfixable spatial mismatch where stride=2 creates a dimension that integer padding cannot fix.
    Auto shape fit must generate an explicit user warning!"""
    raw_json = {
        "metadata": {"name": "UnfixableWarningCase", "input_type": "image", "input_shape": [16, 16, 16]},
        "nodes": [
            {"id": "x", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [16, 16, 16], "input_type": "image"}},
            # Branch with stride=2 downsamples to 7x7 (kernel=3, stride=2, padding=0)
            {"id": "conv_stride", "op": "call_module", "type": "nn.Conv2d", "target": "conv_stride", "inputs": ["x"], "args_str": "x", "params": {"in_channels": 16, "out_channels": 16, "kernel_size": 3, "stride": 2, "padding": 0, "bias": True}},
            # Attempt to add 16x16 with 7x7 without adapter
            {"id": "add", "op": "call_function", "type": "function", "target": "add", "inputs": ["x", "conv_stride"], "args_str": "x, conv_stride", "params": {}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["add"], "args_str": "add", "params": {}}
        ]
    }
    dummy_x = torch.randn(1, 16, 16, 16)
    return run_and_verify_model("UnfixableWarningCase", raw_json, dummy_x, expect_warning=True)


def test_case_10_multimodal_dual_input():
    """Case 10: Multimodal dual-input model (Image branch + Tabular branch fused via Concat)."""
    raw_json = {
        "metadata": {"name": "MultimodalFusionModel", "device": "cpu"},
        "nodes": [
            {"id": "img_in", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [3, 32, 32], "input_type": "image"}},
            {"id": "tab_in", "op": "placeholder", "type": "input", "inputs": [], "params": {"shape": [20], "input_type": "raw data"}},
            # Image branch
            {"id": "conv_img", "op": "call_module", "type": "nn.Conv2d", "target": "conv_img", "inputs": ["img_in"], "args_str": "img_in", "params": {"in_channels": 999, "out_channels": 16, "kernel_size": 3, "stride": 1, "padding": 1, "bias": True}},
            {"id": "pool_img", "op": "call_module", "type": "nn.MaxPool2d", "target": "pool_img", "inputs": ["conv_img"], "args_str": "conv_img", "params": {"kernel_size": 2, "stride": 2}},
            {"id": "flat_img", "op": "call_function", "type": "function", "target": "flatten", "inputs": ["pool_img"], "args_str": "pool_img, 1", "params": {}},
            {"id": "fc_img", "op": "call_module", "type": "nn.Linear", "target": "fc_img", "inputs": ["flat_img"], "args_str": "flat_img", "params": {"in_features": 999, "out_features": 64, "bias": True}},
            # Tabular branch
            {"id": "fc_tab", "op": "call_module", "type": "nn.Linear", "target": "fc_tab", "inputs": ["tab_in"], "args_str": "tab_in", "params": {"in_features": 999, "out_features": 32, "bias": True}},
            # Multimodal concatenation (64 + 32 = 96)
            {"id": "cat_fuse", "op": "call_function", "type": "function", "target": "cat", "inputs": ["fc_img", "fc_tab"], "args_str": "[fc_img, fc_tab], dim=1", "params": {"dim": 1}},
            {"id": "fc_fuse", "op": "call_module", "type": "nn.Linear", "target": "fc_fuse", "inputs": ["cat_fuse"], "args_str": "cat_fuse", "params": {"in_features": 999, "out_features": 32, "bias": True}},
            {"id": "relu", "op": "call_function", "type": "function", "target": "relu", "inputs": ["fc_fuse"], "args_str": "fc_fuse", "params": {}},
            {"id": "fc_out", "op": "call_module", "type": "nn.Linear", "target": "fc_out", "inputs": ["relu"], "args_str": "relu", "params": {"in_features": 999, "out_features": 2, "bias": True}},
            {"id": "output", "op": "output", "type": "output", "inputs": ["fc_out"], "args_str": "fc_out", "params": {}}
        ]
    }
    dummy_img = torch.randn(1, 3, 32, 32)
    dummy_tab = torch.randn(1, 20)
    return run_and_verify_model("MultimodalFusionModel", raw_json, (dummy_img, dummy_tab), expected_output_shape=[1, 2])


def main():
    print("#####################################################################")
    print("##  RUNNING 10 AUTO SHAPE SIZE FIT COMPREHENSIVE TEST CASES       ##")
    print("#####################################################################")

    tests = [
        ("Case 1: Simple 4-Layer Linear", test_case_1_simple_linear_4layer),
        ("Case 2: LeNet-5 Architecture", test_case_2_lenet5),
        ("Case 3: Vision Transformer Block", test_case_3_vit_block),
        ("Case 4: Transformer Encoder Layer", test_case_4_transformer_encoder),
        ("Case 5: U-Net Architecture", test_case_5_unet),
        ("Case 6: Deep 8-Layer Linear Chain", test_case_6_deep_linear_chain),
        ("Case 7: ResNet Padding Auto-Fix", test_case_7_resnet_padding_autofix),
        ("Case 8: 1D Audio CNN", test_case_8_audio_1d_cnn),
        ("Case 9: Unfixable Stride/Padding Warning", test_case_9_unfixable_warning),
        ("Case 10: Multimodal Dual-Input Model", test_case_10_multimodal_dual_input),
    ]

    results = {}
    passed = 0

    for name, test_fn in tests:
        try:
            res = test_fn()
            results[name] = res
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name} encountered error: {e}")
            import traceback
            traceback.print_exc()
            results[name] = {'status': f'FAILED: {e}'}

    print("\n\n" + "=" * 70)
    print("              AUTO SHAPE SIZE FIT - TEST SUMMARY REPORT")
    print("=" * 70)
    print(f"Total Test Cases: {len(tests)}")
    print(f"Passed: {passed} / {len(tests)} ({passed / len(tests) * 100:.1f}%)")
    print("-" * 70)
    print(f"{'Test Case':<42} | {'Status':<12} | {'Adjust':<6} | {'PadAdj':<6} | {'Warn':<4}")
    print("-" * 70)
    for name, r in results.items():
        st = "PASS" if "PASSED" in r.get('status', '') else "FAIL"
        adj = r.get('adjustments', '-')
        pad = r.get('padding_adjustments', '-')
        warn = r.get('warnings', '-')
        print(f"{name:<42} | {st:<12} | {adj:<6} | {pad:<6} | {warn:<4}")
    print("=" * 70)

    # Save summary report to JSON
    report_path = os.path.join(os.path.dirname(__file__), 'test_results.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved test report to {report_path}")

    assert passed == len(tests), f"Only {passed}/{len(tests)} tests passed."


if __name__ == '__main__':
    main()
