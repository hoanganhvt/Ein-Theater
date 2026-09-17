"""Trusted module registry and shared constructor resolution."""
import ast
import inspect
from functools import lru_cache
from torch import nn

from shared.common import load_modules_map

ADAPTERS = {}
MODULES = {}


def register_adapter(*classes):
    """Register constructor adaptation; output shapes still come from PyTorch."""
    def register(fn):
        for cls in classes:
            ADAPTERS[cls] = fn
        return fn
    return register


def register_module(name, cls, adapter=None):
    """Explicit extension point for trusted custom modules (no eval/import of canvas text)."""
    MODULES[name] = cls
    if adapter:
        ADAPTERS[cls] = adapter


@lru_cache(maxsize=1)
def schemas():
    return load_modules_map()


def literal(value):
    if isinstance(value, str):
        try:
            return ast.literal_eval(value)
        except (ValueError, SyntaxError):
            pass
    return value


def parameters(node):
    # Match the defaults used by the canvas code generator.
    fields = schemas().get(node.get('layerType'), {}).get('fields', [])
    result = {f['key']: literal(f['default']) for f in fields if 'default' in f}
    result.update({k: literal(v) for k, v in (node.get('params') or {}).items()})
    return result


def module_class(kind):
    cls = MODULES.get(kind)
    if cls is None and kind.startswith('nn.'):
        cls = getattr(nn, kind[3:], None)
    if not isinstance(cls, type) or not issubclass(cls, nn.Module):
        raise ValueError(f'Unregistered module: {kind}')
    return cls


def constructor_kwargs(cls, params):
    """Shared by inference and code generation so inferred fields are never dropped."""
    signature = inspect.signature(cls.__init__)
    accepts_kwargs = any(p.kind == p.VAR_KEYWORD for p in signature.parameters.values())
    return {k: v for k, v in params.items() if k != 'customArgs' and (k in signature.parameters or accepts_kwargs)}
