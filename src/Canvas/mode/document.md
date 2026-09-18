# Canvas mode adapter

This package connects Canvas to the studio registry. It owns no application-wide
routes and adds no graph state.

| Component | Input | Output / behavior |
| --- | --- | --- |
| `Definition()` (`mode.go`) | Source-resource discovery | `studio.Mode` with ID/name, Canvas page, studio-home variant, sidebar, relative API registrar and Canvas static filesystem. |
| `Page` | `GET /canvas`, or standalone `/` | `handler.CanvasHandler` renders `Canvas/templates/canvas.html`. |
| `Home` | Studio `/` or `/index` when Canvas is default | `handler.HomeHandler` renders Canvas-owned `Canvas/templates/studio.html`. |
| API / assets | Relative mode request | APIs mount at `/api/canvas/*`; assets at `/static/canvas/*`. The explicit legacy API registrar and legacy-static flag preserve flat Canvas URLs. |

`src/main.go` includes this definition alongside planned Data, Code, Train and Debug
entries. `src/Canvas/canvas.go` includes only this definition with `Standalone:true`.
Both entry points use the same studio router. Handler tests can still use
`handler.RegisterRoutes` to mount just legacy Canvas APIs without application pages.

From `src`, run `go test ./Canvas/mode -v`. The page/static tests run from `src` and
`src/Canvas`, checking resolved HTML includes and JS/CSS assets. Template failure
tests require atomic error responses for missing, cyclic and parent-path includes.
See [studio contracts](../../studio/document.md) for namespace and expansion tests.
