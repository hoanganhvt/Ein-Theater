import torch
import torch.nn as nn
import operator

class another_nigga(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.linear_1 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_2 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_3 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_4 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_5 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_6 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_0 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.to(self.device)

    def forward(self, x0):
        # x0: Image, shape: [1, 3, 224, 224], dtype: torch.float32
        pass


# steve once here



if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = another_nigga(device=device)
    print(f"Model 'another_nigga' initialized successfully on {device}:")
    print(model)

    # Sample dummy image input (shape: [1, 3, 224, 224])
    dummy_x0 = torch.randn(1, 3, 224, 224, device=device)
    try:
        output = model(dummy_x0)
        if output is not None:
            print("\n[OK] Forward pass test successful!")
            if isinstance(output, torch.Tensor):
                print(f"Output tensor shape: {tuple(output.shape)}")
            elif isinstance(output, (list, tuple)):
                print(f"Output shapes: {[tuple(o.shape) if hasattr(o, 'shape') else type(o) for o in output]}")
        else:
            print("\n[OK] Model forward is empty (no edges connected).")
    except Exception as e:
        print(f"\n[!] Note: Forward pass test with dummy inputs encountered: {e}")
