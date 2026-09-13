import torch
import torch.nn as nn
import operator

class super_cool_linear_model(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.linear_9 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.relu_13 = nn.ReLU(inplace=False)
        self.linear_10 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_11 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.conv_12 = nn.Conv2d(in_channels=3, out_channels=64, kernel_size=3, stride=1, padding=1, bias=True)
        self.to(self.device)

    def forward(self, x):
        linear_9 = self.linear_9(x)
        relu_13 = self.relu_13(linear_9)
        linear_10 = self.linear_10(relu_13)
        linear_11 = self.linear_11(linear_10)
        conv_12 = self.conv_12(linear_11)
        return conv_12


# Alias for backwards compatibility
GeneratedModel = super_cool_linear_model


if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = super_cool_linear_model(device=device)
    print(f"Model 'super_cool_linear_model' initialized successfully on {device}:")
    print(model)
