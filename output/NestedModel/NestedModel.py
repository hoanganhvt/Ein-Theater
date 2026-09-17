import torch
import torch.nn as nn


class NestedModel(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.conv_1 = nn.Conv2d(in_channels=3, out_channels=64, kernel_size=3, stride=1, padding=1, bias=True)
        self.relu_1 = nn.ReLU(inplace=True)

    def forward(self, x0):
        # conv_1 shape: [1, 64, 224, 224]
        conv_1 = self.conv_1(x0);  x0 = None
        # relu_1 shape: [1, 64, 224, 224]
        relu_1 = self.relu_1(conv_1);  conv_1 = None
        return relu_1

if __name__ == '__main__':
    print("Testing NestedModel...")
    model = NestedModel()
    
    x0 = torch.randn([1, 3, 224, 224])
    
    try:
        output = model(x0)
        print("Forward pass successful!")
        if isinstance(output, torch.Tensor):
            print("Output shape:", output.shape)
        elif isinstance(output, tuple):
            print("Output shapes:", [o.shape for o in output])
    except Exception as e:
        print("Forward pass failed:", e)
