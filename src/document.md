# Source map and execution flow

The [global code-flow guide](../document.md) is the project-wide architecture
reference. It explains startup, state ownership, graph editing, asynchronous shape
analysis, Python generation, save/load, concurrency and end-to-end tests.

See [studio registration and expansion](studio/document.md) for adding Data, Code, Train and Debug. Shared Go resources live in [utils](utils/document.md); Canvas exports its [mode adapter](Canvas/mode/document.md).

## Read the source in runtime order

```mermaid
flowchart TD
    Main[main.go or Canvas/canvas.go] --> Routes[studio.NewHandler and mode definitions]
    Routes --> Page[Templates and static assets]
    Page --> App[Canvas/static/app.js]
    App --> Init[js/application/bootstrap.js]
    Init --> API[js/api and feature modules]
    API --> Handlers[Canvas/handler]
    Handlers --> Tasks[Canvas/utils Go packages]
    Tasks --> Python[Python shape and generation packages]
    Python --> Output[Metadata or saved model artifacts]
    Output --> Handlers
    Handlers --> API
```

| Source area | Input | Output / role |
| --- | --- | --- |
| `main.go` | Environment and launch directory | Studio server with Canvas routes. |
| `Canvas/canvas.go` | Environment and launch directory | Standalone Canvas server. |
| [templates](templates/document.md) | Future shared shell resources | Mode-owned editor HTML stays with its mode. |
| [static](static/document.md) | Asset requests | Shared styles. |
| [Canvas templates](Canvas/templates/document.md) | Canvas/sidebar fragments | Canvas page and UI mount points. |
| [Canvas frontend](Canvas/static/js/document.md) | User events and graph responses | Rendered canvas, API mutations and metadata refresh. |
| [HTTP handlers](Canvas/handler/document.md) | HTTP requests | Validated utility calls and responses. |
| [Categorized utilities](Canvas/utils/document.md) | Graph commands, paths and snapshots | Graph state, file IO, HTML composition and Python orchestration. |
| [Python shape analysis](Canvas/utils/auto_shape_fitting/document.md) | Canvas and base directory | Fitted parameters, tensor diagnostics and adapted submodels. |
| [Python generation](Canvas/utils/generate%20code/document.md) | Validated canvas/computational graph | Model JSON and executable Python source. |

## Main call paths

- **First render:** `main` → route registration → page composition → `app.js` →
  `initApp` → `loadGraph` → `/api/data?analyze=false` → render datasets → background analysis.
- **Edit:** feature event → API wrapper → matching handler → `utils/graph`
  operation under `Store.Mu` → response → UI update.
- **Analyze:** shape-refresh scheduler → `DataHandler` → detached snapshot →
  Go Python bridge → shape worker → guarded metadata reconciliation → dataset update.
- **Save:** `saveActiveModel` → `SaveModelHandler` → snapshot → generation subprocess
  → infer/validate → canvas conversion → FX/source rendering → artifact writes → UI refresh.
- **Load:** `loadModelFromFolder` → `LoadModelHandler` → `modelio.Load` →
  `Store.ImportGraph` → project/graph refresh.

Run `go run .` here for studio mode or from `Canvas` for standalone mode. Run
`go test ./...` and `go vet ./...` here. The global guide contains frontend/Python
commands, expected outcomes and the manual test sequence for the complete flow.

## Studio presentation

The UI separates application mode navigation from model commands. Shared visual tokens and responsive component styles live in `static/styles`; Canvas owns its graph rendering and page markup. See [the visual system and UI verification guide](static/styles/document.md#studio-visual-system) for inputs, outputs, ownership, and manual checks.
