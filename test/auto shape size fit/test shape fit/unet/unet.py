import torch
import torch.nn as nn
import operator

class unet(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.linear_0 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_1 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_2 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_3 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_4 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.to(self.device)

    def forward(self, x):
        linear_0 = self.linear_0(x)
        linear_1 = self.linear_1(linear_0)
        linear_2 = self.linear_2(linear_1)
        linear_3 = self.linear_3(torch.cat([linear_2, linear_1], dim=1))
        linear_4 = self.linear_4(torch.cat([linear_0, linear_3], dim=1))
        return linear_4


# Alias for backwards compatibility
GeneratedModel = unet


if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = unet(device=device)
    print(f"Model 'unet' initialized successfully on {device}:")
    print(model)
