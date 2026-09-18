# Shared HTML composition

This mode-independent package only reads and composes trusted template files.
HTTP handling belongs to [studio](../../studio/document.md); callers choose explicit
resource paths with [paths](../paths/document.md). It never searches Canvas as a
fallback for another mode.

| Component (`templates.go`) | Input | Output / failure |
| --- | --- | --- |
| `templateInclude` | Static HTML include markers | Compiled matcher for `<!-- include: relative/path.html -->`. |
| `ComposeTemplate` | Trusted file path and fresh `map[string]bool` stack | Composed bytes/error. Includes resolve relative to their owning file. Rejects cycles, nonlocal paths and `..` include names. Missing/read failures return errors. |
| `ExtractSidebarFromHTML` | Trusted composed-page path | Complete sidebar div or error when markup is absent/unbalanced. Retained for the Canvas fallback; no mode discovery. |

Discard returned bytes when composition returns an error. `studio.ServeTemplate`
composes before writing, ensuring failed includes cannot send partial pages.
This is static include processing, not evaluation of user-supplied templates.

From `src`, run `go test ./Canvas/mode -v`. Expect successful complete pages and
static serving from both launch directories; missing, cyclic and parent includes
must return 500 with no partial content. For mode isolation, also run
`go test ./studio -v`. No Python is required.
