# Auto Shape Size Fit Utility Package
# Exports public API for automated tensor shape propagation and dimension fitting

import os
import sys

_curr_dir = os.path.dirname(os.path.abspath(__file__))
if _curr_dir not in sys.path:
    sys.path.insert(0, _curr_dir)

from shape_fitter import auto_shape_size_fit, ShapeFitter, topological_sort

__all__ = [
    'auto_shape_size_fit',
    'ShapeFitter',
    'topological_sort',
]
