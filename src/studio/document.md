# Studio routing and mode registration

The studio owns application-level HTTP behavior. It imports no Canvas, Data, Code,
or Debug feature implementation. `src/main.go` is the composition root that supplies
mode definitions. Canvas-specific HTML is owned by Canvas even when it is the
first page shown at `/`.

## Component input/output contracts

| Component | Input | Output / side effects |
| --- | --- | --- |
| `Mode` (`routes.go`) | Lowercase ID, display name and optional capabilities | Registration descriptor. Nil `Page` means planned/unavailable, not a stub implementation. |
| `Mode.Page` | GET/HEAD request at `/<id>` | Mode-owned complete HTML page. |
| `Mode.Home` | Root/index request when this mode is the studio default | Optional alternate editor page; falls back to `Page`. Standalone config always uses `Page`. |
| `Mode.Sidebar` | Dispatched sidebar request | Mode-owned HTML fragment. Nil means no sidebar endpoint for this mode. |
| `Mode.API` | Private `*http.ServeMux` | Registers relative routes such as `/jobs`, mounted under `/api/<id>/`. No return. |
| `Mode.Static` | Asset path within this mode | `http.FileSystem`, served under `/static/<id>/`. |
| `LegacyAPI` | Optional global legacy-route registrar | Registers explicit flat API aliases. Only one mode may supply it; new modes leave it nil. Explicit paths prevent a future mode subtree from redirecting a legacy endpoint. |
| `LegacyStatic` | Compatibility flag | Allows one mode filesystem as fallback for flat static paths; new modes leave it false. |
| `Config` | Ordered mode definitions, default ID, standalone flag | Router configuration; order determines menu order. |
| `NewHandler` | Config | Independent `http.Handler` or validation error. Rejects duplicate/reserved/invalid IDs, unavailable defaults, active resources on planned entries, or conflicting legacy ownership. |
| `IndexHandler` | Default mode and standalone flag | Handler dispatching to its Home/Page; GET/HEAD only, no-cache headers. No template lookup or Canvas fallback. |
| `SidebarHandler` | Mode map and default ID | Handler resolving query `mode`, then `/api/sidebar/<id>`, then default. Unknown/planned/sidebar-less modes return 404. GET/HEAD only. |
| `ServeTemplate` (`render.go`) | ResponseWriter, request, trusted template path | Fully composed HTML, HEAD without body, 405 for other methods, 500 for composition failure without partial output. |
| `AllowPageMethod` | Request/response | Boolean; rejects unsupported method with Allow header and 405. |
| `NoCache` | ResponseWriter | Sets Cache-Control, Pragma and Expires headers. |
| Internal `exact`, `noCache` | Path/next handler | Exact page routing (unknown suffixes return 404) and shared asset cache policy. |

`/api/modes` returns an ordered JSON array `{id,name,available,url?}`. Planned modes
have no URL and no executable page/API/static/sidebar registration. GET and HEAD
are supported. The shared navigation script uses this endpoint.

## Route ownership

| Owner | Routes |
| --- | --- |
| Studio | `/`, `/index`, `/api/modes`, `/api/sidebar`, `/api/sidebar/<id>`, shared `/static/` |
| Registered mode | `/<id>`, `/api/<id>/*`, `/static/<id>/*`; optional sidebar callback |
| Canvas compatibility | Existing `/api/addNode`, `/api/data`, `/api/workspace/*`, etc., and old `/static/app.js` / Canvas asset paths |

For example, `/api/data` remains the legacy **Canvas graph** endpoint;
`/api/data/*` is the namespace of a future **Data mode**. Do not add new flat URLs.
Modes may reuse relative endpoint and asset names without shadowing one another.
Global static files win over legacy Canvas fallbacks. Registry IDs are trusted
startup configuration; request values never become template filenames.
The repository includes Canvas's `vis-network` asset in `src/static/vendor`, so
direct `go run` sessions can draw without Electron.

## Implement Data, Code or Debug

1. Create a feature directory, e.g. `src/Data/handler`, `templates`, `static` and
   task-specific `utils`. Keep its state and workflows out of Canvas packages.
2. Add `src/Data/mode` returning `studio.Mode`. Register only relative API paths.
   Use `paths.Source("Data", "templates", "data.html")` and `studio.ServeTemplate`
   for a page. Give the page its own JavaScript entry under `/static/data/`.
3. Replace the matching `studio.ShellPage` registration in `src/main.go` with `data.Definition()`.
   Do not edit `studio` or `Canvas/handler/routes.go` to add mode-specific routes.
4. For shared navigation, render `id="appModeTabs"`, set
   `<body data-studio-mode="data">`, and load `/static/studio/navigation.js` as a
   module. Available modes navigate to their pages.
5. Add mode-local HTTP/task tests, folder documentation with input/output/error
   contracts, and an integration test through `studio.NewHandler`.

Example descriptor (after implementing the referenced Data handlers):

```go
func Definition() studio.Mode {
    return studio.Mode{
        ID: "data", Name: "Data",
        Page: handler.Page, Sidebar: handler.Sidebar,
        API: handler.RegisterAPI,
        Static: http.Dir(paths.Source("Data", "static")),
    }
}
```

Canvas and Code now share the active project in Go. Code stores its per-project
draft alongside Canvas graph state in the session. Other modes remain independent.
Page navigation is a full document navigation, not a Canvas sidebar swap or a
single-page-app lifecycle. Nondefault modes can load without Canvas JavaScript.

## Test the expansion boundary

From `src`:

```powershell
go test ./studio ./Canvas/mode -v
go test ./...
go vet ./...
go test -race ./...
```

`TestIndependentModesAndNamespaces` uses two fake modes, with no Canvas dependency,
and verifies separate pages, identical relative APIs/assets, default dispatch,
standalone selection, sidebar dispatch, unavailable modes and legacy compatibility.
`TestRegistryValidation` checks invalid configuration. Canvas mode tests also verify that a future Data API subtree does not redirect the legacy Canvas `/api/data` endpoint. Canvas integration tests run
from both supported launch directories and verify page composition/static assets.

From the repository root, run
`node src/static/studio/navigation.test.mjs`. Expected: the active mode is marked,
an available sibling navigates to its URL, and an unavailable mode is disabled.
Manually launch studio and check Canvas, Data, Debug, and Code appear. Data and
Debug have development shells; Code has a Python editor.
# Current studio navigation

The application menu is `EinTheater File Edit Mode`. `/api/modes` returns Canvas,
Data, Debug and Code in that order. Data and Debug use `ShellPage`; Code has its
own editor and API. The standalone Canvas
entry registers Canvas only. `static/studio/menubar.js` owns menu interaction,
while `navigation.js` fills the Mode dropdown from the registry.
Canvas waits for pending graph writes and Code synchronizes its draft before following a Mode link. Run
`node src/static/studio/menubar.test.mjs` and
`node src/static/studio/navigation.test.mjs` for menu behavior.
