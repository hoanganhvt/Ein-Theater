import torch
import torch.nn as nn
import operator

class just_another_day(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.linear_0 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.to(self.device)

    def forward(self, x0, x1, x2):
        # x0: Image, shape: [1, 3, 224, 224], dtype: torch.float32
        # x1: Image, shape: [1, 3, 224, 224], dtype: torch.float32
        # x2: Image, shape: [1, 3, 224, 224], dtype: torch.float32
        linear_0 = self.linear_0(x0)
        return linear_0


# steve once here



if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = just_another_day(device=device)
    print(f"Model 'just_another_day' initialized successfully on {device}:")
    print(model)

    # Sample dummy image input (shape: [1, 3, 224, 224])
    dummy_x0 = torch.randn(1, 3, 224, 224, device=device)
    # Sample dummy image input (shape: [1, 3, 224, 224])
    dummy_x1 = torch.randn(1, 3, 224, 224, device=device)
    # Sample dummy image input (shape: [1, 3, 224, 224])
    dummy_x2 = torch.randn(1, 3, 224, 224, device=device)
    try:
        output = model(dummy_x0, dummy_x1, dummy_x2)
        print("\n[OK] Forward pass test successful!")
        if isinstance(output, torch.Tensor):
            print(f"Output tensor shape: {tuple(output.shape)}")
        elif isinstance(output, (list, tuple)):
            print(f"Output shapes: {[tuple(o.shape) if hasattr(o, 'shape') else type(o) for o in output]}")
    except Exception as e:
        print(f"\n[!] Note: Forward pass test with dummy inputs encountered: {e}")
