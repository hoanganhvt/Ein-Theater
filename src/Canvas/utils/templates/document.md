# HTML template composition

This Go package discovers and assembles trusted static HTML fragments. HTTP
headers, method validation, status codes and response writes stay in
`handler/template_handler.go` and `handler/index_handler.go`.

| Component (`templates.go`) | Input | Output / failure |
| --- | --- | --- |
| `FindTemplatePath` | Relative template filename | First matching path across supported studio/Canvas launch directories, preferably absolute. If absent, returns the conventional Canvas path so the caller can handle the missing file. |
| `templateInclude` (internal) | HTML marker `<!-- include: relative/file.html -->` | Compiled expression used to identify include directives. |
| `ComposeTemplate` | File path and a fresh `map[string]bool` recursion stack | Fully expanded bytes and nil, or an error for missing/unreadable files, cycles, nonlocal paths or `..` in include names. The recursion stack is restored on return. |
| `ExtractSidebarFromHTML` | Template path | Composed sidebar `<div>` including nested divs; error if the sidebar or closing div is absent, or composition fails. |

`ComposeTemplate` may return intermediate bytes alongside an error; callers must
discard those bytes. The HTTP adapter composes everything before writing, so
failed includes never leak a partially rendered page. This is static composition,
not an engine for evaluating user-provided templates.

## Test composition and page routes

From `src`:

```powershell
go test ./Canvas/handler -run 'TestUIRoutesComposeFragments|TestTemplateIncludeFailuresAreAtomic' -v
```

Expected: root, index, canvas and both sidebar routes return 200 and contain their
UI mount elements with no unresolved include markers. Tests run from both supported
launch directories. Missing, recursive and parent-directory includes return 500
without partial `<main>` content. No Python or browser is required.

Manual check: run `go run .` from `src`, open `http://localhost:8080/`, and verify
the canvas and palette render. Stop the server, run `go run .` from `src/Canvas`,
and repeat for standalone Canvas mode.
