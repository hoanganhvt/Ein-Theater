# Browser JavaScript architecture

The root `.js` files are stable public entry points. Implementations live in feature folders named for the responsibility they own. `state.js` is the single small shared application store; `api.js` additionally composes and decorates endpoint groups.

## Features

| Folder | Responsibility |
| --- | --- |
| [application](./application/document.md) | Application startup and HTML event bridge |
| [api](./api/document.md) | HTTP requests and automatic shape refresh |
| [circuit](./circuit/document.md) | Circuit geometry, wire editing and canvas rendering |
| [clipboard](./clipboard/document.md) | Graph clipboard and keyboard commands |
| [contextMenu](./contextMenu/document.md) | Context menu and selection deletion |
| [graph](./graph/document.md) | Graph loading, node operations and drag persistence |
| [modals](./modals/document.md) | Node creation and parameter editing dialogs |
| [modes](./modes/document.md) | Canvas interaction modes and click placement |
| [palette](./palette/document.md) | Layer palette catalog, rendering and drag/drop |
| [projects](./projects/document.md) | Project list operations and model title editing |
| [schemas](./schemas/document.md) | Layer registry, fallback definitions and display labels |
| [selection](./selection/document.md) | Box selection and coordinate-aware hit testing |
| [sidebarLoader](./sidebarLoader/document.md) | Dynamic sidebar loading and application navigation |
| [utils](./utils/document.md) | HTML escaping and model-name normalization |
| [workspace](./workspace/document.md) | Workspace explorer, folder selection and model persistence |

## Runtime contracts

Native browser ES modules load through `/static/js/`. Keep `.js` extensions in relative imports. Do not perform DOM initialization from feature imports; `application/bootstrap.js` controls startup and `application/handlers.js` controls the legacy inline HTML bridge. All graph elements use string IDs; canvas coordinates differ from DOM pixels and must pass through the Vis coordinate conversion methods. Network and dataset instances live in `state`, so feature code must read the current instance after project switches.

`MODULES_LIST` and `LAYER_SCHEMAS` retain their identities during schema loading. Circuit gestures share `circuit/runtime.js`. API mutations that affect tensor semantics refresh metadata with version and dataset-identity guards. Existing circular UI workflows are deferred until functions run; avoid adding eager cross-feature calls at import time.

## Tests and maintenance

`api.test.mjs` checks dimension-refresh metadata and stale-project protection. `ui.test.mjs` links every module, checks template event handlers (with two documented pre-existing studio exceptions), and exercises wire geometry, selection, wire state and group dragging. Run both directly with Node from the repository root. No npm install is required.

For the original-file audit, stylesheet/template integration, startup order and known limitations, see the [UI architecture](../document.md). Update a feature's document whenever its file ownership or exported contracts change.

## Performance regression checks

Run `node src/Canvas/static/js/performance.test.mjs` from the repository root. It verifies that writes and initial graph display do not await shape inference, burst requests coalesce, stale results cannot cross project boundaries, grid work stays bounded at low zoom, and palette handlers bind once. The Python worker is simulated in these frontend tests.

With a simulated 400 ms analysis response, mutation acknowledgment measured about 412 ms before the fix and 0.5 ms after it; actual server/network/Python costs depend on the project and machine. Browser rendering and real PyTorch inference still require local profiling.
