# Data mode: architecture and behavior

Data mode builds local, versioned dataset pipelines with a visual graph and a restricted Python representation. It supports record, text, image, audio, video, NumPy, spreadsheet, and Parquet sources. Full execution requires Python 3 with `sqlite3`; individual blocks report optional packages or tools such as Pillow, NumPy, PyArrow, openpyxl, and FFmpeg.

## Storage

New datasets use `Data_<display name>` folders. New Canvas models use `Model_<display name>` folders. Display names allow Unicode and spaces, while empty names, traversal, Windows reserved names, path separators, control characters, and trailing periods are rejected. Workspace discovery validates prefixed folders before identifying them as models or datasets. Legacy model folders remain readable and are never renamed automatically.

```text
Data_Cats/
  dataset.json
  pipelines/prepare/{pipeline.json,pipeline.py,custom/}
  runs/<run-id>/{request.json,status.json,runner.log,work/}
  exports/<version-id>/{manifest.json,dataset.py,...}
  .cache/
```

`dataset.json` owns the stable dataset ID, display name, registered sources, pipeline names, and immutable output version IDs. Pipeline JSON is authoritative. Writes use a temporary file plus `os.replace`; pipeline saves require both the expected revision and Python-file hash. A synchronized `draft.json` preserves unsaved graph/code state across mode changes.

Sources are explicitly registered before a Source block can read them. Their absolute and relative locations are recorded so sources inside a moved dataset can still resolve. Paths, symlinks, junctions, dataset prefixes, and manifest versions are checked at the Python boundary. Raw inputs are never modified.

## Editor and Code mode

`Data/templates/data.html` and `Data/static/data.js` provide the dataset/pipeline/source sidebar, searchable block palette, vis-network canvas, port connection prompts, parameter inspector, undo/redo, preview, run progress, cancellation, and export actions. Preview is explicit and limited to 100 source records.

Pipeline Python contains only `Pipeline`, `p.block(...)`, and `p.connect(...)` calls with literal arguments. `pipeline.py` parses this syntax with `ast.literal_eval` and never executes it. Applying Code updates the graph atomically after block, port, type, required-input, duplicate-input, and cycle validation. Arbitrary logic lives in a `custom/*.py` module and is only executed during a trusted local run. Unsaved pipeline code is synchronized as a draft; an unsaved custom block must be saved before leaving Code.

Subflows have one public input and output in the current implementation. The runner recursively inlines them with stable prefixed IDs and rejects recursive or malformed graphs.

## Execution

Go owns a one-job local queue and launches a separate Python process per run. The API is loopback-only for execution. Cancellation removes queued work or terminates the Python process tree, including FFmpeg children on Windows. Status is written per block and survives page navigation; a failed or unavailable runtime produces a failed run instead of publishing an export.

Each block reads and writes JSONL in the run directory. Streaming blocks keep only a record or bounded shuffle buffer in memory. Join, sort, deduplication, aggregation, and split use temporary SQLite files. Media contents remain file references. Reusable deterministic block results are cached from semantic configuration, upstream signatures, custom code, mode, and Python version; canvas coordinates do not invalidate cache.

Split supports random, stratified, group, and chronological ordering with a configurable seed and train/validation/test percentages totaling 100. Related frames, clips, chunks, and augmentations use `lineage` as one assignment unit. Stratified split rejects a lineage with conflicting labels and classes too small for enabled outputs. Group sizes can make actual ratios differ from requested ratios.

Image transforms use Pillow. Audio and video transforms launch FFmpeg. Table/array formats use the standard library or their optional dependencies. Custom blocks receive an iterator plus `{seed, artifacts, runId}` and return an iterable of records. Custom code has the user's local permissions and is not sandboxed.

## Export and API

Exports are written to a new version folder only after the graph succeeds. Output blocks support JSONL, CSV, and Parquet. Portable output copies referenced assets and rewrites their paths. Every version contains its saved pipeline, split mapping, canonical JSONL adapter streams, and a PyTorch `IterableDataset`/`DataLoader` adapter. Worker IDs partition lines, preventing duplicates when `num_workers` is greater than zero; the default is zero.

The mode registers `/api/data/blocks`, `/datasets`, `/pipelines`, `/code/parse`, `/runs`, `/runs/{id}`, and `/runs/{id}/cancel`. Desktop requests retain the application token middleware. Pipeline conflicts return HTTP 409; malformed paths, graphs, manifests, or requests return JSON errors.

## Verification

From `desktop/`, run `npm.cmd test`. This covers Go packages, mode/static routing, workspace model/dataset classification, folder-name validation, Code behavior, frontend modules, Electron security, and packaged Data resources.

With a full Python installation, run:

```powershell
python -m unittest discover -s src/Data/utils -p "test_*.py" -v
```

The Python checks cover structured-code round trips, cycle rejection, lineage-safe deterministic splitting, a CSV-to-text pipeline, atomic version export, and the generated adapter. Runner tests skip when the selected Python distribution does not provide `sqlite3`.
