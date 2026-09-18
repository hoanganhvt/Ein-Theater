# Shared static filesystem composition

The studio receives explicit global and mode filesystems. This package does not
probe Canvas paths, import modes or register HTTP routes.

| Component (`static.go`) | Input | Output / failure |
| --- | --- | --- |
| `Overlay` | Ordered `http.FileSystem` values | Combined filesystem; order controls precedence. |
| `overlay.Open` (internal) | Filename | First successfully opened file, otherwise `os.ErrNotExist`. Caller closes the file. |

Studio serves shared assets from `src/static`, each mode at `/static/<id>/`, and
optionally a legacy fallback at `/static/`. Global files precede legacy mode files.
New modes use namespaces and do not opt into flat compatibility assets.

From `src`, run `go test ./studio ./Canvas/mode -v`. Tests request identically named
files from two independent fake modes and verify namespace separation, legacy
fallback and real Canvas assets from both supported launch directories.
