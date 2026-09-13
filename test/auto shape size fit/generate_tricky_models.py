#!/usr/bin/env python3
"""
Generator & Verifier for Tricky-Shaped Test Models.
Uses the generate code tracer (model_to_json_graph) to create raw graph JSONs,
injects tricky and mismatched dimensions (odd prime spatial sizes, rectangular patches,
unfitted channels/features, dilation, and skip padding mismatches), saves them
into test/auto shape size fit/test shape fit/, and validates that auto_shape_size_fit
fits every parameter and produces 100% working PyTorch models.
"""

import os
import sys
import json
import torch
import torch.nn as nn
import importlib.util

# Paths
_base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
_gen_code_path = os.path.join(_base_dir, 'src', 'Canvas', 'utils', 'generate code', 'gen_code.py')
_shape_fitter_path = os.path.join(_base_dir, 'src', 'Canvas', 'utils', 'auto shape size fit', 'shape_fitter.py')
_test_models_dir = os.path.join(_base_dir, 'test', 'auto shape size fit', 'test shape fit')

# Dynamic imports
spec_gc = importlib.util.spec_from_file_location("gen_code", _gen_code_path)
gen_code = importlib.util.module_from_spec(spec_gc)
spec_gc.loader.exec_module(gen_code)
model_to_json_graph = gen_code.model_to_json_graph
generate_code_from_json = gen_code.generate_code_from_json

spec_sf = importlib.util.spec_from_file_location("shape_fitter", _shape_fitter_path)
shape_fitter = importlib.util.module_from_spec(spec_sf)
spec_sf.loader.exec_module(shape_fitter)
auto_shape_size_fit = shape_fitter.auto_shape_size_fit


# =====================================================================
# PYTORCH MODEL DEFINITIONS FOR TRACING
# =====================================================================

class TrickyUNet(nn.Module):
    """Deep 2-level U-Net with rectangular dimensions (36x48) and multiple skip concatenations."""
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 16, 3, padding=1)
        self.c2 = nn.Conv2d(16, 16, 3, padding=1)
        self.p1 = nn.MaxPool2d(2, 2)
        self.c3 = nn.Conv2d(16, 32, 3, padding=1)
        self.p2 = nn.MaxPool2d(2, 2)
        self.bneck = nn.Conv2d(32, 64, 3, padding=1)
        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.c_up1 = nn.Conv2d(64, 32, 3, padding=1)
        self.up2 = nn.ConvTranspose2d(32, 16, 2, stride=2)
        self.c_up2 = nn.Conv2d(32, 16, 3, padding=1)
        self.out = nn.Conv2d(16, 1, 1)

    def forward(self, x):
        e1 = torch.relu(self.c1(x))
        e1 = torch.relu(self.c2(e1))
        p1 = self.p1(e1)
        e2 = torch.relu(self.c3(p1))
        p2 = self.p2(e2)
        b = torch.relu(self.bneck(p2))
        u1 = self.up1(b)
        cat1 = torch.cat([u1, e2], dim=1)
        d1 = torch.relu(self.c_up1(cat1))
        u2 = self.up2(d1)
        cat2 = torch.cat([u2, e1], dim=1)
        d2 = torch.relu(self.c_up2(cat2))
        return self.out(d2)


class TrickyTransformer(nn.Module):
    """Transformer with odd sequence length 63, non-power-of-2 embed_dim 72, and 2 encoder blocks."""
    def __init__(self):
        super().__init__()
        self.emb = nn.Embedding(3500, 72)
        self.attn1 = nn.MultiheadAttention(72, 6)
        self.ln1 = nn.LayerNorm(72)
        self.fc1 = nn.Linear(72, 288)
        self.fc2 = nn.Linear(288, 72)
        self.ln2 = nn.LayerNorm(72)
        self.attn2 = nn.MultiheadAttention(72, 8)
        self.ln3 = nn.LayerNorm(72)
        self.head = nn.Linear(72, 10)

    def forward(self, x):
        h = self.emb(x)
        a1, _ = self.attn1(h, h, h)
        h = self.ln1(h + a1)
        f1 = self.fc2(torch.relu(self.fc1(h)))
        h = self.ln2(h + f1)
        a2, _ = self.attn2(h, h, h)
        h = self.ln3(h + a2)
        return self.head(h)


class TrickyViT(nn.Module):
    """Vision Transformer with rectangular input (40x56) yielding 140 tokens."""
    def __init__(self):
        super().__init__()
        self.patch = nn.Conv2d(3, 48, kernel_size=4, stride=4)
        self.attn = nn.MultiheadAttention(48, 4)
        self.ln = nn.LayerNorm(48)
        self.mlp1 = nn.Linear(48, 192)
        self.mlp2 = nn.Linear(192, 48)
        self.head = nn.Linear(48, 25)

    def forward(self, x):
        p = self.patch(x)
        t = p.flatten(2).transpose(1, 2)
        a, _ = self.attn(t, t, t)
        h = self.ln(t + a)
        m = self.mlp2(torch.relu(self.mlp1(h)))
        h = h + m
        return self.head(h.mean(dim=1))


class TrickyLeNet(nn.Module):
    """LeNet with prime spatial dimensions (37x43) and dilated convolutions."""
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 8, kernel_size=5)
        self.p1 = nn.MaxPool2d(2, 2)
        self.c2 = nn.Conv2d(8, 16, kernel_size=3, dilation=2)
        self.p2 = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(672, 120)
        self.fc2 = nn.Linear(120, 84)
        self.fc3 = nn.Linear(84, 17)

    def forward(self, x):
        x = torch.relu(self.c1(x))
        x = self.p1(x)
        x = torch.relu(self.c2(x))
        x = self.p2(x)
        x = torch.flatten(x, 1)
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return self.fc3(x)


class TrickyInception(nn.Module):
    """Multi-branch block with odd spatial size 31x31 and intentional padding mismatches."""
    def __init__(self):
        super().__init__()
        self.b1 = nn.Conv2d(16, 16, 1)
        self.b2 = nn.Conv2d(16, 16, 3, padding=1)
        self.b3 = nn.Conv2d(16, 16, 5, padding=2)
        self.out_conv = nn.Conv2d(48, 10, 1)

    def forward(self, x):
        x1 = torch.relu(self.b1(x))
        x2 = torch.relu(self.b2(x))
        x3 = torch.relu(self.b3(x))
        cat = torch.cat([x1, x2, x3], dim=1)
        return self.out_conv(cat)


class TrickyConvNeXt(nn.Module):
    """ConvNeXt-style block with 7x7 depthwise conv, BatchNorm, and residual add with padding auto-fix."""
    def __init__(self):
        super().__init__()
        self.dw = nn.Conv2d(24, 24, kernel_size=7, padding=3, groups=24)
        self.norm = nn.BatchNorm2d(24)
        self.pw1 = nn.Conv2d(24, 96, 1)
        self.pw2 = nn.Conv2d(96, 24, 1)

    def forward(self, x):
        res = x
        dw = torch.relu(self.norm(self.dw(x)))
        x = x + dw
        x = torch.relu(self.pw1(x))
        x = self.pw2(x)
        return x


# =====================================================================
# BUILD & CORRUPT GRAPH JSONS
# =====================================================================

def create_and_corrupt_model(model_cls, model_name, input_shape, input_type, corruptions):
    """
    Traces PyTorch model class to JSON using gen_code.model_to_json_graph,
    injects tricky corruptions, saves to disk, runs auto_shape_size_fit,
    synthesizes code, and executes forward pass with tricky inputs.
    """
    print(f"\n==================================================================")
    print(f"  BUILDING & TESTING TRICKY MODEL: {model_name}")
    print(f"==================================================================")

    # 1. Trace model using generate code tracer
    raw_json_str = model_to_json_graph(model_cls)
    model_data = json.loads(raw_json_str)

    # Set metadata
    model_data['metadata']['name'] = model_name
    model_data['metadata']['input_type'] = input_type
    model_data['metadata']['input_shape'] = input_shape

    # Set placeholder shape
    for node in model_data['nodes']:
        if node['op'] == 'placeholder':
            node['params']['shape'] = input_shape
            node['params']['input_type'] = input_type

    # 2. Inject tricky corruptions
    for nid, corrupted_params in corruptions.items():
        for node in model_data['nodes']:
            if node['id'] == nid or node.get('target') == nid:
                for k, v in corrupted_params.items():
                    node['params'][k] = v

    # 3. Save corrupted JSON to test shape fit directory
    model_dir = os.path.join(_test_models_dir, model_name)
    os.makedirs(model_dir, exist_ok=True)
    json_path = os.path.join(model_dir, f"{model_name}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(model_data, f, indent=2)
    print(f"[+] Saved tricky JSON to: {json_path}")

    # 4. Run auto_shape_size_fit
    fit_res = auto_shape_size_fit(model_data)
    fitted_json = fit_res['model']
    adjustments = fit_res['adjustments']
    pad_adjustments = fit_res['padding_adjustments']
    warnings = fit_res['warnings']

    print(f"[*] Adjustments ({len(adjustments)}):")
    for a in adjustments:
        print(f"    - {a}")
    print(f"[*] Padding Adjustments ({len(pad_adjustments)}):")
    for p in pad_adjustments:
        print(f"    - {p}")
    print(f"[*] Warnings ({len(warnings)}):")
    for w in warnings:
        print(f"    ! {w}")

    # 5. Generate Code with generate code engine
    gen_py_code = generate_code_from_json(fitted_json, model_name=model_name)
    py_path = os.path.join(model_dir, f"{model_name}.py")
    with open(py_path, 'w', encoding='utf-8') as f:
        f.write(gen_py_code)
    print(f"[+] Saved generated code to: {py_path}")

    # 6. Execute generated code and perform live forward pass
    local_scope = {}
    exec(gen_py_code, local_scope)
    gen_cls = local_scope[model_name]
    model_inst = gen_cls(device='cpu')
    model_inst.eval()

    # Generate tricky dummy input
    batch_size = 1
    if input_type == 'text':
        dummy_x = torch.randint(0, 1000, (batch_size, *input_shape))
    else:
        dummy_x = torch.randn(batch_size, *input_shape)

    with torch.no_grad():
        out = model_inst(dummy_x)

    out_shape = list(out.shape) if hasattr(out, 'shape') else str(type(out))
    print(f"[OK] Forward pass successful with tricky input {input_shape} -> output shape: {out_shape}")

    return {
        'model_name': model_name,
        'input_shape': input_shape,
        'output_shape': out_shape,
        'adjustments': len(adjustments),
        'padding_adjustments': len(pad_adjustments),
        'warnings': len(warnings),
        'status': 'PASSED'
    }


def main():
    print("#####################################################################")
    print("##  GENERATING & VERIFYING TRICKY-SHAPED NEURAL NETWORK JSONS     ##")
    print("#####################################################################")

    suite = [
        # 1. Tricky U-Net with rectangular (36x48) input, multiple skip concats, and corrupted in_channels
        (
            TrickyUNet,
            "tricky_unet",
            [1, 36, 48],
            "image",
            {
                "c1": {"in_channels": 999},
                "c2": {"in_channels": 999},
                "c3": {"in_channels": 999},
                "bneck": {"in_channels": 999},
                "up1": {"in_channels": 999},
                "c_up1": {"in_channels": 999},
                "up2": {"in_channels": 999},
                "c_up2": {"in_channels": 999},
                "out": {"in_channels": 999},
            }
        ),
        # 2. Tricky Transformer with sequence length 63, embed_dim 72, and corrupted embed_dim / in_features
        (
            TrickyTransformer,
            "tricky_transformer",
            [63],
            "text",
            {
                "attn1": {"embed_dim": 999},
                "ln1": {"normalized_shape": 999},
                "fc1": {"in_features": 999},
                "fc2": {"in_features": 999},
                "ln2": {"normalized_shape": 999},
                "attn2": {"embed_dim": 999},
                "ln3": {"normalized_shape": 999},
                "head": {"in_features": 999},
            }
        ),
        # 3. Tricky ViT with rectangular (40x56) input, 140 tokens, and corrupted patch conv / attention
        (
            TrickyViT,
            "tricky_vit",
            [3, 40, 56],
            "image",
            {
                "patch": {"in_channels": 999},
                "attn": {"embed_dim": 999},
                "ln": {"normalized_shape": 999},
                "mlp1": {"in_features": 999},
                "mlp2": {"in_features": 999},
                "head": {"in_features": 999},
            }
        ),
        # 4. Tricky LeNet with prime (37x43) input, dilated conv, and exact flattened dimension 672
        (
            TrickyLeNet,
            "tricky_lenet",
            [1, 37, 43],
            "image",
            {
                "c1": {"in_channels": 999},
                "c2": {"in_channels": 999},
                "fc1": {"in_features": 999},
                "fc2": {"in_features": 999},
                "fc3": {"in_features": 999},
            }
        ),
        # 5. Tricky Inception with 31x31 input, multi-branch padding mismatches (0 vs 1 vs 2)
        (
            TrickyInception,
            "tricky_inception",
            [16, 31, 31],
            "image",
            {
                "b1": {"in_channels": 999},
                "b2": {"in_channels": 999, "padding": 0},  # Mismatched padding (0 instead of 1)
                "b3": {"in_channels": 999, "padding": 0},  # Mismatched padding (0 instead of 2)
                "out_conv": {"in_channels": 999},
            }
        ),
        # 6. Tricky ConvNeXt with 7x7 depthwise conv and residual addition padding mismatch
        (
            TrickyConvNeXt,
            "tricky_convnext",
            [24, 28, 28],
            "image",
            {
                "dw": {"in_channels": 999, "padding": 0},  # Mismatched padding (0 instead of 3)
                "norm": {"num_features": 999},
                "pw1": {"in_channels": 999},
                "pw2": {"in_channels": 999},
            }
        ),
    ]

    results = []
    passed = 0

    for model_cls, name, in_shape, in_type, corruptions in suite:
        try:
            r = create_and_corrupt_model(model_cls, name, in_shape, in_type, corruptions)
            results.append(r)
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name} encountered error: {e}")
            import traceback
            traceback.print_exc()
            results.append({'model_name': name, 'status': f'FAILED: {e}'})

    print("\n\n" + "=" * 76)
    print("             TRICKY SHAPES TEST SUMMARY REPORT")
    print("=" * 76)
    print(f"Total Tricky Models: {len(suite)}")
    print(f"Passed: {passed} / {len(suite)} ({passed / len(suite) * 100:.1f}%)")
    print("-" * 76)
    print(f"{'Model Name':<20} | {'Input Shape':<14} | {'Output Shape':<14} | {'Adj':<4} | {'Pad':<4} | {'Status'}")
    print("-" * 76)
    for r in results:
        mname = r.get('model_name', '')
        in_s = str(r.get('input_shape', ''))
        out_s = str(r.get('output_shape', ''))
        adj = str(r.get('adjustments', ''))
        pad = str(r.get('padding_adjustments', ''))
        st = r.get('status', '')
        print(f"{mname:<20} | {in_s:<14} | {out_s:<14} | {adj:<4} | {pad:<4} | {st}")
    print("=" * 76)

    assert passed == len(suite), f"Only {passed}/{len(suite)} tricky models passed."


if __name__ == '__main__':
    main()
