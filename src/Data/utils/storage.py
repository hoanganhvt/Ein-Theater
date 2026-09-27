"""Workspace-confined documents with optimistic revisions and atomic writes."""
import hashlib
import json
import os
import re
import shutil
import uuid
from pathlib import Path

from pipeline import parse, render, validate
from registry import REGISTRY, catalogue


def name(value):
    value = value.strip()
    if not value or value in (".", "..") or value.endswith((".", " ")) or re.search(r'[<>:"/\\|?*\x00-\x1f]', value):
        raise ValueError("Invalid folder name")
    if value.split(".")[0].upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        raise ValueError("Reserved Windows name")
    if len(value) > 100:
        raise ValueError("Name exceeds 100 characters")
    return value


def inside(root, relative, exists=False):
    root = Path(root).resolve()
    part = Path(relative)
    if part.is_absolute() or ".." in part.parts or not part.parts:
        raise ValueError("A relative workspace path is required")
    current = root
    for component in part.parts:
        current = current / component
        if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
            raise ValueError("Symlinks and junctions are not allowed")
    if not current.resolve().is_relative_to(root):
        raise ValueError("Path is outside workspace")
    if exists and not current.exists():
        raise ValueError(f"Path does not exist: {relative}")
    return current


def atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with tmp.open("w", encoding="utf-8", newline="\n") as f:
            f.write(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def dataset(root, folder):
    path = inside(root, folder, True)
    if path.parent != Path(root).resolve() or not path.name.startswith("Data_"):
        raise ValueError("Expected a Data_ folder directly inside workspace")
    manifest = read(inside(path, "dataset.json", True))
    if manifest.get("schemaVersion") != 1 or not manifest.get("id") or not isinstance(manifest.get("pipelines"), list):
        raise ValueError("Invalid dataset manifest")
    return path, manifest


def pipeline_path(path, pipeline):
    return inside(path, "pipelines/" + name(pipeline))


def service(req):
    action = req["action"]
    if action == "blocks":
        return {"blocks": catalogue()}
    if action == "parse":
        graph = parse(req["source"])
        validate(graph, REGISTRY)
        return {"graph": graph}
    root = Path(req["workspace"]).resolve()
    if not root.is_dir():
        raise ValueError("Select a workspace first")
    if action == "datasets":
        result = []
        for entry in sorted(root.iterdir()):
            if entry.is_dir() and entry.name.startswith("Data_"):
                try:
                    _, m = dataset(root, entry.name)
                    result.append({**m, "folder": entry.name})
                except (ValueError, OSError) as exc:
                    result.append({"name": entry.name, "folder": entry.name, "error": str(exc)})
        return {"datasets": result}
    if action == "create":
        label = name(req["name"])
        folder = "Data_" + label
        if any(p.name.casefold() == folder.casefold() for p in root.iterdir()):
            raise FileExistsError("Dataset folder already exists")
        path = inside(root, folder)
        path.mkdir()
        m = dict(schemaVersion=1, id=uuid.uuid4().hex, name=label, sources=[], pipelines=["prepare"], versions=[])
        graph = dict(schemaVersion=1, name="prepare", revision=0, nodes=[], edges=[])
        graph["codeHash"] = digest(render(graph))
        atomic(path / "pipelines/prepare/pipeline.json", graph)
        atomic(path / "pipelines/prepare/pipeline.py", render(graph))
        atomic(path / "dataset.json", m)
        return {**m, "folder": folder}
    path, m = dataset(root, req["folder"])
    if action == "sources":
        if "path" in req:
            source = Path(req["path"]).absolute()
            # Native/user-selected absolute paths are registered explicitly, never supplied by a block alone.
            current = source
            while current != current.parent:
                if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
                    raise ValueError("Source symlinks/junctions are not allowed")
                current = current.parent
            if not source.exists():
                raise ValueError("Source does not exist")
            if req.get("copy"):
                target = inside(path, "sources/" + name(source.name))
                if target.exists():
                    raise FileExistsError("Copied source already exists")
                target.parent.mkdir(exist_ok=True)
                if source.is_dir():
                    raise ValueError("Folder copy is not supported; register a reference or copy files first")
                shutil.copy2(source, target)
                source = target
            entry = {"id": uuid.uuid4().hex, "path": os.path.relpath(source, path), "absolute": str(source), "kind": "folder" if source.is_dir() else "file"}
            if req.get("replaceId"):
                m["sources"] = [s for s in m["sources"] if s["id"] != req["replaceId"]]
                entry["id"] = req["replaceId"]
            m["sources"].append(entry)
            atomic(path / "dataset.json", m)
        return {"sources": m["sources"]}
    if action == "history":
        active, runs = set(req.get("activeRuns", [])), []
        for status_path in sorted(path.glob("runs/*/status.json"), reverse=True):
            item = read(status_path)
            if item.get("status") in ("queued", "running") and item.get("id") not in active:
                item.update(status="interrupted", completed=None, error="Application stopped before the run completed")
                atomic(status_path, item)
            runs.append(item)
        return {"runs": runs, "versions": m["versions"]}
    if action == "snapshot":
        pp = pipeline_path(path, req.get("pipeline", "prepare"))
        graph = read(inside(pp, "pipeline.json", True))
        pipeline_source = inside(pp, "pipeline.py", True).read_text(encoding="utf-8")
        if graph.get("codeHash") and graph["codeHash"] != digest(pipeline_source):
            raise ValueError("Pipeline JSON and Python do not match")
        custom = {}
        for node in graph.get("nodes", []):
            if node.get("kind") == "custom":
                module = node.get("params", {}).get("module", "")
                if not module.startswith("custom/") or not module.endswith(".py"):
                    raise ValueError("Custom code must be a custom/*.py path")
                custom[module] = inside(pp, module, True).read_text(encoding="utf-8")
        return {"snapshot": {"graph": graph, "source": pipeline_source, "dataset": m, "custom": custom}}
    if action == "runStatus":
        run_id = req["runId"]
        if not re.fullmatch(r"[0-9a-f]{32}", run_id):
            raise ValueError("Invalid run ID")
        return {"run": read(inside(path, "runs/" + run_id + "/status.json", True))}
    if action == "runState":
        run_id = req["runId"]
        if not re.fullmatch(r"[0-9a-f]{32}", run_id):
            raise ValueError("Invalid run ID")
        target = inside(path, "runs/" + run_id + "/status.json")
        current = read(target) if target.exists() else {"id": run_id, "datasetId": m["id"], "pipeline": req.get("pipeline", "prepare")}
        current.update(status=req["status"], completed=req.get("completed"), error=req.get("error", ""))
        atomic(target, current)
        return {"run": current}
    if action == "bind":
        model = inside(root, req["model"], True)
        if model.parent != root or not (model / (model.name + ".json")).is_file() or not (model / (model.name + ".py")).is_file():
            raise ValueError("Choose a valid model folder")
        if req["version"] not in m["versions"]:
            raise ValueError("Unknown dataset version")
        atomic(model / "dataset-link.json", {"datasetId": m["id"], "path": os.path.relpath(path, model), "version": req["version"]})
        return {"bound": True}
    pp = pipeline_path(path, req.get("pipeline", "prepare"))
    if action == "clone":
        target_name = name(req["name"])
        target = pipeline_path(path, target_name)
        if any(n.casefold() == target_name.casefold() for n in m["pipelines"]):
            raise FileExistsError("Pipeline already exists")
        shutil.copytree(pp, target)
        graph = read(target / "pipeline.json")
        graph.update(name=target_name, revision=0)
        graph["codeHash"] = digest(render(graph))
        atomic(target / "pipeline.json", graph)
        atomic(target / "pipeline.py", render(graph))
        (target / "draft.json").unlink(missing_ok=True)
        m["pipelines"].append(target_name)
        atomic(path / "dataset.json", m)
        return {"pipeline": target_name}
    if action == "load":
        graph = read(inside(pp, "pipeline.json", True))
        source = inside(pp, "pipeline.py", True).read_text(encoding="utf-8")
        if graph.get("codeHash") and graph["codeHash"] != digest(source):
            raise ValueError("Pipeline JSON and Python were interrupted during a save; restore one version before editing")
        draft_path = inside(pp, "draft.json")
        draft = read(draft_path) if draft_path.exists() else None
        return {"graph": graph, "source": source, "hash": digest(source), "draft": draft, "dataset": m}
    if action == "draft":
        atomic(inside(pp, "draft.json"), {"graph": req["graph"], "source": req["source"], "baseRevision": req["baseRevision"], "baseHash": req["baseHash"], "codeDirty": bool(req.get("codeDirty"))})
        return {"synced": True}
    if action == "save":
        current = read(inside(pp, "pipeline.json", True))
        source = inside(pp, "pipeline.py", True).read_text(encoding="utf-8")
        if req.get("expectedRevision") != current["revision"] or req.get("expectedHash") != digest(source):
            raise FileExistsError("Pipeline changed externally; reload before saving")
        graph = req["graph"]
        validate(graph, REGISTRY)
        graph.update(revision=current["revision"] + 1, name=pp.name)
        generated = render(graph)
        graph["codeHash"] = digest(generated)
        # JSON is authoritative; an interrupted pair is detected by the next hash check.
        atomic(pp / "pipeline.py", generated)
        atomic(pp / "pipeline.json", graph)
        inside(pp, "draft.json").unlink(missing_ok=True)
        return {"graph": graph, "source": generated, "hash": digest(generated)}
    if action in ("customRead", "customSave"):
        relative = req.get("module", "custom/block.py")
        if not relative.startswith("custom/") or not relative.endswith(".py"):
            raise ValueError("Custom code must be a custom/*.py path")
        target = inside(pp, relative)
        source = target.read_text(encoding="utf-8") if target.exists() else "def transform(rows, context):\n    for row in rows:\n        yield row\n"
        if action == "customSave":
            if req.get("expectedHash") != digest(source):
                raise FileExistsError("Custom code changed externally")
            import ast
            ast.parse(req["source"])
            atomic(target, req["source"])
            source = req["source"]
        return {"source": source, "hash": digest(source)}
    raise ValueError("Unknown action: " + action)
