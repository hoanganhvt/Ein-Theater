import torch
import torch.nn as nn
import operator

class le_net(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.conv_0 = nn.Conv2d(in_channels=3, out_channels=64, kernel_size=3, stride=1, padding=1, bias=True)
        self.linear_0 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.maxpool1d_0 = nn.MaxPool1d(kernel_size=2, stride=2, padding=0)
        self.linear_1 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.conv_1 = nn.Conv2d(in_channels=3, out_channels=64, kernel_size=3, stride=1, padding=1, bias=True)
        self.to(self.device)

    def forward(self, x):
        conv_0 = self.conv_0(x)
        linear_0 = self.linear_0(conv_0)
        maxpool1d_0 = self.maxpool1d_0(linear_0)
        linear_1 = self.linear_1(maxpool1d_0)
        conv_1 = self.conv_1(linear_1)
        return conv_1


# Alias for backwards compatibility
GeneratedModel = le_net


if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = le_net(device=device)
    print(f"Model 'le_net' initialized successfully on {device}:")
    print(model)
