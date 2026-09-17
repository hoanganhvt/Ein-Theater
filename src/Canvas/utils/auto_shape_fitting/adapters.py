"""Built-in input-dependent constructor adaptation rules."""
from torch import nn
from shared.module_registry import register_adapter

@register_adapter(nn.Linear)
def linear(params, args):
    return {'in_features': args[0].shape[-1]}


@register_adapter(nn.Conv1d, nn.Conv2d, nn.Conv3d,
                  nn.ConvTranspose1d, nn.ConvTranspose2d, nn.ConvTranspose3d)
def convolution(params, args):
    return {'in_channels': args[0].shape[1]}


@register_adapter(nn.BatchNorm1d, nn.BatchNorm2d, nn.BatchNorm3d,
                  nn.InstanceNorm1d, nn.InstanceNorm2d, nn.InstanceNorm3d)
def normalization(params, args):
    return {'num_features': args[0].shape[1]}


@register_adapter(nn.GroupNorm)
def group_norm(params, args):
    return {'num_channels': args[0].shape[1]}


@register_adapter(nn.LayerNorm)
def layer_norm(params, args):
    configured = params.get('normalized_shape', 1)
    count = len(configured) if isinstance(configured, (tuple, list)) else 1
    if count < 1 or count >= args[0].ndim:
        raise ValueError('LayerNorm normalized dimensions must exclude the batch axis')
    dims = list(args[0].shape[-count:])
    return {'normalized_shape': dims if count > 1 else dims[0]}


@register_adapter(nn.RNN, nn.GRU, nn.LSTM, nn.RNNCell, nn.GRUCell, nn.LSTMCell)
def recurrent(params, args):
    return {'input_size': args[0].shape[-1]}


@register_adapter(nn.MultiheadAttention)
def attention(params, args):
    result = {'embed_dim': args[0].shape[-1]}
    if len(args) == 3:
        result.update(kdim=args[1].shape[-1], vdim=args[2].shape[-1])
    return result


