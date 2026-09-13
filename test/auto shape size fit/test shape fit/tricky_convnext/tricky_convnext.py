import torch
import torch.nn as nn
import operator

class tricky_convnext(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.dw = nn.Conv2d(in_channels=24, out_channels=24, kernel_size=7, stride=1, padding=3, bias=True)
        self.norm = nn.BatchNorm2d(num_features=24, eps=1e-05)
        self.pw1 = nn.Conv2d(in_channels=24, out_channels=96, kernel_size=1, stride=1, padding=0, bias=True)
        self.pw2 = nn.Conv2d(in_channels=96, out_channels=24, kernel_size=1, stride=1, padding=0, bias=True)
        self.to(self.device)

    def forward(self, x):
        # x: Image, shape: [1, 24, 28, 28]
        dw = self.dw(x)
        norm = self.norm(dw)
        relu = torch.relu(norm)
        add = operator.add(x, relu)
        pw1 = self.pw1(add)
        relu_1 = torch.relu(pw1)
        pw2 = self.pw2(relu_1)
        return pw2


# steve once here

