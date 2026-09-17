import torch
import torch.nn as nn
import sys
import os

_curr_dir = os.path.dirname(os.path.abspath(__file__))

_sub_dir = os.path.normpath(os.path.join(_curr_dir, r'./cnn_node_fitted'))
if _sub_dir not in sys.path:
    sys.path.insert(0, _sub_dir)
from cnn_node_fitted import cnn_node_fitted
_sub_dir = os.path.normpath(os.path.join(_curr_dir, r'./cnn_node_fitted_fitted'))
if _sub_dir not in sys.path:
    sys.path.insert(0, _sub_dir)
from cnn_node_fitted_fitted import cnn_node_fitted_fitted
_sub_dir = os.path.normpath(os.path.join(_curr_dir, r'./cnn_node_fitted_fitted_2_fitted'))
if _sub_dir not in sys.path:
    sys.path.insert(0, _sub_dir)
from cnn_node_fitted_fitted_2_fitted import cnn_node_fitted_fitted_2_fitted
_sub_dir = os.path.normpath(os.path.join(_curr_dir, r'./cnn_node_fitted_fitted_2_fitted_fitted'))
if _sub_dir not in sys.path:
    sys.path.insert(0, _sub_dir)
from cnn_node_fitted_fitted_2_fitted_fitted import cnn_node_fitted_fitted_2_fitted_fitted


class Untitled_Model(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.cnn_node_fitted_integratedmodel_0 = cnn_node_fitted()
        self.cnn_node_fitted_fitted_integratedmodel_1 = cnn_node_fitted_fitted()
        self.cnn_node_fitted_fitted_integratedmodel_2 = cnn_node_fitted_fitted()
        self.cnn_node_fitted_fitted_integratedmodel_3 = cnn_node_fitted_fitted()
        self.cnn_node_fitted_fitted_integratedmodel_4 = cnn_node_fitted_fitted()
        self.cnn_node_fitted_fitted_2_fitted_integratedmodel_5 = cnn_node_fitted_fitted_2_fitted()
        self.cnn_node_fitted_fitted_2_fitted_fitted_integratedmodel_6 = cnn_node_fitted_fitted_2_fitted_fitted()

    def forward(self, x0):
        # cnn_node_fitted_integratedmodel_0 shape: [1, 3, 224, 224]
        cnn_node_fitted_integratedmodel_0 = self.cnn_node_fitted_integratedmodel_0(x0);  x0 = None
        # cnn_node_fitted_fitted_integratedmodel_1 shape: [1, 3, 224, 224]
        cnn_node_fitted_fitted_integratedmodel_1 = self.cnn_node_fitted_fitted_integratedmodel_1(cnn_node_fitted_integratedmodel_0)
        # cnn_node_fitted_fitted_integratedmodel_2 shape: [1, 3, 224, 224]
        cnn_node_fitted_fitted_integratedmodel_2 = self.cnn_node_fitted_fitted_integratedmodel_2(cnn_node_fitted_fitted_integratedmodel_1)
        # cnn_node_fitted_fitted_integratedmodel_3 shape: [1, 3, 224, 224]
        cnn_node_fitted_fitted_integratedmodel_3 = self.cnn_node_fitted_fitted_integratedmodel_3(cnn_node_fitted_fitted_integratedmodel_2);  cnn_node_fitted_fitted_integratedmodel_2 = None
        # cnn_node_fitted_fitted_integratedmodel_4 shape: [1, 3, 224, 224]
        cnn_node_fitted_fitted_integratedmodel_4 = self.cnn_node_fitted_fitted_integratedmodel_4(cnn_node_fitted_fitted_integratedmodel_3);  cnn_node_fitted_fitted_integratedmodel_3 = None
        # cnn_node_fitted_fitted_2_fitted_integratedmodel_5 shape: [1, 3, 224, 224]
        cnn_node_fitted_fitted_2_fitted_integratedmodel_5 = self.cnn_node_fitted_fitted_2_fitted_integratedmodel_5(cnn_node_fitted_fitted_integratedmodel_4, cnn_node_fitted_fitted_integratedmodel_1);  cnn_node_fitted_fitted_integratedmodel_4 = cnn_node_fitted_fitted_integratedmodel_1 = None
        # cnn_node_fitted_fitted_2_fitted_fitted_integratedmodel_6 shape: [1, 3, 224, 224]
        cnn_node_fitted_fitted_2_fitted_fitted_integratedmodel_6 = self.cnn_node_fitted_fitted_2_fitted_fitted_integratedmodel_6(cnn_node_fitted_fitted_2_fitted_integratedmodel_5, cnn_node_fitted_integratedmodel_0);  cnn_node_fitted_fitted_2_fitted_integratedmodel_5 = cnn_node_fitted_integratedmodel_0 = None
        return cnn_node_fitted_fitted_2_fitted_fitted_integratedmodel_6

if __name__ == '__main__':
    print("Testing Untitled_Model...")
    model = Untitled_Model()
    
    x0 = torch.randn([1, 3, 224, 224])
    
    try:
        output = model(x0)
        print("Forward pass successful!")
        if isinstance(output, torch.Tensor):
            print("Output shape:", output.shape)
        elif isinstance(output, tuple):
            print("Output shapes:", [o.shape for o in output])
    except Exception as e:
        print("Forward pass failed:", e)
