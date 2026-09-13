import torch
import torch.nn as nn
import operator

class model_j_do(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.linear_0 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_1 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_2 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_3 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_4 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_5 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_6 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.linear_7 = nn.Linear(in_features=128, out_features=64, bias=True)
        self.to(self.device)

    def forward(self, x):
        linear_0 = self.linear_0(x)
        linear_1 = self.linear_1(linear_0)
        linear_2 = self.linear_2(linear_1)
        linear_3 = self.linear_3(linear_2)
        linear_4 = self.linear_4(linear_3)
        linear_5 = self.linear_5(linear_4)
        linear_6 = self.linear_6(linear_5)
        linear_7 = self.linear_7(linear_6)
        return linear_7


# steve once here



if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = model_j_do(device=device)
    print(f"Model 'model_j_do' initialized successfully on {device}:")
    print(model)
