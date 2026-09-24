# UI source audit and architecture

## Scope and original-file analysis

The UI consists of the studio and standalone page templates, the dynamic Canvas sidebar, browser JavaScript, shared CSS and the browser schema registry. Go graph handlers and Python generation/shape inference remain backend concerns; global routing and navigation belong to the studio layer, while Canvas supplies mode callbacks and owns its templates. The table records every original UI source and its new ownership. Small state and data files are deliberately retained because they already have one responsibility.

| Original file (relative to this folder) | Previous responsibilities | New location | Refactor decision |
| --- | --- | --- | --- |
| [app.js](app.js) | Application initialization and global handlers | [js/application/](js/application/document.md) | Two modules; root entry retains DOM readiness and public exports. |
| [js/api.js](js/api.js) | HTTP client, tensor labels and mutation refresh | [js/api/](js/api/document.md) | Endpoint groups, labels and refresh decorator; composed API remains stable. |
| [js/circuit.js](js/circuit.js) | Geometry, drawing, gestures and edge editing | [js/circuit/](js/circuit/document.md) | Twelve modules with explicit shared runtime state. |
| [js/graph.js](js/graph.js) | Loading, normalization, dragging, selection and node creation | [js/graph/](js/graph/document.md) | Eight modules; loading delegates data preparation, options and interactions. |
| [js/modals.js](js/modals.js) | Add/edit node dialogs and parameter persistence | [js/modals/](js/modals/document.md) | Categories, add dialog, edit form, parameter submission and lifecycle. |
| [js/workspace.js](js/workspace.js) | Workspace explorer, native folder selection and model files | [js/workspace/](js/workspace/document.md) | Chooser, sidebar, menu, models and notifications. |
| [js/clipboard.js](js/clipboard.js) | Clipboard persistence, operations, UI and shortcuts | [js/clipboard/](js/clipboard/document.md) | Operations retain storage ownership; presentation and shortcuts are separate. |
| [js/contextMenu.js](js/contextMenu.js) | Right-click menu and deletion | [js/contextMenu/](js/contextMenu/document.md) | Menu orchestration and selection deletion. |
| [js/schemas.js](js/schemas.js) | Embedded schemas, loading and naming | [js/schemas/](js/schemas/document.md) | Fallback data, registry and labels. |
| [js/projects.js](js/projects.js) | Project list and title rename | [js/projects/](js/projects/document.md) | Project lifecycle and rename UI. |
| [js/palette.js](js/palette.js) | Catalog, rendering and placement | [js/palette/](js/palette/document.md) | Catalog data, rendering and drag/drop. |
| [js/modes.js](js/modes.js) | Tool mode and click placement | [js/modes/](js/modes/document.md) | Toolbar mode changes and canvas placement. |
| [js/selection.js](js/selection.js) | Rubber-band selection | [js/selection/](js/selection/document.md) | Gesture ownership and reusable hit testing. |
| [js/sidebarLoader.js](js/sidebarLoader.js) | Sidebar lifecycle and mode tabs | [js/sidebarLoader/](js/sidebarLoader/document.md) | Loading and navigation. |
| [js/utils.js](js/utils.js) | Escaping and model naming | [js/utils/](js/utils/document.md) | HTML escaping and identifier normalization. |
| [js/state.js](js/state.js) | Shared application references and transient UI state | [js/state.js](js/state.js) | Retained as a small single-purpose store; this is a plain object, not a reactive framework. |
| [js/api.test.mjs](js/api.test.mjs) | Automatic tensor refresh regression checks | [js/api.test.mjs](js/api.test.mjs) | Preserved; new ui.test.mjs adds refactor integration coverage. |
| [data/modules.json](data/modules.json) | Browser-served layer schema registry | [data/modules.json](data/modules.json) | Retained as data; feature code consumes registry.js. |
| [../../static/style.css](../../static/style.css) | Global UI styling | [../../static/styles/](../../static/styles/document.md) | Sixteen ordered component stylesheets. |
| [canvas.css](canvas.css) | Duplicated shared styles and one Canvas interaction difference | [canvas-styles/](canvas-styles/document.md) | Only Canvas-specific banner interaction remains; shared rules live in global styles. |
| [Former studio index](../templates/studio.html) | Studio document shell and all UI markup | [Canvas studio fragments](../templates/studio/document.md) | Seven named partials composed server-side. |
| [../templates/canvas.html](../templates/canvas.html) | Standalone Canvas document and UI markup | [../templates/canvas/](../templates/canvas/document.md) | Seven named partials preserving standalone differences. |
| [../templates/sidebar.html](../templates/sidebar.html) | Workspace, projects and palette markup | [../templates/sidebar/](../templates/sidebar/document.md) | Three partials returned as one sidebar response. |

## Startup and serving

1. The Go page handler composes `<!-- include: relative/file.html -->` markers before sending HTML. Includes resolve beside their owner, fail on missing files or cycles, and are buffered so failures cannot return a partly assembled page.
2. `style.css` imports shared component styles in the original cascade order; `canvas.css` follows it and enables pointer interaction on the mode banner.
3. `app.js` imports the HTML handler bridge, waits for the DOM and calls the bootstrap module.
4. Bootstrap initializes the schema registry, loads and initializes the sidebar, loads the graph, and attaches canvas, clipboard and save shortcuts.
5. Graph loading requests an immediate snapshot without Python analysis, normalizes backend records, creates datasets and a Vis Network, then registers circuit drawing, node dragging and selection events. Shape metadata refreshes in the background through a debounced, project-aware queue.

## Folder ownership and dependency rules

The `js/` root contains compatibility entry points and the small shared state store. Each feature folder owns its implementation and a detailed `document.md`. Public exports and asset URLs are preserved where still applicable; folder selection now uses `chooseWorkspace()` rather than the removed HTML modal exports. Feature-local imports use sibling modules. Electron bundles the existing Vis Network and Inter assets locally for offline distribution; no frontend framework was added.

Shared application state belongs to `js/state.js`. Circuit gesture state belongs to `js/circuit/runtime.js`. Drag baselines and clipboard caches stay private to their owning features; workspace selection has no browser navigation state. Data in `modules.json` is separate from rendering code. Global styles use `/static/styles/`; Canvas overrides use `/static/canvas-styles/` so the merged static filesystem cannot accidentally shadow files with the same names.

## Existing behavior and limitations

The studio and standalone templates are intentionally kept as separate variants. Before this refactor, the studio referenced two missing connection-type handlers, `setSelectedEdgeType` and `selectModalEdgeType`; the standalone variant does not expose those controls. This refactor preserves that discrepancy instead of adding new connection semantics. The inline-handler test explicitly records those two exceptions and checks every other handler.

Palette setup guards individual elements against duplicate event listeners. HTML partials must be served through the Go handlers, not opened directly as local files. The HTML folder-selection modal has been removed; Electron opens the Windows directory picker, and Windows browser development calls the Go native-picker endpoint. Vis Network and Inter fonts are served from local bundled assets.

## Verification

From the repository root run `node src/Canvas/static/js/api.test.mjs` and `node src/Canvas/static/js/ui.test.mjs`. From `src`, run `go test ./...`. The Go UI tests render `/`, `/index`, `/canvas` and both sidebar route forms, check nested static assets from both supported launch directories, and reject missing/circular/escaping includes atomically. Python-dependent tests require Python and their existing dependencies.

Manual smoke flow: open both page variants, add a regular block, edit its parameters, draw and bend a connection, box-select and drag a group, copy/paste it, switch projects, open the folder picker and save/load a model in a disposable workspace.
