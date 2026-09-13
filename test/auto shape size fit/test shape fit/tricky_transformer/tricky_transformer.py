import torch
import torch.nn as nn
import operator

class tricky_transformer(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.emb = nn.Embedding(num_embeddings=3500, embedding_dim=72)
        self.attn1 = nn.MultiheadAttention(embed_dim=72, num_heads=6, dropout=0.0)
        self.ln1 = nn.LayerNorm(normalized_shape=72, eps=1e-05)
        self.fc1 = nn.Linear(in_features=72, out_features=288, bias=True)
        self.fc2 = nn.Linear(in_features=288, out_features=72, bias=True)
        self.ln2 = nn.LayerNorm(normalized_shape=72, eps=1e-05)
        self.attn2 = nn.MultiheadAttention(embed_dim=72, num_heads=8, dropout=0.0)
        self.ln3 = nn.LayerNorm(normalized_shape=72, eps=1e-05)
        self.head = nn.Linear(in_features=72, out_features=10, bias=True)
        self.to(self.device)

    def forward(self, x):
        # x: Text, shape: [1, 63]
        emb = self.emb(x)
        attn1 = self.attn1(emb, emb, emb)
        getitem = operator.getitem(attn1, 0)
        getitem_1 = operator.getitem(attn1, 1)
        add = operator.add(emb, getitem)
        ln1 = self.ln1(add)
        fc1 = self.fc1(ln1)
        relu = torch.relu(fc1)
        fc2 = self.fc2(relu)
        add_1 = operator.add(ln1, fc2)
        ln2 = self.ln2(add_1)
        attn2 = self.attn2(ln2, ln2, ln2)
        getitem_2 = operator.getitem(attn2, 0)
        getitem_3 = operator.getitem(attn2, 1)
        add_2 = operator.add(ln2, getitem_2)
        ln3 = self.ln3(add_2)
        head = self.head(ln3)
        return head


# steve once here

