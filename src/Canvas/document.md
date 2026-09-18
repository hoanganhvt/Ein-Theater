Canvas registers a mode through [Canvas/mode](mode/document.md); global routing belongs to [studio](../studio/document.md).

# Canvas Mode Subsystem Documentation (`src/Canvas`)

> **The Neural Architecture Design Studio of Ein Theater**

`src/Canvas` contains the core visual architecture design studio of **Ein Theater**. It provides an electronic circuit schematic environment where PyTorch neural network layers are rendered as rectangular IC blocks with orthogonal right-angle traces, diamond fold waypoints, 0-indexed scoped naming, live parameter configuration, and automated compilation into standalone PyTorch models.

---

## Table of Contents

- [Subsystem Overview](#subsystem-overview)
- [Directory Layout](#directory-layout)
- [Execution Modes](#execution-modes)
  - [1. Integrated Studio Mode (`src/main.go`)](#1-integrated-studio-mode-srcmaingo)
  - [2. Standalone Canvas Mode (`src/Canvas/canvas.go`)](#2-standalone-canvas-mode-srccanvascanvasgo)
- [Architecture & Data Flow](#architecture--data-flow)
- [Core Components](#core-components)
  - [Go HTTP Handlers (`handler/`)](#go-http-handlers-handler)
  - [Frontend Client Architecture (`static/`)](#frontend-client-architecture-static)
  - [HTML Templates & Dynamic Sidebar (`templates/`)](#html-templates--dynamic-sidebar-templates)
  - [152-Module PyTorch Schema (`data/modules.json`)](#152-module-pytorch-schema-datamodulesjson)
  - [Python FX Code Generation Engine (`utils/generate code/`)](#python-fx-code-generation-engine-utilsgenerate-code)
  - [Auto Shape Size Fit Engine (`utils/auto shape size fit/`)](#auto-shape-size-fit-engine-utilsauto-shape-size-fit)
- [REST API Reference](#rest-api-reference)
- [Data Serialization Specifications](#data-serialization-specifications)
  - [Node Schema](#node-schema)
  - [Edge Schema](#edge-schema)
  - [Compiled Model Package Layout](#compiled-model-package-layout)
- [Sub-Module Documentation](#sub-module-documentation)

---

## Subsystem Overview

The Canvas subsystem bridges interactive graphical CAD with deep learning code generation:

1. **Circuit Schematic Editor**: Visualizes models on an infinite 50px dot-grid canvas with 90° right-angle wiring, diamond fold waypoints, marquee multi-selection, rigid dragging, and full clipboard operations (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`).
2. **Fundamental Blocks & 152-Module Catalog**: Provides an 11-block instant-access palette in the sidebar (`Input` block with image/text/audio/raw presets plus 10 core layers: `nn.Linear`, `nn.Conv2d`, `nn.ReLU`, `nn.MaxPool2d`, `nn.BatchNorm2d`, `nn.LayerNorm`, `nn.Dropout`, `nn.LSTM`, `nn.MultiheadAttention`, `nn.Embedding`) and 152 modules partitioned across 15 functional categories in `modules.json`.
3. **Scoped 0-Indexed Identification**: Automatically numbers layer instances cleanly per type and workspace (`linear_0`, `conv_0`, `relu_0`, `input_0`), reusing deleted indices.
4. **Bidirectional Code Synthesis**: Compiles visual schematics into runnable PyTorch `nn.Module` classes using topological sorting via `src/Canvas/utils/generate code/gen_code.py`.
5. **Python Shape Adaptation**: Uses a persistent JSON-lines Python worker executing dummy tensors on PyTorch's meta device for real-time dimension inference without allocating real memory.
6. **Workspace & Model Detection**: Discovers verified model packages containing both `<model_name>.json` and `<model_name>.py`, decorating them with a brain badge (`🧠`) for 1-click canvas restoration.

---

## Directory Layout

```
src/Canvas/
├── canvas.go               # Standalone Canvas mode HTTP server runner
├── document.md             # Subsystem master documentation (this file)
├── data/
│   └── modules.json        # 152 PyTorch module schemas, parameter bounds & templates
├── handler/                # Go HTTP handlers, state models & routing
│   ├── document.md         # Detailed Go handler reference & architecture
│   ├── graph_handlers.go   # CRUD operations for nodes, edges, batch move/delete & clear
│   ├── page_handlers.go    # Canvas pages and Canvas-only sidebar content
│   ├── types.go        # Aliases for graph/workspace utility types
│   ├── models_test.go      # Unit & integration tests for state models & endpoints
│   ├── project_handlers.go # Multi-model project lifecycle, switching & renaming
│   ├── routes.go           # Canvas relative API registrar and explicit legacy routes
│   └── workspace_handlers.go # Working directory navigation, native picker & model save/load
├── static/                 # Canvas mode static assets
│   ├── app.js              # Canvas frontend orchestration entry point & keybindings
│   ├── canvas.css          # Mode stylesheet (PCB grid, palette, block modals, toast alerts)
│   ├── data/
│   │   └── modules.json    # Static asset copy of 152 PyTorch module schemas
│   └── js/                 # ES6 modular client architecture
│       ├── document.md     # Detailed frontend architecture & module reference
│       ├── api.js          # Backend REST API client wrapper
│       ├── circuit.js      # PCB dot-grid, 90° wire routing, waypoints & canvas hooks
│       ├── clipboard.js    # Copy, cut, paste, and select-all with internal wire preservation
│       ├── contextMenu.js  # Right-click context menu & shortcuts
│       ├── graph.js        # Vis.js network initialization, rigid drag & grid snapping
│       ├── modals.js       # Add Node (152 modules) & Edit Parameters modals
│       ├── modes.js        # Toolbar mode switcher (Move, Select, Add, Connect)
│       ├── palette.js      # Fundamental Blocks palette rendering & drag-and-drop
│       ├── projects.js     # Project tabs, switching & renaming
│       ├── schemas.js      # Dynamic module schema loader & clean label formatting
│       ├── selection.js    # Rubber-band marquee box selection
│       ├── sidebarLoader.js# Dynamic mode sidebar loader (/api/sidebar)
│       ├── state.js        # Central reactive state container
│       ├── utils.js        # HTML escaping & string utilities
│       └── workspace.js    # Working directory explorer, model detection & toasts
├── templates/              # HTML templates
│   ├── canvas.html         # Standalone Canvas mode HTML template
│   └── sidebar.html        # Mode sidebar fragment loaded dynamically into #sidebarSlot
└── utils/                  # Canvas mode computational utilities
    |-- document.md             # Utility architecture and module map
    |-- generate code/          # gen_code.py, FX/source rendering, artifact saving
    |-- auto_shape_fitting/     # Worker, DAG execution, adapters, nested fitting
    |-- read_canvas/            # Canvas parsing, connections, saved-canvas reading
    |-- shared/                 # Naming, constructor registry, edge ordering
    `-- tests/                  # Generation, worker, and fitting regression tests
```

---

## Execution Modes

The Canvas subsystem can be executed in two distinct modes:

### 1. Integrated Studio Mode (`src/main.go`)

In Studio Mode, the Go backend orchestrates multiple future modes (`Canvas`, `Data`, `Code`, `Train`, `Debug`):

```bash
cd src
go run main.go
```

- Server binds to `http://localhost:8080` (or `$PORT`).
- Default route (`/`) serves `src/Canvas/templates/studio.html` via `studio.NewHandler(config)`.
- `index.html` displays the unified top navigation bar with mode switcher tabs (`Canvas`, `Data`, `Code`, `Train`, `Debug`).
- The Canvas sidebar is dynamically fetched from `/api/sidebar?mode=canvas` and mounted into `#sidebarSlot` by `sidebarLoader.js`.
- Studio explicitly combines global assets and legacy Canvas fallbacks, and separately mounts Canvas assets under `/static/canvas/`.

### 2. Standalone Canvas Mode (`src/Canvas/canvas.go`)

In Standalone Mode, Canvas operates independently without the outer studio frame:

```bash
cd src
go run Canvas/canvas.go
```

- Server binds to `http://localhost:8080` (or `$PORT`).
- Default route (`/`) directly serves `src/Canvas/templates/canvas.html` via `studio.NewHandler` with `Standalone:true`.
- Ideal for rapid frontend/backend iteration focused exclusively on neural network schematic editing.

---

## Architecture & Data Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │                       Browser Client                        │
   │  Vis.js Network • HTML5 Canvas 2D Overlays • Circuit Grid   │
   │   ES6 Modules (graph, circuit, clipboard, modals, palette)  │
   │    Sidebar Loader (/api/sidebar) • Dynamic modules.json     │
   └──────────────────────────────▲──────────────────────────────┘
                                  │ HTTP REST / JSON & HTML Fragments
   ┌──────────────────────────────▼──────────────────────────────┐
   │                   Go Backend (Canvas/handler)               │
   │   sync.Mutex • Project Map (projects[id]) • Scoped IDs      │
   │   multiDirFS Static Server (style.css + canvas.css)         │
   │   Workspace Navigator • Model Detector • PowerShell Picker  │
   └──────────────────────────────▲──────────────────────────────┘
                                  │ Stdin / Stdout JSON Pipe
   ┌──────────────────────────────▼──────────────────────────────┐
   │       Python FX Code Generator (Canvas/utils/generate code) │
   │   canvas_to_json_graph (Topological Sort + Coordinates)     │
   │   shape_inference.py (Meta Tensor Dynamic Adaptation)       │
   │   generate_code_from_json (Standalone nn.Module FX Gen)   │
   │   save_model_to_folder (<name>/<name>.json + <name>.py)     │
   └─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Go HTTP Handlers (`handler/`)

The backend state lives in `utils/graph.Store`, protected by `Store.Mu`. HTTP adapters hold the lock for graph transactions and release it before filesystem or Python work. See [handler contracts](./handler/document.md) and [categorized utilities](./utils/document.md) for inputs, outputs and test instructions.

Key handler responsibilities:
- **`utils/graph` and `utils/naming`**: Own graph types, project state, routing, scoped IDs and model-name normalization. `handler/types.go` keeps shared type aliases. See the utility folder documents for input/output contracts and tests.
- **`graph_handlers.go`, `node_handlers.go`, `edge_handlers.go`**: Decode graph requests, coordinate transactions, call graph operations and encode results for snapshot, paste, node and edge endpoints.
- **`project_handlers.go`**: Manages concurrent model tabs (`/api/projects`), creation, deletion, and active project switching.
- **`workspace_handlers.go`**: Adapts workspace requests to `utils/workspace` for browsing, folder creation and native selection.
- **`model_handlers.go`**: Coordinates model save/load/inspect through `utils/modelio`, `utils/python` and `utils/graph`, preserving snapshot reconciliation.
- **`page_handlers.go`**: Serve page/sidebar responses using `src/utils/templates` for discovery and fragment composition.
- **`routes.go`**: Registers all endpoints on `*http.ServeMux`; the studio router mounts Canvas APIs and explicitly composes its static filesystem.

### Frontend Client Architecture (`static/`)

The frontend is implemented in vanilla ES6 JavaScript modules with zero build steps or bundling. See [`src/Canvas/static/js/document.md`](./static/js/document.md) for full technical documentation.

Key client modules:
- **`circuit.js`**: Replaces curved Vis.js splines with orthogonal 90° PCB traces. Renders dot-grid background, junction terminals, directional arrowheads, live connection previews with backtracking removal, and interactive diamond fold handles.
- **`graph.js`**: Integrates Vis.js Network with the custom circuit renderer. Enforces 50px grid snap on placement and dragging. Implements **rigid group movement**, ensuring internal wires between multi-selected blocks maintain 100% of their geometry without collapsing.
- **`clipboard.js`**: Full clipboard system (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`, context menu). Preserves internal wire connections, fold modes, and custom fold positions. Pasted elements automatically receive new 0-indexed IDs and remain selected in Move mode for immediate positioning.
- **`modals.js`**: Dynamic modal generators for the 152-module catalog and hyperparameter editing.
- **`palette.js`**: Renders the 10 fundamental layers in the sidebar, handling drag-and-drop and click-to-spawn.
- **`sidebarLoader.js`**: Dynamically fetches and mounts mode sidebars (`/api/sidebar?mode=canvas`), ensuring smooth mode switching in integrated studio mode.
- **`workspace.js`**: Renders workspace file tree, detects model folders, triggers native folder dialogs, handles model save/load pipelines, and displays unobtrusive floating toasts (`.app-toast`).

### HTML Templates & Dynamic Sidebar (`templates/`)

- **`canvas.html`**: Standalone HTML document containing the complete DOM structure for Canvas mode.
- **`sidebar.html`**: Mode-specific sidebar fragment containing:
  1. *Working Directory Section*: Path display, native folder picker button, subfolder creation button, and workspace file list.
  2. *Models Section*: Multi-project tabs and new model creation button (`+`).
  3. *Fundamental Blocks Palette*: Quick drag-and-drop palette populated with the top 10 PyTorch layers and a link to the complete 152-module catalog.

### 152-Module PyTorch Schema (`data/modules.json`)

The authoritative catalog of PyTorch `torch.nn.Module` subclasses supported by Ein Theater. Distributed in both `src/Canvas/data/modules.json` (for backend/Python lookup) and `src/Canvas/static/data/modules.json` (for browser client fetching).

Each module definition provides:
- `type`: Exact PyTorch class name (e.g. `nn.Conv2d`, `nn.MultiheadAttention`).
- `category`: Functional group (`linear`, `conv`, `pooling`, `activation`, `normalization`, `recurrent`, `transformer`, `attention`, `regularization`, `embedding`, `loss`, `vision`, `padding`, `distance`, `utility`).
- `badge` & `badgeClass`: Visual UI tag styling.
- `defaultInSeed`: Boolean indicating if the layer appears in the sidebar Fundamental Blocks palette.
- `labelTemplate`: String template for canvas block label rendering.
- `fields`: Array of parameter definitions (`key`, `label`, `type`, `default`, `min`, `max`, `step`).
- `code`: Python constructor invocation template used during FX code synthesis.

### Python FX Code Generation Engine (`utils/generate code/`)

A modular Python compiler located in [`src/Canvas/utils/generate code/`](./utils/generate%20code/document.md). Invoked by the Go backend via standard input/output pipes or directly via CLI.

Utilities are grouped by responsibility; see the [complete module map](./utils/document.md).

- `utils/generate code/`: `gen_code.py` exposes the CLI/API; FX builders and renderers generate standalone source, and `model_storage.py` coordinates artifact saving.
- `utils/read_canvas/`: Parse visual blocks and connections, build computational nodes, and read saved editable canvases.
- `utils/auto_shape_fitting/`: Run the persistent worker, infer shapes with meta tensors, adapt constructors, and fit nested models.
- `utils/shared/`: Share identifier rules, palette lookup, constructor registry, and numeric edge ordering.
- `utils/tests/`: Regression coverage for both pipelines, imports, CLI, and worker requests.

### Python Shape Adaptation (`shape_inference.py`)

Python worker (`src/Canvas/utils/auto_shape_fitting/shape_inference.py`) that evaluates graph connections interactively. It uses PyTorch's `meta` device to execute layer forward passes on dummy tensors, automatically resolving dimensional shape constraints and returning inferred tensor parameters dynamically without allocating real memory or waiting for the code generator to run.

---

## REST API Reference

Canvas registers relative APIs through `handler.RegisterAPI`. Studio mounts them at `/api/canvas/*`; `handler.RegisterRoutes` also registers the explicit legacy aliases listed below:

| Endpoint | Method | Payload / Query | Description |
| :--- | :---: | :--- | :--- |
| `/` | `GET` | None | Serves `index.html` (Studio Mode) or `canvas.html` (Standalone Mode). |
| `/canvas` | `GET` | None | Serves standalone Canvas mode template (`canvas.html`). |
| `/index` | `GET` | None | Serves studio mode shell (`index.html`). |
| `/api/sidebar`<br>`/api/sidebar/` | `GET` | Query: `mode` (e.g. `canvas`) | Returns mode-specific sidebar HTML fragment for dynamic mounting. |
| `/api/data` | `GET` | None | Returns all nodes and edges for active project canvas (`GraphData`). |
| `/api/addNode` | `POST` | Query: `label`, `layerType`, `x`, `y`<br>Optional JSON body: `{ params }` | Allocates scoped 0-indexed ID (`<prefix>_<index>`), snaps position to 50px grid, and adds block. |
| `/api/updateNode` | `POST` | JSON: `{ id, label, layerType, params }` | Updates block hyperparameters, label, or layer type. |
| `/api/deleteNode` | `POST` | Query: `id` | Deletes a node and removes connected edges. |
| `/api/deleteNodes` | `POST` | JSON: `["id1", "id2"]` or Query: `ids` | Batch deletes multiple nodes and connected edges. |
| `/api/moveNode` | `POST` | Query: `id`, `x`, `y`, `update_edges`? | Updates single node coordinates with grid snap. |
| `/api/moveNodes` | `POST` | JSON: `[{"id", "x", "y"}]` | Batch updates coordinates for multiple nodes in a single transaction. |
| `/api/addEdge` | `POST` | JSON: `{ from, to, lines?, foldMode?, customFold? }` or Query | Creates or updates directed orthogonal wire connection with specified bend mode. |
| `/api/updateEdge` | `POST` | JSON: `{ id, lines, foldMode?, customFold? }` | Updates custom line segments, bend mode (`foldMode`), and fold coordinate (`customFold`) for an edge. |
| `/api/updateEdges` | `POST` | JSON: `[{"id", "lines", "foldMode"?, "customFold"?}]` | Batch updates line segments, bend modes, and waypoints for multiple edges. |
| `/api/deleteEdge` | `POST` | Query: `id` | Deletes directed wire connection by ID. |
| `/api/paste`<br>`/api/pasteGraph` | `POST` | JSON: `{ nodes, edges, dx, dy }` | Duplicates elements into active project with new 0-indexed IDs and offset waypoints. |
| `/api/clear` | `POST` | None | Wipes all nodes and edges from canvas and resets ID counters to 0. |
| `/api/projects` | `GET` | None | Lists all model projects and current active project ID. |
| `/api/projects/create` | `POST` | Query: `name` | Creates new empty model tab. |
| `/api/projects/switch` | `POST` | Query: `id` | Switches active model canvas. |
| `/api/projects/delete` | `POST` | Query: `id` | Deletes model project tab. |
| `/api/rename` | `POST` | Query: `name` | Renames active model. |
| `/api/workspace` | `GET` | None | Returns active working directory path and folder name. |
| `/api/workspace/set` | `POST` | JSON: `{ path }` or Query: `path` | Updates active working directory. |
| `/api/workspace/browse` | `GET` | Query: `dir` | Lists files/folders in target path. Detects verified model packages (`isModel: true`). |
| `/api/workspace/select-native` | `POST` | None | Opens native Windows folder browser modal via PowerShell. |
| `/api/workspace/create-folder` | `POST` | JSON: `{ dir, name }` | Creates new subdirectory in target directory. |
| `/api/workspace/save-model`<br>`/api/saveModel` | `POST` | JSON: `{ projectId?, dir? }` | Serializes canvas directly to final `<model_name>/<model_name>.json` and `.py`, and updates active model parameters in memory. |
| `/api/workspace/load-model`<br>`/api/loadModel` | `POST` | JSON: `{ path?, dir? }` | Loads verified model from folder onto active canvas. |

---

## Data Serialization Specifications

### Node Schema

```json
{
  "id": "conv_0",
  "label": "conv 0",
  "title": "conv 0",
  "layerType": "nn.Conv2d",
  "shape": "box",
  "x": 250,
  "y": 150,
  "params": {
    "in_channels": 3,
    "out_channels": 64,
    "kernel_size": 3,
    "stride": 1,
    "padding": 1,
    "bias": true
  }
}
```

### Edge Schema

```json
{
  "id": "e1",
  "from": "conv_0",
  "to": "relu_0",
  "edgeType": "normal",
  "index": null,
  "foldMode": "horizontal",
  "customFold": 350,
  "lines": [
    {
      "first": { "x": 250, "y": 150 },
      "last":  { "x": 350, "y": 150 },
      "from":  { "x": 250, "y": 150 },
      "to":    { "x": 350, "y": 150 }
    },
    {
      "first": { "x": 350, "y": 150 },
      "last":  { "x": 350, "y": 300 },
      "from":  { "x": 350, "y": 150 },
      "to":    { "x": 350, "y": 300 }
    },
    {
      "first": { "x": 350, "y": 300 },
      "last":  { "x": 500, "y": 300 },
      "from":  { "x": 350, "y": 300 },
      "to":    { "x": 500, "y": 300 }
    }
  ]
}
```

### Compiled Model Package Layout

When a model is saved via `SaveModelHandler` or `gen_code.py`, the compiler outputs a self-contained package directory:

```
<workingDir>/
└── <model_name>/
    ├── <model_name>.json     # Complete graph specification with nodes, parameters & wire lines
    └── <model_name>.py       # Standalone, runnable PyTorch nn.Module source code
```

#### Generated Python Source Example (`<model_name>.py`)

```python
import torch
import torch.nn as nn
import operator

class cnn_classifier(nn.Module):
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device
        self.conv_0 = nn.Conv2d(in_channels=3, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
        self.relu_0 = nn.ReLU(inplace=False)
        self.pool_0 = nn.MaxPool2d(kernel_size=2, stride=2, padding=0)
        self.to(self.device)

    def forward(self, x):
        conv_0 = self.conv_0(x)
        relu_0 = self.relu_0(conv_0)
        pool_0 = self.pool_0(relu_0)
        return pool_0

if __name__ == '__main__':
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = cnn_classifier(device=device)
    print(f"Model 'cnn_classifier' initialized successfully on {device}:")
    print(model)
```

---

## Sub-Module Documentation

For deep technical dives into individual subsystems within Canvas, refer to:

- [`handler/document.md`](./handler/document.md) — Detailed Go backend architecture, concurrency model, data structs, and handler implementations.
- [`static/js/document.md`](./static/js/document.md) — Comprehensive frontend client architecture, Vis.js custom rendering pipeline, PCB circuit line algorithms, and reactive state management.
- [`utils/generate code/document.md`](./utils/generate%20code/document.md) — PyTorch FX symbolic tracing, connection classification, FX code generation engine, and CLI compiler reference.
- [`utils/auto shape size fit/document.md`](./utils/auto%20shape%20size%20fit/document.md) — Automated tensor shape propagation, dimension inference, and skip/residual padding auto-resolution engine.
- [Root Project Documentation](../../document.md) — High-level architecture, quickstart guide, and global system overview.


## UI feature refactor

See the [UI source audit and architecture](static/document.md) for the per-file analysis, feature ownership, new folder documentation and validation commands. HTML entry handlers now use `src/studio/render.go` and `src/utils/templates` to compose named static partials before sending the response. JavaScript keeps its original public entry paths while implementations live in feature folders. Shared CSS has one source of truth with a small Canvas override.
