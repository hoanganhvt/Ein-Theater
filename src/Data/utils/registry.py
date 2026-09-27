"""Versioned block catalogue shared by the editor and executor."""
import importlib.util
import shutil

REGISTRY = {}


def block(kind, group, params, inputs=("in",), outputs=("out",), dependencies=(), description="", input_types=None, output_types=None):
    REGISTRY[kind] = dict(id=kind, version=1, group=group, params=params, inputs=list(inputs),
                          outputs=list(outputs), dependencies=list(dependencies), description=description,
                          inputTypes=input_types or {port: "records" for port in inputs}, outputTypes=output_types or {port: "records" for port in outputs},
                          streaming=kind not in ("sort", "join", "deduplicate", "split", "aggregate", "fit", "resample"))


block("source", "Sources", {"sourceId": "", "format": "auto", "field": "text", "encoding": "utf-8", "delimiter": ",", "pattern": "*"}, ())
block("input", "Flow", {}, ())
block("select", "Records", {"fields": ["text", "label"]})
block("rename", "Records", {"mapping": {"old": "new"}})
block("cast", "Records", {"field": "value", "type": "float"})
block("filter", "Records", {"field": "label", "operator": "eq", "value": "cat"})
block("missing", "Records", {"field": "value", "action": "fill", "value": 0})
block("sample", "Records", {"count": 100, "seed": 42})
block("deduplicate", "Records", {"fields": ["text"]})
block("sort", "Records", {"field": "value", "descending": False})
block("shuffle", "Records", {"seed": 42})
block("join", "Records", {"leftKey": "sample_id", "rightKey": "sample_id", "how": "inner"}, ("left", "right"))
block("concatenate", "Records", {}, ("left", "right"))
block("aggregate", "Records", {"group": "label", "field": "value", "operation": "count"})
block("router", "Flow", {"field": "label", "operator": "eq", "value": "cat"}, outputs=("true", "false"))
block("split", "Split", {"train": 80, "validation": 0, "test": 20, "seed": 42, "method": "random", "field": "label", "group": "", "time": "timestamp", "gap": 0}, outputs=("train", "validation", "test"))
block("fit", "Learned transforms", {"field": "value", "operation": "standardize", "maxTokens": 50000}, outputs=("out", "state"), output_types={"out": "records", "state": "state"})
block("transform", "Learned transforms", {}, ("in", "state"), input_types={"in": "records", "state": "state"})
block("text", "Text", {"field": "text", "operation": "normalize", "pattern": "", "replacement": "", "size": 256, "overlap": 0})
block("array", "Raw", {"field": "value", "operation": "reshape", "shape": [-1]}, dependencies=("numpy",))
block("window", "Raw", {"size": 32, "stride": 32, "field": "value", "group": ""})
block("resample", "Raw", {"time": "timestamp", "field": "value", "group": "", "interval": 1.0})
block("image", "Images", {"operation": "resize", "width": 224, "height": 224, "mode": "RGB", "left": 0, "top": 0, "seed": 42}, dependencies=("PIL",))
block("audio", "Audio", {"operation": "resample", "rate": 16000, "channels": 1, "start": 0, "duration": 10}, dependencies=("ffmpeg", "ffprobe"))
block("video", "Video", {"operation": "frames", "fps": 1, "width": 640, "height": 360, "start": 0, "duration": 10}, dependencies=("ffmpeg", "ffprobe"))
block("custom", "Flow", {"module": "custom/block.py", "entrypoint": "transform", "batchSize": 256, "deterministic": False, "dependencies": []})
block("subflow", "Flow", {"graph": {"schemaVersion": 1, "name": "subflow", "nodes": [{"id": "input", "kind": "input", "params": {}}, {"id": "output", "kind": "output", "params": {}}], "edges": [{"source": "input", "target": "output"}]}})
block("output", "Outputs", {"format": "jsonl", "bundle": False, "inputFields": ["value"], "targetField": "label"})


def catalogue():
    availability = {}
    for definition in REGISTRY.values():
        for dep in definition["dependencies"]:
            if dep not in availability:
                availability[dep] = bool(shutil.which(dep)) if dep in ("ffmpeg", "ffprobe") else importlib.util.find_spec(dep) is not None
    return [{**d, "missing": [x for x in d["dependencies"] if not availability[x]]} for d in REGISTRY.values()]
