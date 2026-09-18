# Static asset discovery

The Go package resolves filesystems; route registration and cache headers remain
in `handler/routes.go`.

| Component (`static.go`) | Input | Output / failure |
| --- | --- | --- |
| `ResolveStaticFS` | Current working directory and candidate asset folders | `http.FileSystem` combining the global folder identified by `style.css` and Canvas folder identified by `canvas.css`. Falls back to `http.Dir("static")`. |
| `multiDirFS` (internal) | Ordered `http.Dir` slice | Filesystem which searches global assets before Canvas assets. |
| `multiDirFS.Open` | Asset filename from `http.FileServer` | First successfully opened `http.File`, or `os.ErrNotExist` after all directories fail. Caller closes the file. |

## Test static serving

From `src`, run:

```powershell
go test ./Canvas/handler -run TestUIRoutesComposeFragments -v
```

Expected: PASS from studio and standalone Canvas launch directories. The test
requests JavaScript entry points, nested modules, shared CSS and Canvas CSS and
expects HTTP 200. For a manual check, run `go run .`, open `/static/app.js` and
`/static/canvas-styles/interactions.css`, and inspect the no-cache response headers.
