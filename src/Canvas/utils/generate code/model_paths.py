"""Normalize saved model references relative to their output folder."""
import os

def to_relative_path(path, base_dir=None):
    """
    Converts path to a relative path normalized with forward slashes.
    Ensures generated code only contains relative paths.
    """
    if not path or not str(path).strip():
        return ""
    p = str(path).strip().replace('\\', '/')
    base = (base_dir or os.getcwd()).replace('\\', '/')

    is_abs = os.path.isabs(p) or (len(p) > 1 and p[1] == ':')
    if not is_abs:
        if not p.startswith('.') and not p.startswith('/'):
            p = './' + p
        return p

    try:
        rel = os.path.relpath(p, base).replace('\\', '/')
        if not rel.startswith('.') and not rel.startswith('/'):
            rel = './' + rel
        return rel
    except Exception:
        return p
