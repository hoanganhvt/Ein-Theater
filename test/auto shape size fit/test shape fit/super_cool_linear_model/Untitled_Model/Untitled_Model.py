import torch
import torch.nn as nn
import operator

class GeneratedModel(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.linear_0 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_1 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_2 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.to(self.device)

    def forward(self, x):
        linear_0 = self.linear_0(x)
        linear_1 = self.linear_1(linear_0)
        linear_2 = self.linear_2(linear_1)
        return linear_2


if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = GeneratedModel(device=device)
    print(f"Model 'Untitled Model' initialized successfully on {device}:")
    print(model)
