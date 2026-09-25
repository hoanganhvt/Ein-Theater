"""Convert a trusted local PyTorch module into editable Canvas graph JSON."""
import ast
import contextlib
import inspect
import io
import json
import operator
import sys
from pathlib import Path


def respond(**value):
    print(json.dumps(value, ensure_ascii=False))


def plain(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, (tuple, list)):
        return [plain(item) for item in value]
    raise ValueError(f"unsupported constructor value: {type(value).__name__}")


def classes(source):
    tree = ast.parse(source)
    aliases = {"Module", "nn.Module", "torch.nn.Module"}
    result = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        bases = [ast.unparse(base) for base in node.bases]
        if any(base in aliases for base in bases):
            result.append(node.name)
            aliases.add(node.name)
    return result


def constructor_params(module):
    params = {}
    for name, parameter in inspect.signature(type(module)).parameters.items():
        if name in ("self", "device", "dtype") or parameter.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue
        if name == "bias" and hasattr(module, "bias"):
            value = module.bias is not None
        elif hasattr(module, name):
            value = getattr(module, name)
        elif parameter.default is not inspect.Parameter.empty:
            continue
        else:
            raise ValueError(f"cannot recover constructor parameter {name} for {type(module).__name__}")
        params[name] = plain(value)
    return params


def convert(source, class_name, filename, palette):
    import torch
    from torch import nn
    from torch.fx import Node, symbolic_trace

    namespace = {"__name__": "ein_theater_code", "__file__": filename}
    sys.path.insert(0, str(Path(filename).parent))
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(source, filename, "exec"), namespace)
        cls = namespace.get(class_name)
        if not inspect.isclass(cls) or not issubclass(cls, nn.Module):
            raise ValueError(f"{class_name} is not an nn.Module class")
        try:
            model = cls()
        except TypeError as error:
            raise ValueError(f"{class_name} must be constructible without arguments: {error}") from error
        traced = symbolic_trace(model)
    fx_nodes = list(traced.graph.nodes)
    output = fx_nodes[-1]
    if output.op != "output" or not isinstance(output.args[0], Node):
        raise ValueError("v1 supports one tensor output")
    output_source = output.args[0]
    result_nodes = []
    result_edges = []
    depths = {}
    rows = {}
    supported = set(palette)

    def add_node(fx_node, layer_type, params, inputs):
        depth = max((depths[item.name] + 1 for item in inputs), default=0)
        row = rows.get(depth, 0)
        rows[depth] = row + 1
        depths[fx_node.name] = depth
        node_id = fx_node.name
        result_nodes.append({"id": node_id, "label": node_id, "layerType": layer_type,
                             "params": params, "x": depth * 230, "y": row * 130})
        for item in inputs:
            result_edges.append({"id": f"e{len(result_edges)}", "from": item.name,
                                 "to": node_id, "lines": []})

    for node in fx_nodes:
        if node.op == "output":
            continue
        if node.op == "placeholder":
            add_node(node, "Input", {"input_name": str(node.target), "input_type": "raw data"}, [])
            continue
        if node.op == "call_module":
            module = traced.get_submodule(str(node.target))
            layer_type = "nn." + type(module).__name__
            if layer_type not in supported:
                raise ValueError(f"unsupported FX node {node.name}: {layer_type}")
            inputs = list(node.all_input_nodes)
            if len(inputs) != 1 or node.kwargs:
                raise ValueError(f"unsupported FX arguments at {node.name}")
            add_node(node, layer_type, constructor_params(module), inputs)
            continue
        if node.op == "call_function":
            target = node.target
            if target in (operator.add, torch.add) and len(node.args) == 2 and all(isinstance(x, Node) for x in node.args) and not node.kwargs:
                add_node(node, "torch.add", {}, list(node.args))
                continue
            if target is torch.cat and len(node.args) >= 1 and isinstance(node.args[0], (list, tuple)) and all(isinstance(x, Node) for x in node.args[0]):
                dim = node.kwargs.get("dim", node.args[1] if len(node.args) > 1 else 0)
                if not isinstance(dim, int):
                    raise ValueError(f"unsupported cat dimension at {node.name}")
                add_node(node, "torch.cat", {"dim": dim}, list(node.args[0]))
                continue
            if target is operator.getitem and len(node.args) == 2 and isinstance(node.args[0], Node) and isinstance(node.args[1], int):
                add_node(node, "operator.getitem", {"index": node.args[1]}, [node.args[0]])
                continue
        raise ValueError(f"unsupported FX node {node.name}: {node.op} {node.target}")

    leaves = {node["id"] for node in result_nodes} - {edge["from"] for edge in result_edges}
    if leaves != {output_source.name}:
        raise ValueError("v1 cannot represent unused branches or multiple outputs")
    return {"name": class_name, "nodes": result_nodes, "edges": result_edges}


def main():
    mode = sys.argv[1]
    request = json.load(sys.stdin)
    source = request["source"]
    if mode == "classes":
        respond(classes=classes(source))
    elif mode == "compile":
        palette = json.loads((Path(__file__).parents[2] / "Canvas" / "data" / "modules.json").read_text(encoding="utf-8"))
        graph = convert(source, request["className"], request["path"], [item["type"] for item in palette])
        respond(graph=graph)
    else:
        raise ValueError("unknown mode")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        respond(error=f"{type(error).__name__}: {error}")
