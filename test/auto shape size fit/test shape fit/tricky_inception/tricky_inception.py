import torch
import torch.nn as nn
import operator

class tricky_inception(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.b1 = nn.Conv2d(in_channels=16, out_channels=16, kernel_size=1, stride=1, padding=0, bias=True)
        self.b2 = nn.Conv2d(in_channels=16, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
        self.b3 = nn.Conv2d(in_channels=16, out_channels=16, kernel_size=5, stride=1, padding=2, bias=True)
        self.out_conv = nn.Conv2d(in_channels=48, out_channels=10, kernel_size=1, stride=1, padding=0, bias=True)
        self.to(self.device)

    def forward(self, x):
        # x: Image, shape: [1, 16, 31, 31]
        b1 = self.b1(x)
        b2 = self.b2(x)
        b3 = self.b3(x)
        relu = torch.relu(b1)
        relu_1 = torch.relu(b2)
        relu_2 = torch.relu(b3)
        cat = torch.cat([relu, relu_1, relu_2], dim=1)
        out_conv = self.out_conv(cat)
        return out_conv


# steve once here

