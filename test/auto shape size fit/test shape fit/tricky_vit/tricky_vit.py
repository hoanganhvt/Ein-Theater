import torch
import torch.nn as nn
import operator

class tricky_vit(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.patch = nn.Conv2d(in_channels=3, out_channels=48, kernel_size=4, stride=4, padding=0, bias=True)
        self.attn = nn.MultiheadAttention(embed_dim=48, num_heads=4, dropout=0.0)
        self.ln = nn.LayerNorm(normalized_shape=48, eps=1e-05)
        self.mlp1 = nn.Linear(in_features=48, out_features=192, bias=True)
        self.mlp2 = nn.Linear(in_features=192, out_features=48, bias=True)
        self.head = nn.Linear(in_features=48, out_features=25, bias=True)
        self.to(self.device)

    def forward(self, x):
        # x: Image, shape: [1, 3, 40, 56]
        patch = self.patch(x)
        flatten = patch.flatten(2)
        transpose = flatten.transpose(1, 2)
        attn = self.attn(transpose, transpose, transpose)
        getitem = operator.getitem(attn, 0)
        getitem_1 = operator.getitem(attn, 1)
        add = operator.add(transpose, getitem)
        ln = self.ln(add)
        mlp1 = self.mlp1(ln)
        relu = torch.relu(mlp1)
        mlp2 = self.mlp2(relu)
        add_1 = operator.add(ln, mlp2)
        mean = add_1.mean(dim=1)
        head = self.head(mean)
        return head


# steve once here

