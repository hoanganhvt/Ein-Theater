# Canvas templates

Canvas owns two complete editor documents and their fragments. The mode adapter
provides page callbacks; [studio](../../studio/document.md) owns global dispatch.

| Component | Input | Output / use |
| --- | --- | --- |
| `studio.html`, `studio/*` | Canvas editor markup and relative include files | Studio-home Canvas view, selected by `HomeHandler`. |
| `canvas.html`, `canvas/*` | Standalone editor markup and relative includes | Canvas page at `/canvas` and standalone root. |
| `sidebar.html`, `sidebar/*` | Canvas palette, workspace and project fragments | Canvas sidebar response after studio mode selection. |

Both complete pages declare `body[data-studio-mode="canvas"]`, load Canvas's
application script and opt into `/static/studio/navigation.js`. The shared menu
uses `/api/modes`; available future modes navigate to their own documents.

The shared composer in `src/utils/templates` resolves includes relative to their
owner and rejects unsafe or cyclic includes. The studio HTTP renderer handles
GET/HEAD, response headers and atomic failure output. Scripts and CSS remain in
Canvas/static or the shared src/static directory, according to ownership.

From `src`, run `go test ./Canvas/mode -v`. Expected: both launch directories serve
complete pages and assets; HEAD has no body; POST pages return 405; bad includes
return 500 without partial HTML. From repository root, run
`node src/Canvas/static/js/ui.test.mjs` and
`node src/static/studio/navigation.test.mjs` for UI bindings and registry navigation.
