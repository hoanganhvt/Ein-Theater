# Shared Go utilities

Mode-independent resources live here. These packages must not import Canvas or
any other mode implementation. Feature task algorithms remain in their own mode.

| Package | Input | Output | Guide |
| --- | --- | --- | --- |
| `paths` | Current directory and trusted resource components | Source root / absolute resource path | [Contracts](paths/document.md) |
| `templates` | Trusted file and include recursion stack | Composed HTML bytes or error | [Contracts](templates/document.md) |
| `assets` | Ordered filesystems and requested filename | First available static file | [Contracts](assets/document.md) |

The [studio layer](../studio/document.md) owns HTTP status/header handling and mode
dispatch. It receives explicitly registered mode filesystems, without scanning
Canvas-specific names or deciding another mode's templates.

From `src`, run `go test ./studio ./Canvas/mode -v` to validate shared behavior and
both Canvas launch directories. `go test ./...` covers all mode and utility tests.
