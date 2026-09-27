"""Declarative pipeline format. Parsing never executes user Python."""
import ast
import copy
import json
import pprint
import re


class Pipeline:
    def __init__(self, name="prepare"):
        self.document = {"schemaVersion": 1, "name": name, "nodes": [], "edges": []}

    def block(self, id, kind, params=None, x=0, y=0):
        self.document["nodes"].append(dict(id=id, kind=kind, params=params or {}, x=x, y=y))

    def connect(self, source, target, out="out", port="in"):
        self.document["edges"].append(dict(source=source, target=target, out=out, port=port))


def render(document):
    lines = ["from pipeline import Pipeline", "", f"p = Pipeline({document.get('name', 'prepare')!r})"]
    for node in document["nodes"]:
        lines.append("p.block(" + ", ".join(repr(node[k]) for k in ("id", "kind")) + ", " +
                     pprint.pformat(node.get("params", {}), sort_dicts=True) +
                     f", x={node.get('x', 0)!r}, y={node.get('y', 0)!r})")
    for edge in document["edges"]:
        lines.append(f"p.connect({edge['source']!r}, {edge['target']!r}, out={edge.get('out', 'out')!r}, port={edge.get('port', 'in')!r})")
    return "\n".join(lines) + "\n"


def parse(source):
    p = None
    for statement in ast.parse(source).body:
        if isinstance(statement, ast.ImportFrom) and statement.module == "pipeline" and statement.level == 0:
            if len(statement.names) == 1 and statement.names[0].name == "Pipeline" and not statement.names[0].asname:
                continue
        try:
            if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name) and statement.targets[0].id == "p":
                call = statement.value
                if p is not None or not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name) or call.func.id != "Pipeline":
                    raise ValueError("expected p = Pipeline(name)")
                p = Pipeline(*[ast.literal_eval(a) for a in call.args], **{k.arg: ast.literal_eval(k.value) for k in call.keywords})
                continue
            if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call) and p is not None:
                call = statement.value
                if isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name) and call.func.value.id == "p" and call.func.attr in ("block", "connect"):
                    getattr(p, call.func.attr)(*[ast.literal_eval(a) for a in call.args], **{k.arg: ast.literal_eval(k.value) for k in call.keywords})
                    continue
            raise ValueError("only Pipeline, p.block and p.connect with literal arguments are supported")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Line {statement.lineno}: {exc}") from exc
    if p is None:
        raise ValueError("Missing p = Pipeline(name)")
    return p.document


def validate(document, registry, depth=0):
    if depth > 16:
        raise ValueError("Subflow nesting exceeds 16 levels")
    if document.get("schemaVersion") != 1:
        raise ValueError("Unsupported pipeline schema version")
    nodes = document.get("nodes", [])
    if not isinstance(nodes, list) or len(nodes) > 2000:
        raise ValueError("Expected at most 2000 blocks")
    by_id, incoming = {}, {}
    for node in nodes:
        id = node.get("id")
        if not isinstance(id, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}(?:/[A-Za-z][A-Za-z0-9_-]{0,63})*", id) or id in by_id:
            raise ValueError("Block IDs must be unique safe identifiers")
        if node.get("kind") not in registry:
            raise ValueError(f"{id}: unknown block {node.get('kind')}")
        if depth == 0 and node.get("kind") == "input":
            raise ValueError("Input blocks are only valid inside a subflow")
        if not isinstance(node.get("params", {}), dict):
            raise ValueError(f"{id}: parameters must be an object")
        by_id[id], incoming[id] = node, []
        if node["kind"] == "subflow":
            validate(node["params"]["graph"], registry, depth + 1)
    occupied = set()
    for e in document.get("edges", []):
        if e.get("source") not in by_id or e.get("target") not in by_id:
            raise ValueError("Connection references a missing block")
        a, b = registry[by_id[e["source"]]["kind"]], registry[by_id[e["target"]]["kind"]]
        if e.get("out", "out") not in a["outputs"] or e.get("port", "in") not in b["inputs"]:
            raise ValueError("Unknown input/output port")
        output_type, input_type = a["outputTypes"][e.get("out", "out")], b["inputTypes"][e.get("port", "in")]
        if output_type != input_type and "any" not in (output_type, input_type):
            raise ValueError(f"Incompatible port types: {output_type} -> {input_type}")
        key = (e["target"], e.get("port", "in"))
        if key in occupied:
            raise ValueError("Each input port accepts one connection; use concatenate to combine streams")
        occupied.add(key)
        incoming[e["target"]].append(e)
    order, pending = [], set(by_id)
    while pending:
        ready = sorted(n for n in pending if all(e["source"] in order for e in incoming[n]))
        if not ready:
            raise ValueError("Pipeline contains a cycle")
        order.extend(ready)
        pending.difference_update(ready)
    for id in order:
        kind = by_id[id]["kind"]
        required = registry[kind]["inputs"]
        if any((id, p) not in occupied for p in required):
            raise ValueError(f"{id}: connect all input ports ({', '.join(required)})")
    has_split, origins = any(n["kind"] == "split" for n in nodes), {}
    for id in order:
        node, kind = by_id[id], by_id[id]["kind"]
        upstream = set().union(*(origins.get((e["source"], e.get("out", "out")), set()) for e in incoming[id])) if incoming[id] else set()
        if has_split and (kind == "fit" or (kind in ("image", "audio") and node.get("params", {}).get("operation") == "augment")) and upstream != {"train"}:
            raise ValueError(f"{id}: learned transforms and augmentation must be connected after the train output")
        for port in registry[kind]["outputs"]:
            origins[(id, port)] = {port} if kind == "split" else set(upstream)
    return order, by_id, incoming


def semantic(document):
    result = copy.deepcopy(document)
    for node in result["nodes"]:
        node.pop("x", None)
        node.pop("y", None)
    return json.dumps(result, sort_keys=True, ensure_ascii=False)


def expand_subflows(document):
    """Inline single-input/output subflows while retaining stable prefixed IDs."""
    result = copy.deepcopy(document)
    while True:
        subflow = next((n for n in result["nodes"] if n["kind"] == "subflow"), None)
        if subflow is None:
            return result
        inner = expand_subflows(subflow["params"]["graph"])
        inputs = [n for n in inner["nodes"] if n["kind"] == "input"]
        outputs = [n for n in inner["nodes"] if n["kind"] == "output"]
        if len(inputs) != 1 or len(outputs) != 1:
            raise ValueError(f"{subflow['id']}: subflow needs exactly one input and one output block")
        prefix = subflow["id"] + "/"
        incoming = [e for e in result["edges"] if e["target"] == subflow["id"]]
        outgoing = [e for e in result["edges"] if e["source"] == subflow["id"]]
        internal_in = [e for e in inner["edges"] if e["source"] == inputs[0]["id"]]
        internal_out = [e for e in inner["edges"] if e["target"] == outputs[0]["id"]]
        if len(incoming) != 1 or len(outgoing) != 1 or not internal_in or not internal_out:
            raise ValueError(f"{subflow['id']}: connect the subflow and its input/output blocks")
        kept_nodes = [n for n in result["nodes"] if n["id"] != subflow["id"]]
        for node in inner["nodes"]:
            if node["kind"] not in ("input", "output"):
                node["id"] = prefix + node["id"]
                kept_nodes.append(node)
        kept_edges = [e for e in result["edges"] if e["source"] != subflow["id"] and e["target"] != subflow["id"]]
        for edge in inner["edges"]:
            if edge["source"] not in (inputs[0]["id"], outputs[0]["id"]) and edge["target"] not in (inputs[0]["id"], outputs[0]["id"]):
                kept_edges.append({**edge, "source": prefix + edge["source"], "target": prefix + edge["target"]})
        for left in incoming:
            for edge in internal_in:
                target = outgoing[0]["target"] if edge["target"] == outputs[0]["id"] else prefix + edge["target"]
                kept_edges.append({"source": left["source"], "target": target, "out": left.get("out", "out"), "port": edge.get("port", "in") if target != outgoing[0]["target"] else outgoing[0].get("port", "in")})
        for edge in internal_out:
            if edge["source"] != inputs[0]["id"]:
                for right in outgoing:
                    kept_edges.append({"source": prefix + edge["source"], "target": right["target"], "out": edge.get("out", "out"), "port": right.get("port", "in")})
        result["nodes"], result["edges"] = kept_nodes, kept_edges
