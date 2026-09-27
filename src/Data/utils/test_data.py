import json
import tempfile
import unittest
from pathlib import Path

from pipeline import parse, render, validate
from registry import REGISTRY
from storage import service

try:
    from runner import run, rows, split_file, write
except ModuleNotFoundError as runner_error:
    run = rows = split_file = write = None
else:
    runner_error = None


class DataModeTests(unittest.TestCase):
    def test_dataset_names_and_case_insensitive_collision(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            created = service({"action": "create", "workspace": str(root), "name": " Mèo Việt "})
            self.assertEqual(created["folder"], "Data_Mèo Việt")
            with self.assertRaises(FileExistsError):
                service({"action": "create", "workspace": str(root), "name": "mÈO viỆT"})
            for invalid in ("../escape", "CON", "bad/name", "trailing."):
                with self.assertRaises(ValueError):
                    service({"action": "create", "workspace": str(root), "name": invalid})

    def test_structured_code_round_trip_and_cycle_rejection(self):
        graph = {"schemaVersion": 1, "name": "prepare", "nodes": [
            {"id": "source", "kind": "source", "params": {"sourceId": "x"}, "x": 1, "y": 2},
            {"id": "output", "kind": "output", "params": {"format": "jsonl"}, "x": 3, "y": 4},
        ], "edges": [{"source": "source", "target": "output", "out": "out", "port": "in"}]}
        parsed = parse(render(graph))
        self.assertEqual(parsed, graph)
        validate(parsed, REGISTRY)
        parsed["edges"].append({"source": "output", "target": "output", "out": "out", "port": "in"})
        with self.assertRaisesRegex(ValueError, "one connection|cycle"):
            validate(parsed, REGISTRY)

    @unittest.skipUnless(split_file, "Python runtime does not include sqlite3")
    def test_split_keeps_lineages_together(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / "source.jsonl"
            write(source, ({"sample_id": f"{group}-{part}", "lineage": group, "label": str(group % 2)} for group in range(4) for part in range(2)))
            targets = [root / f"{name}.jsonl" for name in ("train", "validation", "test")]
            counts = split_file(source, targets, {"train": 50, "validation": 0, "test": 50, "seed": 42, "method": "random"})
            self.assertEqual(counts, [4, 0, 4])
            train = {r["lineage"] for r in rows(targets[0])}; test = {r["lineage"] for r in rows(targets[2])}
            self.assertFalse(train & test)

    @unittest.skipUnless(run, "Python runtime does not include sqlite3")
    def test_dataset_pipeline_run_and_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            created = service({"action": "create", "workspace": str(root), "name": "Mèo Việt"})
            self.assertEqual(created["folder"], "Data_Mèo Việt")
            source = root / "records.csv"
            source.write_text("sample_id,lineage,label,text\n1,a,cat,  Hello   WORLD  \n2,b,dog,Second\n", encoding="utf-8")
            registered = service({"action": "sources", "workspace": str(root), "folder": created["folder"], "path": str(source)})
            source_id = registered["sources"][0]["id"]
            loaded = service({"action": "load", "workspace": str(root), "folder": created["folder"], "pipeline": "prepare"})
            graph = {"schemaVersion": 1, "name": "prepare", "nodes": [
                {"id": "source", "kind": "source", "params": {"sourceId": source_id, "format": "csv", "encoding": "utf-8", "delimiter": ","}},
                {"id": "text", "kind": "text", "params": {"field": "text", "operation": "normalize"}},
                {"id": "output", "kind": "output", "params": {"format": "jsonl", "bundle": False}},
            ], "edges": [
                {"source": "source", "target": "text", "out": "out", "port": "in"},
                {"source": "text", "target": "output", "out": "out", "port": "in"},
            ]}
            service({"action": "save", "workspace": str(root), "folder": created["folder"], "pipeline": "prepare", "graph": graph,
                     "expectedRevision": 0, "expectedHash": loaded["hash"]})
            run({"workspace": str(root), "folder": created["folder"], "pipeline": "prepare", "runId": "1" * 32, "mode": "full"})
            status = json.loads((root / created["folder"] / "runs" / ("1" * 32) / "status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["status"], "complete")
            exported = root / created["folder"] / "exports" / status["version"]
            records = list(rows(exported / "output-out.jsonl"))
            self.assertEqual(records[0]["text"], "Hello WORLD")
            self.assertTrue((exported / "dataset.py").is_file())


if __name__ == "__main__":
    unittest.main()
