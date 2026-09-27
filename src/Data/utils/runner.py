"""Disk-backed local pipeline runner. Each edge is a JSONL stream."""
import csv
import datetime
import hashlib
import importlib.util
import importlib.metadata
import itertools
import json
import math
import os
import random
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import unicodedata
import uuid
from pathlib import Path

from pipeline import expand_subflows, semantic, validate
from registry import REGISTRY, catalogue
from storage import atomic, dataset, inside, read


def rows(path):
    with Path(path).open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line)


def write(path, values, limit=None):
    count = 0
    with Path(path).open("w", encoding="utf-8", newline="\n") as stream:
        for value in values:
            if limit is not None and count >= limit:
                break
            stream.write(json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n")
            count += 1
    return count


def source_rows(path, params):
    fmt = params.get("format", "auto").lower()
    if fmt == "auto":
        fmt = path.suffix.lower().lstrip(".") if path.is_file() else "folder"
    if fmt in ("csv", "tsv"):
        with path.open(encoding=params.get("encoding", "utf-8"), newline="") as f:
            yield from csv.DictReader(f, delimiter="\t" if fmt == "tsv" else params.get("delimiter", ","))
    elif fmt == "jsonl":
        yield from rows(path)
    elif fmt == "json":
        value = read(path)
        yield from value if isinstance(value, list) else [value]
    elif fmt == "txt":
        field = params.get("field", "text")
        with path.open(encoding=params.get("encoding", "utf-8")) as f:
            for number, line in enumerate(f):
                yield {"sample_id": str(number), field: line.rstrip("\r\n")}
    elif fmt == "folder":
        pattern = params.get("pattern", "*")
        for item in sorted(path.rglob(pattern)):
            if item.is_file() and not item.is_symlink():
                relative = item.relative_to(path).as_posix()
                yield {"sample_id": relative, "path": str(item), "lineage": relative}
    elif fmt in ("npy", "npz"):
        import numpy as np
        value = np.load(path, mmap_mode="r", allow_pickle=False)
        arrays = {"value": value} if fmt == "npy" else value
        length = len(next(iter(arrays.values())))
        for i in range(length):
            yield {"sample_id": str(i), **{k: v[i].tolist() for k, v in arrays.items()}}
    elif fmt in ("xlsx", "xlsm"):
        import openpyxl
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheet = book.active
        iterator = sheet.iter_rows(values_only=True)
        headers = [str(x) for x in next(iterator)]
        for value in iterator:
            yield dict(zip(headers, value))
    elif fmt == "parquet":
        import pyarrow.parquet as pq
        for batch in pq.ParquetFile(path).iter_batches(batch_size=2048):
            yield from batch.to_pylist()
    else:
        raise ValueError(f"Unsupported source format: {fmt}")


def compare(value, operator, expected):
    if operator == "eq": return value == expected
    if operator == "ne": return value != expected
    if operator == "contains": return str(expected) in str(value)
    if operator == "regex": return bool(re.search(str(expected), str(value)))
    if operator == "gt": return value > expected
    if operator == "gte": return value >= expected
    if operator == "lt": return value < expected
    if operator == "lte": return value <= expected
    raise ValueError(f"Unsupported comparison operator: {operator}")


def transform(values, kind, p):
    if kind == "select":
        return ({k: r.get(k) for k in p["fields"] if k in r} for r in values)
    if kind == "rename":
        return ({p["mapping"].get(k, k): v for k, v in r.items()} for r in values)
    if kind == "cast":
        cast = {"string": str, "int": int, "float": float, "bool": bool}[p["type"]]
        return ({**r, p["field"]: cast(r[p["field"]])} for r in values)
    if kind == "filter":
        return (r for r in values if compare(r.get(p["field"]), p["operator"], p.get("value")))
    if kind == "missing":
        field = p["field"]
        if p["action"] == "drop":
            return (r for r in values if r.get(field) not in (None, ""))
        return ({**r, field: p.get("value") if r.get(field) in (None, "") else r.get(field)} for r in values)
    if kind == "text":
        if p["operation"] == "chunk":
            def chunks():
                size, overlap = int(p["size"]), int(p.get("overlap", 0))
                if size <= 0 or overlap < 0 or overlap >= size: raise ValueError("Text chunk requires 0 <= overlap < size")
                for r in values:
                    value = str(r.get(p["field"], ""))
                    for start in range(0, len(value), size - overlap):
                        part = value[start:start + size]
                        if part: yield {**r, p["field"]: part, "lineage": r.get("lineage", r.get("sample_id")), "chunk": start}
            return chunks()
        def apply(r):
            value, op = str(r.get(p["field"], "")), p["operation"]
            if op == "normalize": value = unicodedata.normalize("NFC", " ".join(value.split()))
            elif op == "lower": value = value.lower()
            elif op == "regex": value = re.sub(p["pattern"], p.get("replacement", ""), value)
            elif op in ("tokens", "tokenize"): return {**r, p["field"]: value.split()}
            return {**r, p["field"]: value}
        return (apply(r) for r in values)
    if kind == "window":
        def windows():
            size, stride, field = int(p["size"]), int(p["stride"]), p["field"]
            for r in values:
                value = r[field]
                for start in range(0, max(0, len(value) - size + 1), stride):
                    yield {**r, field: value[start:start + size], "lineage": r.get("lineage", r.get("sample_id")), "window": start}
        return windows()
    if kind == "shuffle":
        # ponytail: bounded-buffer shuffle; use sort-by-random-key if exact global shuffle is required.
        def shuffled():
            rng, buffer = random.Random(p.get("seed", 42)), []
            for r in values:
                buffer.append(r)
                if len(buffer) >= 4096:
                    rng.shuffle(buffer)
                    yield from buffer
                    buffer = []
            rng.shuffle(buffer); yield from buffer
        return shuffled()
    return values


def materialize_media(values, kind, p, folder):
    folder.mkdir(parents=True, exist_ok=True)
    for i, r in enumerate(values):
        source = Path(r["path"])
        target = folder / f"{i:08d}{source.suffix.lower()}"
        if kind == "image":
            from PIL import Image, ImageOps
            with Image.open(source) as image:
                image = ImageOps.exif_transpose(image)
                original_width, original_height = image.size
                op = p["operation"]
                annotations = r.get("annotations")
                if annotations and any("mask" in item for item in annotations): raise ValueError("Image mask transforms are not supported; remove the transform or provide a custom block")
                if op == "resize":
                    width, height = int(p["width"]), int(p["height"]); image = image.resize((width, height))
                    if annotations:
                        r = {**r, "annotations": [{**item, "bbox": [item["bbox"][0]*width/original_width, item["bbox"][1]*height/original_height, item["bbox"][2]*width/original_width, item["bbox"][3]*height/original_height]} if "bbox" in item else item for item in annotations]}
                elif op == "crop":
                    left, top, width, height = p["left"], p["top"], p["width"], p["height"]
                    image = image.crop((left, top, left + width, top + height))
                    if annotations:
                        def cropped(item):
                            if "bbox" not in item: return item
                            x, y, w, h = item["bbox"]; x1, y1, x2, y2 = max(x, left), max(y, top), min(x+w, left+width), min(y+h, top+height)
                            return {**item, "bbox": [x1-left, y1-top, max(0, x2-x1), max(0, y2-y1)]}
                        r = {**r, "annotations": [item for item in map(cropped, annotations) if "bbox" not in item or item["bbox"][2] > 0 and item["bbox"][3] > 0]}
                elif op == "mode": image = image.convert(p["mode"])
                elif op == "pad":
                    if annotations: raise ValueError("Pad with spatial annotations requires a custom block")
                    image = ImageOps.pad(image, (int(p["width"]), int(p["height"])))
                elif op == "augment" and r.get("split", "train") == "train":
                    rng = random.Random(f"{p.get('seed', 42)}:{r.get('lineage', r.get('sample_id', i))}")
                    if rng.random() < .5:
                        image = ImageOps.mirror(image)
                        if annotations: r = {**r, "annotations": [{**item, "bbox": [original_width-item["bbox"][0]-item["bbox"][2], item["bbox"][1], item["bbox"][2], item["bbox"][3]]} if "bbox" in item else item for item in annotations]}
                    if not annotations: image = image.rotate(rng.uniform(-10, 10))
                elif op == "normalize":
                    import numpy as np
                    target = target.with_suffix(".npy"); np.save(target, np.asarray(image, dtype=np.float32) / 255.0)
                    yield {**r, "path": str(target), "lineage": r.get("lineage", r.get("sample_id"))}; continue
                image.save(target)
            yield {**r, "path": str(target), "lineage": r.get("lineage", r.get("sample_id"))}
            continue
        target = target.with_suffix(".wav" if kind == "audio" else (".jpg" if p["operation"] == "frames" else ".mp4"))
        if kind == "video" and p["operation"] == "metadata":
            result = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(source)], check=True, capture_output=True, text=True)
            yield {**r, "media": json.loads(result.stdout), "lineage": r.get("lineage", r.get("sample_id"))}; continue
        if r.get("segments") and p["operation"] not in ("trim", "resample", "normalize", "augment"):
            raise ValueError(f"{kind} operation {p['operation']} cannot preserve temporal annotations")
        if r.get("segments") and p["operation"] == "trim":
            start, duration = float(p.get("start", 0)), float(p.get("duration", 0))
            adjusted = []
            for segment in r["segments"]:
                left, right = max(float(segment["start"]), start), float(segment["end"])
                if duration: right = min(right, start + duration)
                if right > left: adjusted.append({**segment, "start": left-start, "end": right-start})
            r = {**r, "segments": adjusted}
        cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", str(p.get("start", 0)), "-i", str(source)]
        if p.get("duration"): cmd += ["-t", str(p["duration"])]
        if kind == "audio":
            if p["operation"] == "spectrogram": target = target.with_suffix(".png"); cmd += ["-lavfi", "showspectrumpic=s=1024x512", str(target)]
            else:
                if p["operation"] == "normalize": cmd += ["-af", "loudnorm"]
                elif p["operation"] == "augment" and r.get("split", "train") == "train":
                    rng = random.Random(f"{p.get('seed', 42)}:{r.get('lineage', r.get('sample_id', i))}"); cmd += ["-af", f"volume={rng.uniform(.8,1.2):.3f}"]
                cmd += ["-ar", str(p["rate"]), "-ac", str(p["channels"]), str(target)]
        elif p["operation"] == "frames":
            target = folder / f"{i:08d}_%06d.jpg"
            cmd += ["-vf", f"fps={p['fps']},scale={p['width']}:{p['height']}", str(target)]
        elif p["operation"] == "audio": target = target.with_suffix(".wav"); cmd += ["-vn", str(target)]
        elif p["operation"] == "resize": cmd += ["-vf", f"scale={p['width']}:{p['height']}", str(target)]
        else: cmd += ["-c", "copy", str(target)]
        subprocess.run(cmd, check=True)
        matches = sorted(folder.glob(target.name.replace("%06d", "*")))
        for part, item in enumerate(matches or [target]):
            yield {**r, "path": str(item), "lineage": r.get("lineage", r.get("sample_id")), "part": part}


def split_file(source, targets, p):
    percentages = [float(p[k]) for k in ("train", "validation", "test")]
    if any(x < 0 for x in percentages) or abs(sum(percentages) - 100) > 1e-7:
        raise ValueError("Split percentages must be non-negative and total 100")
    method, field = p.get("method", "random"), p.get("field", "label")
    db_path = Path(source).with_suffix(".split.sqlite")
    db = sqlite3.connect(db_path)
    db.execute("CREATE TABLE records(pos INTEGER PRIMARY KEY, random_key TEXT, lineage_key TEXT, label TEXT, group_key TEXT, time_key TEXT, payload TEXT)")
    seed, group_field, time_field = int(p.get("seed", 42)), p.get("group", ""), p.get("time", "timestamp")
    total = 0
    for total, record in enumerate(rows(source), 1):
        identity = record.get("lineage", record.get("sample_id", total))
        key = hashlib.sha256(f"{seed}:{identity}".encode()).hexdigest()
        lineage = str(record.get("lineage", record.get("sample_id", total)))
        db.execute("INSERT INTO records VALUES(?,?,?,?,?,?,?)", (total, key, lineage, str(record.get(field, "")), str(record.get(group_field, "")), str(record.get(time_field, "")), json.dumps(record, ensure_ascii=False)))
        if total % 10000 == 0: db.commit()
    db.commit()
    if not total: raise ValueError("Cannot split an empty dataset")
    desired = [total * x / 100 for x in percentages]
    allocated = [math.floor(value) for value in desired]
    for index in sorted(range(3), key=lambda i: (desired[i] - allocated[i], -i), reverse=True)[:total - sum(allocated)]: allocated[index] += 1
    bounds = [allocated[0], allocated[0] + allocated[1]]
    streams = [Path(path).open("w", encoding="utf-8", newline="\n") for path in targets]
    counts = [0, 0, 0]
    try:
        if method in ("random", "group", "chronological", "stratified"):
            if method == "group" and not group_field: raise ValueError("Group split requires a group field")
            unit = "group_key" if method == "group" else "lineage_key"
            if method == "stratified":
                if db.execute(f"SELECT 1 FROM records GROUP BY {unit} HAVING COUNT(DISTINCT label)>1 LIMIT 1").fetchone():
                    raise ValueError("A lineage group cannot contain multiple stratification labels")
                enabled = sum(x > 0 for x in percentages)
                if db.execute(f"SELECT 1 FROM records GROUP BY label HAVING COUNT(DISTINCT {unit}) < ? LIMIT 1", (enabled,)).fetchone():
                    raise ValueError("Every class needs at least one lineage group per enabled split")
                groups = db.execute(f"WITH grouped AS (SELECT {unit} unit,MIN(label) label,COUNT(*) size,MIN(random_key) random_key,MIN(time_key) time_key FROM records GROUP BY {unit}), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY label ORDER BY random_key) rn,COUNT(*) OVER(PARTITION BY label) total FROM grouped) SELECT unit,size,time_key FROM ranked ORDER BY (1.0*rn)/total,label")
            elif method == "chronological":
                groups = db.execute(f"SELECT {unit},COUNT(*),MIN(time_key) FROM records GROUP BY {unit} ORDER BY MIN(time_key),MIN(pos)")
            else:
                groups = db.execute(f"SELECT {unit},COUNT(*),MIN(time_key) FROM records GROUP BY {unit} ORDER BY MIN(random_key)")
            count, previous_index, boundary_time, last_time = 0, 0, None, None
            for group_key, size, time_key in groups:
                index = 0 if count < bounds[0] else (1 if count < bounds[1] else 2)
                current_time = None
                if method == "chronological":
                    def timestamp(value):
                        try: return float(value)
                        except ValueError: return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
                    current_time = timestamp(time_key)
                    if index > previous_index and float(p.get("gap", 0)) > 0:
                        if boundary_time is None: boundary_time = last_time
                        if boundary_time is not None and current_time - boundary_time < float(p["gap"]): count += size; continue
                        previous_index, boundary_time = index, None
                for payload, in db.execute(f"SELECT payload FROM records WHERE {unit}=? ORDER BY pos", (group_key,)):
                    record = json.loads(payload); record["split"] = ("train", "validation", "test")[index]
                    streams[index].write(json.dumps(record, ensure_ascii=False) + "\n"); counts[index] += 1
                if current_time is not None: last_time = current_time
                count += size
        else:
            ordering = "random_key"
            for count, (payload,) in enumerate(db.execute(f"SELECT payload FROM records ORDER BY {ordering}")):
                index = 0 if count < bounds[0] else (1 if count < bounds[1] else 2)
                record = json.loads(payload); record["split"] = ("train", "validation", "test")[index]
                streams[index].write(json.dumps(record, ensure_ascii=False) + "\n"); counts[index] += 1
    finally:
        for stream in streams: stream.close()
        db.close(); db_path.unlink(missing_ok=True)
    return counts


def disk_block(kind, paths, outputs, p, work):
    source = paths.get("in")
    if kind == "sample":
        count, rng, reservoir = int(p["count"]), random.Random(p.get("seed", 42)), []
        for index, row in enumerate(rows(source)):
            if index < count: reservoir.append(row)
            else:
                target = rng.randint(0, index)
                if target < count: reservoir[target] = row
        return write(outputs["out"], reservoir)
    if kind in ("sort", "deduplicate", "aggregate", "join", "resample"):
        db = sqlite3.connect(work / (kind + ".sqlite"))
        try:
            if kind == "join":
                right_key, left_key = p["rightKey"], p["leftKey"]
                db.execute("CREATE TABLE right_rows(key TEXT, payload TEXT, matched INTEGER DEFAULT 0)"); db.execute("CREATE INDEX right_key ON right_rows(key)")
                db.executemany("INSERT INTO right_rows(key,payload) VALUES(?,?)", ((str(r.get(right_key)), json.dumps(r, ensure_ascii=False)) for r in rows(paths["right"])))
                def joined():
                    for left in rows(paths["left"]):
                        matches = list(db.execute("SELECT rowid,payload FROM right_rows WHERE key=?", (str(left.get(left_key)),)))
                        if matches:
                            for rowid, payload in matches: db.execute("UPDATE right_rows SET matched=1 WHERE rowid=?", (rowid,)); yield {**left, **json.loads(payload)}
                        elif p.get("how") in ("left", "outer"): yield left
                    if p.get("how") == "outer":
                        for payload, in db.execute("SELECT payload FROM right_rows WHERE matched=0"): yield json.loads(payload)
                return write(outputs["out"], joined())
            if kind == "resample":
                interval = float(p["interval"])
                if interval <= 0: raise ValueError("Resample interval must be positive")
                db.execute("CREATE TABLE samples(group_key TEXT,bucket INTEGER,value REAL)")
                db.executemany("INSERT INTO samples VALUES(?,?,?)", ((str(r.get(p.get("group", ""), "")), math.floor(float(r[p["time"]])/interval), float(r[p["field"]])) for r in rows(source)))
                def resampled():
                    for group, bucket, value in db.execute("SELECT group_key,bucket,AVG(value) FROM samples GROUP BY group_key,bucket ORDER BY group_key,bucket"):
                        yield {p.get("group") or "group": group, p["time"]: bucket*interval, p["field"]: value}
                return write(outputs["out"], resampled())
            if kind == "sort":
                db.execute("CREATE TABLE items(key_num REAL,key_text TEXT,payload TEXT)")
                def sortable():
                    for r in rows(source):
                        value = r.get(p["field"]); yield (float(value) if isinstance(value, (int, float)) else None, str(value), json.dumps(r, ensure_ascii=False))
                db.executemany("INSERT INTO items VALUES(?,?,?)", sortable())
                direction = "DESC" if p.get("descending") else "ASC"
                return write(outputs["out"], (json.loads(x[0]) for x in db.execute(f"SELECT payload FROM items ORDER BY key_num IS NULL,key_num {direction},key_text {direction}")))
            db.execute("CREATE TABLE items(key TEXT, payload TEXT)")
            fields = p.get("fields", [])
            if kind == "deduplicate":
                db.execute("CREATE UNIQUE INDEX unique_key ON items(key)")
                for r in rows(source): db.execute("INSERT OR IGNORE INTO items VALUES(?,?)", (json.dumps([r.get(k) for k in fields], ensure_ascii=False), json.dumps(r, ensure_ascii=False)))
                db.commit(); return write(outputs["out"], (json.loads(x[0]) for x in db.execute("SELECT payload FROM items ORDER BY rowid")))
            group, field, operation = p["group"], p["field"], p["operation"]
            db.executemany("INSERT INTO items VALUES(?,?)", ((str(r.get(group)), json.dumps(r.get(field), ensure_ascii=False)) for r in rows(source)))
            def aggregates():
                for key, count, minimum, maximum, average in db.execute("SELECT key,COUNT(*),MIN(CAST(payload AS REAL)),MAX(CAST(payload AS REAL)),AVG(CAST(payload AS REAL)) FROM items GROUP BY key"):
                    yield {group: key, operation: {"count": count, "min": minimum, "max": maximum, "mean": average}[operation]}
            return write(outputs["out"], aggregates())
        finally:
            db.close(); (work / (kind + ".sqlite")).unlink(missing_ok=True)
    raise ValueError(f"Unsupported disk block: {kind}")


def learned(kind, paths, outputs, p):
    if kind == "fit":
        field, operation = p["field"], p["operation"]
        if operation in ("vocabulary", "categories"):
            db_path = outputs["state"].with_suffix(".sqlite"); db = sqlite3.connect(db_path)
            db.execute("CREATE TABLE values_(value TEXT PRIMARY KEY,count INTEGER)")
            for record in rows(paths["in"]):
                values = str(record.get(field, "")).split() if operation == "vocabulary" else [str(record.get(field, ""))]
                for value in values: db.execute("INSERT INTO values_ VALUES(?,1) ON CONFLICT(value) DO UPDATE SET count=count+1", (value,))
            limit = int(p.get("maxTokens", 50000))
            values = [value for value, in db.execute("SELECT value FROM values_ ORDER BY count DESC,value LIMIT ?", (limit,))]
            db.close(); db_path.unlink(missing_ok=True)
            state = {"field": field, "operation": operation, "values": values}
        else:
            count, mean, m2 = 0, 0.0, 0.0
            for record in rows(paths["in"]):
                if record.get(field) in (None, ""): continue
                value = float(record[field]); count += 1; delta = value - mean; mean += delta / count; m2 += delta * (value - mean)
            if not count: raise ValueError("Cannot fit an empty dataset")
            state = {"field": field, "operation": operation, "mean": mean, "scale": math.sqrt(m2 / count) or 1.0}
        write(outputs["state"], [state])
        return write(outputs["out"], rows(paths["in"]))
    state = next(rows(paths["state"]), None)
    if not state: raise ValueError("Transform requires fitted state")
    field, operation = state["field"], state["operation"]
    if operation in ("vocabulary", "categories"):
        indexes = {value: index + 1 for index, value in enumerate(state["values"])}
        def encoded():
            for record in rows(paths["in"]):
                value = record.get(field, "")
                result = [indexes.get(token, 0) for token in str(value).split()] if operation == "vocabulary" else indexes.get(str(value), 0)
                yield {**record, field: result}
        return write(outputs["out"], encoded())
    if operation == "impute":
        return write(outputs["out"], ({**r, field: state["mean"] if r.get(field) in (None, "") else r[field]} for r in rows(paths["in"])))
    return write(outputs["out"], ({**r, field: (float(r[field]) - state["mean"]) / state["scale"]} for r in rows(paths["in"])))


def source_fingerprint(path):
    digest = hashlib.sha256()
    items = [path] if path.is_file() else (p for p in sorted(path.rglob("*")) if p.is_file() and not p.is_symlink())
    for item in items:
        stat = item.stat()
        digest.update(str(item).encode()); digest.update(f":{stat.st_size}:{stat.st_mtime_ns}".encode())
    return digest.hexdigest()


def export_stream(source, target, fmt):
    if fmt == "jsonl":
        shutil.copy2(source, target); return
    if fmt == "csv":
        iterator = rows(source); first = next(iterator, None)
        with target.open("w", encoding="utf-8", newline="") as stream:
            if first is None: return
            writer = csv.DictWriter(stream, fieldnames=list(first)); writer.writeheader(); writer.writerow(first)
            for record in iterator: writer.writerow({key: record.get(key) for key in first})
        return
    if fmt == "parquet":
        import pyarrow as pa
        import pyarrow.parquet as pq
        writer, batch = None, []
        try:
            for record in rows(source):
                batch.append(record)
                if len(batch) == 2048:
                    table = pa.Table.from_pylist(batch); writer = writer or pq.ParquetWriter(target, table.schema); writer.write_table(table); batch = []
            if batch:
                table = pa.Table.from_pylist(batch); writer = writer or pq.ParquetWriter(target, table.schema); writer.write_table(table)
        finally:
            if writer: writer.close()
        return
    raise ValueError(f"Unsupported export format: {fmt}")


def bundle_assets(source, target, export):
    assets = export / "assets"; assets.mkdir(exist_ok=True)
    def bundled():
        for record in rows(source):
            value = record.get("path")
            if value and Path(value).is_file():
                original = Path(value)
                name = hashlib.sha256(str(original).encode()).hexdigest()[:16] + original.suffix.lower()
                destination = assets / name
                if not destination.exists(): shutil.copy2(original, destination)
                record = {**record, "path": "assets/" + name}
            yield record
    write(target, bundled())


def run(request):
    root = Path(request["workspace"]).resolve()
    data_path, current_manifest = dataset(root, request["folder"])
    snapshot = request.get("snapshot", {})
    manifest = snapshot.get("dataset", current_manifest)
    pipeline_name = request.get("pipeline", "prepare")
    saved_graph = snapshot.get("graph") or read(inside(data_path, f"pipelines/{pipeline_name}/pipeline.json", True))
    graph = expand_subflows(saved_graph)
    order, by_id, incoming = validate(graph, REGISTRY)
    missing = {d["id"]: d["missing"] for d in catalogue() if d["missing"]}
    for n in graph["nodes"]:
        if n["kind"] in missing: raise RuntimeError(f"{n['id']}: missing {', '.join(missing[n['kind']])}")
    run_id = request["runId"]
    run_path = inside(data_path, "runs/" + run_id)
    work = run_path / "work"; work.mkdir(parents=True, exist_ok=True)
    quarantine_path = run_path / "quarantine.jsonl"
    status_path = run_path / "status.json"
    status = dict(id=run_id, datasetId=manifest["id"], pipeline=pipeline_name, mode=request.get("mode", "full"), status="running", started=time.time(), blocks={}, inputs={}, environment={"python": sys.version}, logs=[])
    atomic(status_path, status)
    outputs = {}
    signatures = {}
    cache = inside(data_path, ".cache"); cache.mkdir(exist_ok=True)
    source_map = {s["id"]: s for s in manifest["sources"]}
    limit = 100 if request.get("mode") == "preview" else None
    error_policy = request.get("errorPolicy", "stop")
    def guarded(values, block_id, operation):
        for record in values:
            try:
                yield from operation(record)
            except Exception as exc:
                if error_policy != "quarantine": raise
                with quarantine_path.open("a", encoding="utf-8", newline="\n") as stream:
                    stream.write(json.dumps({"block": block_id, "error": str(exc), "record": record}, ensure_ascii=False) + "\n")
                status["quarantined"] = status.get("quarantined", 0) + 1
    for index, id in enumerate(order):
        node, kind, p = by_id[id], by_id[id]["kind"], by_id[id].get("params", {})
        status["blocks"][id] = {"status": "running", "progress": index / max(1, len(order))}
        atomic(status_path, status)
        paths = {e.get("port", "in"): outputs[(e["source"], e.get("out", "out"))] for e in incoming[id]}
        file_id = hashlib.sha256(id.encode()).hexdigest()[:16]
        node_outputs = {port: work / f"{file_id}-{port}.jsonl" for port in REGISTRY[kind]["outputs"]}
        clean_node = {k: v for k, v in node.items() if k not in ("x", "y")}
        upstream = [signatures[(e["source"], e.get("out", "out"))] for e in incoming[id]]
        signature_data = json.dumps([clean_node, upstream, sys.version, request.get("mode")], sort_keys=True, ensure_ascii=False)
        dependency_names = (["numpy"] if kind == "array" else p.get("dependencies", []) if kind == "custom" else [])
        for dependency in dependency_names:
            try: signature_data += f"{dependency}={importlib.metadata.version(dependency)}"
            except importlib.metadata.PackageNotFoundError: raise RuntimeError(f"{id}: missing Python package {dependency}")
        cacheable = error_policy == "stop" and kind not in ("source", "image", "audio", "video") and (kind != "custom" or p.get("deterministic"))
        if kind == "custom" and cacheable:
            custom_source = snapshot.get("custom", {}).get(p["module"])
            signature_data += hashlib.sha256((custom_source.encode() if custom_source is not None else inside(data_path, f"pipelines/{pipeline_name}/{p['module']}", True).read_bytes())).hexdigest()
        signature = hashlib.sha256(signature_data.encode()).hexdigest()
        details = {}
        cached = {port: cache / f"{signature}-{port}.jsonl" for port in node_outputs}
        if cacheable and all(path.is_file() for path in cached.values()):
            count = 0
            for port, cached_path in cached.items():
                try: os.link(cached_path, node_outputs[port])
                except OSError: shutil.copy2(cached_path, node_outputs[port])
                signatures[(id, port)] = hashlib.sha256((signature + port).encode()).hexdigest()
                count += sum(1 for _ in rows(node_outputs[port]))
            status["blocks"][id] = {"status": "complete", "count": count, "progress": 1, "cached": True}
            for port, output in node_outputs.items(): outputs[(id, port)] = output
            continue
        if kind == "source":
            source = source_map.get(p.get("sourceId"))
            if not source: raise ValueError(f"{id}: choose a registered source")
            relative_source = (data_path / source.get("path", "")).resolve()
            source_path = relative_source if relative_source.exists() else Path(source["absolute"])
            if not source_path.exists() or source_path.is_symlink(): raise ValueError(f"{id}: registered source is missing or unsafe")
            signature = source_fingerprint(source_path)
            status["inputs"][id] = {"path": str(source_path), "fingerprint": signature}
            count = write(node_outputs["out"], source_rows(source_path, p), limit)
        elif kind in ("output", "input"):
            count = write(node_outputs["out"], rows(paths["in"]) if kind == "output" else [], limit)
        elif kind == "shuffle":
            count = write(node_outputs["out"], transform(rows(paths["in"]), kind, p), limit)
        elif kind in ("select", "rename", "cast", "filter", "missing", "text", "window"):
            count = write(node_outputs["out"], guarded(rows(paths["in"]), id, lambda record: transform(iter([record]), kind, p)), limit)
        elif kind in ("sample", "sort", "deduplicate", "aggregate", "join", "resample"):
            count = disk_block(kind, paths, node_outputs, p, work)
        elif kind == "array":
            import numpy as np
            field = p["field"]
            def array(record):
                value = np.asarray(record[field])
                if p["operation"] == "reshape": value = value.reshape(p["shape"])
                elif p["operation"] == "normalize": value = (value - value.mean()) / (value.std() or 1)
                return iter([{**record, field: value.tolist()}])
            count = write(node_outputs["out"], guarded(rows(paths["in"]), id, array), limit)
        elif kind in ("image", "audio", "video"):
            count = write(node_outputs["out"], guarded(rows(paths["in"]), id, lambda record: materialize_media(iter([record]), kind, p, work / (file_id + "-media"))), limit)
        elif kind == "router":
            streams = {name: node_outputs[name].open("w", encoding="utf-8", newline="\n") for name in ("true", "false")}
            count = 0
            try:
                for record in rows(paths["in"]):
                    branch = "true" if compare(record.get(p["field"]), p["operator"], p.get("value")) else "false"
                    streams[branch].write(json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n"); count += 1
            finally:
                for stream in streams.values(): stream.close()
        elif kind == "concatenate":
            count = write(node_outputs["out"], itertools.chain(rows(paths["left"]), rows(paths["right"])), limit)
        elif kind == "split":
            counts = split_file(paths["in"], [node_outputs[k] for k in ("train", "validation", "test")], p); count = sum(counts); details["outputs"] = dict(zip(("train", "validation", "test"), counts))
        elif kind in ("fit", "transform"):
            count = learned(kind, paths, node_outputs, p)
        elif kind == "custom":
            for dependency in p.get("dependencies", []):
                if importlib.util.find_spec(dependency) is None: raise RuntimeError(f"{id}: missing Python package {dependency}")
            custom_source = snapshot.get("custom", {}).get(p["module"])
            if custom_source is not None:
                module_path = work / (hashlib.sha256(p["module"].encode()).hexdigest()[:16] + ".py"); module_path.write_text(custom_source, encoding="utf-8")
            else:
                module_path = inside(data_path, f"pipelines/{pipeline_name}/{p['module']}", True)
            spec = importlib.util.spec_from_file_location("ein_custom_" + uuid.uuid4().hex, module_path)
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            artifact_path = work / (id + "-artifacts"); artifact_path.mkdir()
            context = {"seed": p.get("seed", 42), "artifacts": str(artifact_path), "runId": run_id}
            count = write(node_outputs["out"], getattr(module, p["entrypoint"])(rows(paths["in"]), context), limit)
        else:
            raise ValueError(f"Unsupported executable block: {kind}")
        for port, output in node_outputs.items():
            outputs[(id, port)] = output
            signatures[(id, port)] = hashlib.sha256((signature + port).encode()).hexdigest()
            if cacheable:
                temporary = cached[port].with_suffix(".tmp"); shutil.copy2(output, temporary); os.replace(temporary, cached[port])
        status["blocks"][id] = {"status": "complete", "count": count, "progress": 1, **details}
    terminal = [(id, port, path) for (id, port), path in outputs.items() if not any(e["source"] == id and e.get("out", "out") == port for e in graph["edges"])]
    if not terminal: raise ValueError("Pipeline has no output")
    if request.get("mode") == "preview":
        status["preview"] = [r for _, _, path in terminal for r in rows(path)][:100]
    else:
        version = time.strftime("%Y%m%d-%H%M%S") + "-" + run_id[:6]
        final_export = inside(data_path, "exports/" + version)
        export = inside(data_path, "exports/.tmp-" + run_id); export.mkdir(parents=True)
        splits, adapter_splits = {}, {}
        for id, port, path in terminal:
            node = by_id[id]
            fmt = node.get("params", {}).get("format", "jsonl") if node["kind"] == "output" else "jsonl"
            if node.get("params", {}).get("bundle"):
                bundled = work / f"{id}-{port}-bundled.jsonl"; bundle_assets(path, bundled, export); path = bundled
            target = export / f"{id}-{port}.{fmt}"; export_stream(path, target, fmt)
            key = port if port not in splits else f"{id}_{port}"
            splits[key] = target.name
            adapter = target if fmt == "jsonl" else export / f"{id}-{port}.adapter.jsonl"
            if fmt != "jsonl": shutil.copy2(path, adapter)
            adapter_splits[key] = adapter.name
        atomic(export / "manifest.json", {"schemaVersion": 1, "datasetId": manifest["id"], "version": version, "pipeline": saved_graph, "splits": splits, "adapterSplits": adapter_splits})
        if quarantine_path.exists(): shutil.copy2(quarantine_path, export / "quarantine.jsonl")
        atomic(export / "dataset.py", """import json\nfrom pathlib import Path\ntry:\n from torch.utils.data import IterableDataset, get_worker_info\nexcept ImportError:\n class IterableDataset: pass\n def get_worker_info(): return None\nclass EinDataset(IterableDataset):\n def __init__(self, manifest, split='out'):\n  self.root=Path(manifest).parent; m=json.loads(Path(manifest).read_text(encoding='utf-8')); self.path=self.root/m['adapterSplits'][split]\n def __iter__(self):\n  worker=get_worker_info(); offset=worker.id if worker else 0; step=worker.num_workers if worker else 1\n  with self.path.open(encoding='utf-8') as stream:\n   for index,line in enumerate(stream):\n    if index%step==offset: yield json.loads(line)\ndef dataloader(manifest, split='out', **kwargs):\n from torch.utils.data import DataLoader\n return DataLoader(EinDataset(manifest, split), num_workers=kwargs.pop('num_workers',0), **kwargs)\n""")
        os.replace(export, final_export)
        latest_manifest = read(data_path / "dataset.json"); latest_manifest["versions"].append(version); atomic(data_path / "dataset.json", latest_manifest)
        status["version"] = version
    status.update(status="complete", completed=time.time(), progress=1)
    atomic(status_path, status)


def main():
    request = read(sys.argv[1])
    try:
        run(request)
    except Exception as exc:
        data_path, _ = dataset(request["workspace"], request["folder"])
        status_path = inside(data_path, "runs/" + request["runId"] + "/status.json")
        old = read(status_path) if status_path.exists() else {"id": request["runId"]}
        old.update(status="failed", error=str(exc), completed=time.time())
        atomic(status_path, old)
        raise


if __name__ == "__main__":
    main()
