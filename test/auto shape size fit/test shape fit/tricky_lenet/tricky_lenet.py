import torch
import torch.nn as nn
import operator

class tricky_lenet(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.c1 = nn.Conv2d(in_channels=1, out_channels=8, kernel_size=5, stride=1, padding=0, bias=True)
        self.p1 = nn.MaxPool2d(kernel_size=2, stride=2, padding=0)
        self.c2 = nn.Conv2d(in_channels=8, out_channels=16, kernel_size=3, stride=1, padding=0, bias=True)
        self.p2 = nn.MaxPool2d(kernel_size=2, stride=2, padding=0)
        self.fc1 = nn.Linear(in_features=896, out_features=120, bias=True)
        self.fc2 = nn.Linear(in_features=120, out_features=84, bias=True)
        self.fc3 = nn.Linear(in_features=84, out_features=17, bias=True)
        self.to(self.device)

    def forward(self, x):
        # x: Image, shape: [1, 1, 37, 43]
        c1 = self.c1(x)
        relu = torch.relu(c1)
        p1 = self.p1(relu)
        c2 = self.c2(p1)
        relu_1 = torch.relu(c2)
        p2 = self.p2(relu_1)
        flatten = torch.flatten(p2, 1)
        fc1 = self.fc1(flatten)
        relu_2 = torch.relu(fc1)
        fc2 = self.fc2(relu_2)
        relu_3 = torch.relu(fc2)
        fc3 = self.fc3(relu_3)
        return fc3


# steve once here

