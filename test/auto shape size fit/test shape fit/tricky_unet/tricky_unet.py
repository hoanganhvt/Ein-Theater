import torch
import torch.nn as nn
import operator

class tricky_unet(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.c1 = nn.Conv2d(in_channels=1, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
        self.c2 = nn.Conv2d(in_channels=16, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
        self.p1 = nn.MaxPool2d(kernel_size=2, stride=2, padding=0)
        self.c3 = nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, stride=1, padding=1, bias=True)
        self.p2 = nn.MaxPool2d(kernel_size=2, stride=2, padding=0)
        self.bneck = nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, stride=1, padding=1, bias=True)
        self.up1 = nn.ConvTranspose2d(in_channels=64, out_channels=32, kernel_size=2, stride=2, padding=0, output_padding=0, bias=True)
        self.c_up1 = nn.Conv2d(in_channels=64, out_channels=32, kernel_size=3, stride=1, padding=1, bias=True)
        self.up2 = nn.ConvTranspose2d(in_channels=32, out_channels=16, kernel_size=2, stride=2, padding=0, output_padding=0, bias=True)
        self.c_up2 = nn.Conv2d(in_channels=32, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
        self.out = nn.Conv2d(in_channels=16, out_channels=1, kernel_size=1, stride=1, padding=0, bias=True)
        self.to(self.device)

    def forward(self, x):
        # x: Image, shape: [1, 1, 36, 48]
        c1 = self.c1(x)
        relu = torch.relu(c1)
        c2 = self.c2(relu)
        relu_1 = torch.relu(c2)
        p1 = self.p1(relu_1)
        c3 = self.c3(p1)
        relu_2 = torch.relu(c3)
        p2 = self.p2(relu_2)
        bneck = self.bneck(p2)
        relu_3 = torch.relu(bneck)
        up1 = self.up1(relu_3)
        cat = torch.cat([up1, relu_2], dim=1)
        c_up1 = self.c_up1(cat)
        relu_4 = torch.relu(c_up1)
        up2 = self.up2(relu_4)
        cat_1 = torch.cat([up2, relu_1], dim=1)
        c_up2 = self.c_up2(cat_1)
        relu_5 = torch.relu(c_up2)
        out = self.out(relu_5)
        return out


# steve once here

