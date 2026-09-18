# Source resource paths

| Component (`source.go`) | Input | Output |
| --- | --- | --- |
| `SourceRoot` | Current working directory | Walks ancestors, trying each directory and its `src` child for `go.mod` plus `templates/`. Returns the first match; falls back to cwd (or `.` if cwd is unavailable). |
| `Source` | Trusted resource components such as `Data`, `templates`, `data.html` | Joined path below SourceRoot. Does not read a file or create a directory. |

This supports repository, source, standalone mode and nested Go test directories.
Components are application configuration, not unchecked HTTP request values.
Discovery is for source-tree execution; a packaged distribution should preserve
this resource layout or supply an explicit resource mechanism in a later change.

From `src`, run `go test ./Canvas/mode -v`: page and static serving must succeed
from both source and standalone launch directories. Studio's registry tests do
not depend on Canvas resources for mode isolation.
