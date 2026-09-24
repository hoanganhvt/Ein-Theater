# Source resource paths

| Component (`source.go`) | Input | Output |
| --- | --- | --- |
| `SourceRoot` | Optional `EIN_THEATER_RESOURCE_DIR`, then current working directory | Uses the explicit resource directory for packaged Electron resources; otherwise walks ancestors, trying each directory and its `src` child for `go.mod` plus `templates/`. Falls back to cwd (or `.` if unavailable). |
| `Source` | Trusted resource components such as `Data`, `templates`, `data.html` | Joined path below SourceRoot. Does not read a file or create a directory. |

This supports repository, source, standalone mode and nested Go test directories.
Components are application configuration, not unchecked HTTP request values.
Electron supplies `EIN_THEATER_RESOURCE_DIR` pointing to packaged `app-src` assets
outside ASAR. Source-tree discovery remains the fallback for Go/browser development.

From `src`, run `go test ./utils/paths ./Canvas/mode -v`: explicit resource-root
resolution and page/static serving must succeed
from both source and standalone launch directories. Studio's registry tests do
not depend on Canvas resources for mode isolation.
