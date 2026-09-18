# Model navigation performance

## Confirmed bottleneck

A local UNet fixture had 5 nodes and 5 edges but occupied 71,085,020 bytes on disk.
Three IntegratedModel captions contained repeated mojibake; two captions each
exceeded 5.8 million JavaScript string characters. The graph response was
26,372,264 bytes. This was display data, not weights or a large topology.

Snapshots cloned these strings through JSON under the project mutex, and responses
encoded them again. File loading decoded a RawMessage wrapper and canvas separately.

### Local benchmark sample

One iteration per sub-benchmark on the same Windows machine and unchanged fixture:

| Operation | Before | After |
| --- | ---: | ---: |
| Read/decode model | 1,643 ms | 672 ms |
| Clone snapshot | 374 ms | 0.59 ms |
| Snapshot plus JSON response | 447 ms | 0.53 ms |
| Response size | 26,372,264 bytes | 4,441 bytes |
| Snapshot allocations | 180,720,752 bytes | 50,632 bytes |

These are diagnostic samples, not statistically stable browser latency claims.
Response serialization runs after snapshot benchmarking; warmup can make it appear
faster. Initial loading still reads the original 71 MB file. No fixture was rewritten.

## Changed component contracts

| Component | Input | Output / effects |
| --- | --- | --- |
| modelio.DecodeCanvas | Wrapped or legacy JSON bytes | GraphData/error, decoded once and repaired before entering snapshots. Shared by Load and ReadModelCanvas. |
| graph.RepairLegacyLabels | GraphData pointer | Repairs only IntegratedModel captions over 4096 UTF-8 bytes starting with U+00C3. Recurses through adapted graphs; rebuilds short name/ID captions. No return or disk writes; ordinary labels, params and topology are preserved. |
| Python repair_legacy_labels | Canvas dictionary | Equivalent in-memory repair for nested models; threshold measured in Python characters. Called by saved_canvas.read_canvas. |
| Python bridge processEnvironment | Inherited environment | Explicit PYTHONUTF8=1 and PYTHONIOENCODING=utf-8, plus disabled bytecode writes. Used for both subprocess paths. |
| loadGraph({projectId}) | Optional selected project ID | Pinned graph snapshot request. Omitted ID retains active-project behavior. |
| Frontend load/switch actions | Successful mutation response | Concurrent project-list and graph fetches; sidebar latency no longer blocks graph loading. |
| Load-model response | File loading/project import | Server-Timing read_decode and import entries, in milliseconds; import includes mutex wait. |

Locale-dependent pipe decoding on Windows was a plausible source of repeated
mojibake expansion; the historic corruption could not be reproduced without a
working Python installation. Pipe encoding is now explicit. The browser already
derives rich integrated-model captions from model and port parameters.

## Reproduce and verify

From src, with a saved folder containing its JSON/Python companion files:

```powershell
$env:EIN_MODEL_BENCH_PATH = 'C:\models\unet'
go test ./Canvas/utils/modelio -run '^$' -bench BenchmarkModelNavigation -benchtime=3x -count=3
go test ./...
go vet ./...
go test -race ./...
```

The benchmark skips without EIN_MODEL_BENCH_PATH and never changes the fixture.
Compare response size and allocations as well as time. Use the same machine and
fixture; avoid concurrent application or benchmark workloads.

From the repository root:

```powershell
node src/Canvas/static/js/performance.test.mjs
node src/Canvas/static/js/api.test.mjs
node src/Canvas/static/js/ui.test.mjs
python -B -m unittest discover -s src/Canvas/utils/tests -p test_saved_canvas_labels.py -v
```

The Python caption regression needs only Python. The Go worker Unicode round-trip
test needs Python/PyTorch and explicitly skips otherwise. Go tests verify selective
repair and environment overrides. The frontend test blocks the project-list request
and verifies that the selected graph still loads.

For UI diagnosis, inspect load-model, projects and data in browser Network. Compare
transfer sizes and Server-Timing. A successful application save can persist compact
captions; the original large file remains expensive to read until then. Save only
when validation succeeds. This change does not cache all inference or eliminate
Vis Network reconstruction; those need separate evidence if slowness remains.
