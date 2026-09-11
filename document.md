# Ein Theater

> **A graphical UI solution to build, visualize, and test Deep Learning models as interactive circuit blocks.**

**Ein Theater** transforms PyTorch neural network construction into an intuitive, visual drag-and-drop schematic editor. Inspired by electrical PCB schematics and IC chip diagrams, Ein Theater renders layers as rectangular IC blocks with orthogonal 90° circuit traces, interactive diamond fold waypoints, multi-model workspace tabs, live hyperparameter editing, and instant PyTorch code generation via symbolic graph tracing.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Layout](#project-layout)
- [Quickstart Guide](#quickstart-guide)
  - [Prerequisites](#prerequisites)
  - [Running the Web Application](#running-the-web-application)
  - [Configuring the Server Port](#configuring-the-server-port)
  - [Running Model Tracing & Code Generation Tests](#running-model-tracing--code-generation-tests)
- [Canvas & Workflow Guide](#canvas--workflow-guide)
  - [Interactive Modes](#interactive-modes)
  - [Fundemental Blocks Sidebar](#fundemental-blocks-sidebar)
  - [Categorized 152-Module Catalog & Search](#categorized-152-module-catalog--search)
  - [Orthogonal Wire Routing & Fold Waypoints](#orthogonal-wire-routing--fold-waypoints)
  - [Scoped 0-Indexed Block Naming System](#scoped-0-indexed-block-naming-system)
  - [Saving Models & Generating Executable PyTorch Code](#saving-models--generating-executable-pytorch-code)
  - [Loading Verified Models onto Canvas](#loading-verified-models-onto-canvas)
  - [Workspace Folder Management](#workspace-folder-management)
  - [Keyboard Shortcuts & Gestures](#keyboard-shortcuts--gestures)
- [PyTorch FX Symbolic Tracing & Code Generation CLI](#pytorch-fx-symbolic-tracing--code-generation-cli)
- [Backend REST API Reference](#backend-rest-api-reference)
- [Sub-Module Documentation](#sub-module-documentation)

---

## Key Features

- **Electronic Circuit Schematic Canvas**:
  - Infinite 50px dot-grid PCB background.
  - Snap-to-grid coordinate alignment for neat architectural layouts.
  - Orthogonal 90° right-angle wiring with custom diamond fold waypoints that can be interactively dragged or flipped (Horizontal ⇄ Vertical).
  - Rubber-band marquee box selection (`Select` mode), rigid multi-block dragging with 100% wire shape and fold preservation, and batch deletion.
  - **Full Clipboard System (Copy, Cut, Paste)**: Copy and paste single blocks or multi-block collections (`Ctrl+C` / `Ctrl+V` or right-click context menu) with full preservation of internal circuit wiring, exact layer hyperparameters, staggered or cursor-targeted grid placement, and cross-model session persistence. Automatically switches to Move mode with elements selected for immediate dragging.
- **Fundemental Blocks Palette**:
  - The left sidebar displays strictly the **10 most fundamental PyTorch layers** for fast access:
    1. `nn.Linear`
    2. `nn.Conv2d`
    3. `nn.ReLU`
    4. `nn.MaxPool2d`
    5. `nn.BatchNorm2d`
    6. `nn.LayerNorm`
    7. `nn.Dropout`
    8. `nn.LSTM`
    9. `nn.MultiheadAttention`
    10. `nn.Embedding`
  - Drag-and-drop directly onto the canvas or single-click to spawn near the center of the current view.
  - Quick launcher (`+ More / Custom...`) opens the full 152-module categorized catalog.
- **152 Categorized PyTorch Modules**:
  - Complete coverage of `torch.nn.Module` subclasses defined in `modules.json`.
  - Partitioned into **15 functional categories**: Linear, Convolution, Pooling, Non-linear Activations, Normalization, Recurrent, Transformer, Attention, Dropout, Sparse / Embedding, Loss Functions, Vision, Padding, Distance, and Utilities.
  - Live instant text search filter across layer names and categories.
  - Real-time interactive preview card showing layer badges, category tags, dynamic canvas label preview, and constructor code.
  - Dynamic parameter modal generator supporting typed number inputs with constraints (`min`, `max`, `step`), boolean switches, and mustache templating.
- **Scoped 0-Indexed Block Naming**:
  - Layer instances automatically receive clean, 0-indexed identifiers scoped per layer type and workspace (e.g., `linear_0`, `linear_1`, `conv_0`, `conv_1`, `relu_0`).
  - Canvas blocks render clean, human-readable labels (`linear 0`, `conv 0`, `relu 0`) instead of cluttered raw parameter numbers.
  - Projects start fresh with an empty canvas and zero-indexed counter state.
- **1-Click Model Serialization & PyTorch Code Generation**:
  - Instant model saving via keyboard shortcut (`Ctrl+S` / `Cmd+S`), toolbar **💾 Save** button, or header **File** menu.
  - Automated compilation into a dedicated package directory: `<workingDir>/<model_name>/` containing:
    - `<model_name>.json`: Complete graph structure, layer parameters, and orthogonal wire coordinates.
    - `<model_name>.py`: Standalone, executable PyTorch `nn.Module` source code with device detection (`cuda` / `cpu`) and self-testing `__main__` entry point.
- **Smart Model Folder Detection & 1-Click Loading**:
  - Automatically identifies valid model directories in the workspace containing both `<model_name>.json` and `<model_name>.py`.
  - Decorated with a brain icon (`🧠`), distinctive blue accent, and `Model` badge in the sidebar tree and file browser modal.
  - Single click or **⚡ Load Model** action directly restores the model onto the canvas, preserves project tabs, recomputes wire routing, and centers the camera.
- **Workspace File & Directory Management**:
  - Built-in working directory explorer with breadcrumb navigation and drive chip selectors.
  - Directory creation directly from the sidebar (`➕`) or file browser modal (`➕ New Folder`).
  - Native Windows folder picker integration via PowerShell dialogs (`System.Windows.Forms.FolderBrowserDialog`).
  - Non-intrusive floating toast notifications (`.app-toast`) for save confirmations and system status.
- **Multi-Model Project Management**:
  - Sidebar project tabs supporting concurrent model architectures within a single session.
  - Fast model creation, deletion, and inline model title renaming.
- **Python FX Graph Tracing & Code Synthesis (`src/utils/generate code/`)**:
  - Symbolic execution via `torch.fx.symbolic_trace`.
  - Automatic classification of edge semantics: normal sequential flows, residual connections, U-Net / DenseNet skip concatenations, gated multiplicative modulations, and multi-input / multi-output branching.
  - Graph JSON serialization and automated compilation into clean, executable PyTorch `nn.Module` Python source code.
  - CLI commands supporting canvas-to-code compilation (`--save-canvas`, `--canvas-json`, `--out-dir`).

---

## Architecture & Tech Stack

```
   ┌────────────────────────────────────────────────────────┐
   │                   Browser Frontend                     │
   │  Vis.js Network • HTML5 Canvas Overlays • Circuit Grid  │
   │   Vanilla ES6 Modules (State, Modes, Circuit, Modals)  │
   │     Toast Alerts • Model Folders • 0-Indexed Labels    │
   └───────────────────────────▲────────────────────────────┘
                               │ REST API (/api/*) & Static Assets
   ┌───────────────────────────▼────────────────────────────┐
   │                    Go HTTP Backend                     │
   │    In-Memory State (sync.Mutex) • Orthogonal Router    │
   │       Workspace / File Browsers • Project Manager      │
   │    Model Save / Load Handlers • Subprocess Pipeline    │
   └───────────────────────────▲────────────────────────────┘
                               │ Stdin / Stdout JSON Protocol
   ┌───────────────────────────▼────────────────────────────┐
   │             Python FX Engine & Generator               │
   │  torch.fx Tracing • Connection Classifier • AST Gen    │
   │   Automated nn.Module Code Generator & Test Suite      │
   │    Model Package Builder (<name>.json & <name>.py)     │
   └────────────────────────────────────────────────────────┘
```

- **Backend**: Go (`net/http`) — fast, lightweight, zero external Go dependencies, configurable via `PORT` environment variable.
- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D context overlays, [Vis.js Network](https://github.com/visjs/vis-network), CSS3 custom properties with responsive toast notifications.
- **Deep Learning & Graph Engine**: Python 3, PyTorch (`torch`, `torch.fx`, `torch.nn`), `operator`.

---

## Project Layout

```
Ein Theater/
├── document.md                 # Root documentation (this file)
├── idea/                       # Prototyping directory: experimental model ideas & test suite
│   ├── test_models.py          # Validation test suite (UNet, CNN, Linear, ViT, Transformer, etc.)
│   └── outputs/                # Generated model code artifacts & test outputs
└── src/                        # Go application root (web-app module)
    ├── go.mod                  # Go module definition (web-app)
    ├── main.go                 # Main HTTP server orchestrator (registers all studio modes)
    ├── templates/
    │   └── index.html          # Unified global HTML shell & Mode Tab view switcher
    ├── static/
    │   └── style.css           # Unified global stylesheet & shared design system
    └── Canvas/                 # [Mode: Canvas] Neural Architecture Design Studio
        ├── canvas.go           # Standalone Canvas mode runner & server entry point
        ├── data/
        │   └── modules.json    # PyTorch 152-module schema definitions, templates & parameter bounds
        ├── handler/            # Canvas Go backend HTTP handlers
        │   ├── document.md     # Detailed Canvas handler architecture & REST reference
        │   ├── routes.go       # Centralized route registration helper (RegisterRoutes) & multiDirFS
        │   ├── graph_handlers.go   # CRUD for nodes, edges, batch deletion & canvas clear
        │   ├── index_handler.go    # Root template rendering & dynamic template locator
        │   ├── models.go       # Core structs (Node, Edge, Line, Project), mutex, 0-indexed ID generator
        │   ├── models_test.go  # Unit & integration tests for model handlers
        │   ├── project_handlers.go # Multi-model lifecycle & renaming
        │   └── workspace_handlers.go # Filesystem browsing, folder creation, model save/load pipeline
        ├── utils/              # Canvas utility services & compilers
        │   └── generate code/  # Template-driven PyTorch code synthesis engine
        │       ├── document.md # Code generator engine architecture & CLI documentation
        │       └── gen_code.py # Core FX tracer, connection classifier, AST code generator & CLI compiler
        ├── static/             # Canvas mode static assets
        │   ├── data/
        │   │   └── modules.json# Static asset copy of 152 PyTorch module schemas
        │   ├── canvas.css      # Mode-specific stylesheet (PCB grid, palette, block modals, wiring)
        │   ├── app.js          # Canvas application entry point, global keybindings & orchestration
        │   └── js/             # ES6 modular client architecture
        │       ├── document.md # Detailed frontend architecture & module reference
        │       ├── api.js      # REST API client wrapper (graph, workspace, model save/load, folders)
        │       ├── circuit.js  # PCB dot-grid renderer & orthogonal edge drawing
        │       ├── clipboard.js# Clipboard operations (copy, cut, paste, select all)
        │       ├── contextMenu.js # Right-click context menu & shortcuts
        │       ├── graph.js    # Vis.js network lifecycle, node placement & grid snap
        │       ├── modals.js   # Add/Edit layer modals, live search & code preview
        │       ├── modes.js    # Canvas tools switcher (Move, Select, Add, Connect)
        │       ├── palette.js  # Fundamental blocks sidebar rendering & drag-and-drop
        │       ├── projects.js # Project tabs, switching & renaming
        │       ├── schemas.js  # Schema loading, parameter defaults & label formatting
        │       ├── selection.js# Rubber-band marquee box selection
        │       ├── sidebarLoader.js # Custom dynamic sidebar loader & mode switcher
        │       ├── state.js    # Central shared reactive state container
        │       ├── utils.js    # Utility helpers & string escaping
        │       └── workspace.js# Working directory explorer, model detection, folder creation & toasts
        └── templates/
            ├── canvas.html     # Mode-specific HTML template
            └── sidebar.html    # Canvas mode sidebar fragment loaded dynamically
```

---

## Quickstart Guide

### Prerequisites

1. **Go**: Version 1.20 or newer installed.
2. **Python**: Version 3.10+ with PyTorch installed (`pip install torch`).
3. Modern Web Browser (Chrome, Firefox, Edge).

### Running the Web Application

1. Navigate to the `src` directory:
   ```bash
   cd src
   ```

2. Launch the Go web server:
   ```bash
   go run main.go
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

### Configuring the Server Port

The backend reads the optional `PORT` environment variable (defaults to `8080`):

- **PowerShell**:
  ```powershell
  $env:PORT="9000"
  go run main.go
  ```
- **Bash / Linux / macOS**:
  ```bash
  PORT=9000 go run main.go
  ```

### Running Model Tracing & Code Generation Tests

Automated test suites and CLI compilers verify symbolic graph extraction and bidirectional PyTorch code synthesis across CNNs, UNets, Vision Transformers, and Multi-Input/Multi-Output architectures:

```bash
# Run model synthesis validation suite (UNet, CNN, Linear, ViT, Transformer)
python idea/test_models.py

# Run symbolic connection classification and built-in model verification
python "src/utils/generate code/gen_code.py"

# Test CLI canvas compilation directly
python "src/utils/generate code/gen_code.py" --save-canvas idea/outputs/cnn.json --out-dir idea/outputs
```

---

## Canvas & Workflow Guide

### Interactive Modes

The toolbar allows switching between 4 specialized modes:

| Mode | Shortcut | Icon | Description |
| :--- | :---: | :---: | :--- |
| **Move** | `V` | 🖐 | Default mode. Drag anywhere on canvas to pan view; drag blocks to reposition with 50px grid snap. |
| **Select** | `S` | ⬚ | Marquee selection. Click and drag a rubber-band rectangle to select multiple blocks. |
| **Add Node** | `A` | ➕ | Click anywhere on the canvas grid to open the categorized layer creation modal at that exact coordinate. |
| **Add Edge** | `C` | 🔗 | Click a source block and drag to a target block to establish a directed circuit connection. |

### Fundemental Blocks Sidebar

The left sidebar section titled **Fundemental Blocks** provides instant access to the core building blocks of deep learning:

- **10 Core Layers**:
  - `nn.Linear` (Dense / Fully Connected)
  - `nn.Conv2d` (2D Spatial Convolution)
  - `nn.ReLU` (Rectified Linear Unit)
  - `nn.MaxPool2d` (2D Spatial Max Pooling)
  - `nn.BatchNorm2d` (2D Spatial Batch Normalization)
  - `nn.LayerNorm` (Layer Normalization)
  - `nn.Dropout` (Dropout Regularization)
  - `nn.LSTM` (Long Short-Term Memory)
  - `nn.MultiheadAttention` (Multi-Head Attention)
  - `nn.Embedding` (Lookup Table / Embeddings)
- **Interaction**:
  - **Drag & Drop**: Drag any block directly onto the canvas grid.
  - **Click to Add**: Single-click a block in the palette to spawn it near the center of the current canvas viewport.
  - **+ More / Custom...**: Opens the complete modal featuring all 152 PyTorch modules and custom layer definitions.

### Categorized 152-Module Catalog & Search

Clicking the canvas in **Add Node** mode or selecting **+ More / Custom...** opens the layer catalog modal:

1. **Instant Search Filter**: Type any keyword (e.g. `conv`, `norm`, `loss`, `gelu`, `transformer`) to immediately filter all matching modules.
2. **15 Structured Categories**:
   - **Linear**: `nn.Linear`, `nn.Bilinear`, `nn.LazyLinear`, `nn.Identity`
   - **Convolutional**: `nn.Conv1d`, `nn.Conv2d`, `nn.Conv3d`, `nn.ConvTranspose1d/2d/3d`, `nn.LazyConv*`
   - **Pooling**: `nn.MaxPool1d/2d/3d`, `nn.AvgPool1d/2d/3d`, `nn.AdaptiveMaxPool*`, `nn.AdaptiveAvgPool*`
   - **Non-linear Activations**: `nn.ReLU`, `nn.LeakyReLU`, `nn.GELU`, `nn.SiLU`, `nn.Sigmoid`, `nn.Tanh`, `nn.Softmax`, `nn.Mish`, `nn.ELU`, `nn.SELU`, etc.
   - **Normalization**: `nn.BatchNorm1d/2d/3d`, `nn.LayerNorm`, `nn.GroupNorm`, `nn.InstanceNorm*`, `nn.RMSNorm`
   - **Recurrent**: `nn.RNN`, `nn.LSTM`, `nn.GRU`, `nn.RNNCell`, `nn.LSTMCell`, `nn.GRUCell`
   - **Transformer**: `nn.Transformer`, `nn.TransformerEncoder`, `nn.TransformerDecoder`, `nn.TransformerEncoderLayer`, `nn.TransformerDecoderLayer`
   - **Attention**: `nn.MultiheadAttention`
   - **Dropout**: `nn.Dropout`, `nn.Dropout1d/2d/3d`, `nn.AlphaDropout`
   - **Sparse / Embedding**: `nn.Embedding`, `nn.EmbeddingBag`
   - **Loss Functions**: `nn.CrossEntropyLoss`, `nn.MSELoss`, `nn.L1Loss`, `nn.BCEWithLogitsLoss`, `nn.NLLLoss`, etc.
   - **Vision / Spatial**: `nn.PixelShuffle`, `nn.PixelUnshuffle`, `nn.Upsample`
   - **Padding**: `nn.ReflectionPad*`, `nn.ReplicationPad*`, `nn.ZeroPad2d`, `nn.ConstantPad*`
   - **Distance**: `nn.CosineSimilarity`, `nn.PairwiseDistance`
   - **Utilities**: `nn.Flatten`, `nn.Unflatten`, `nn.ChannelShuffle`
3. **Live Preview Card**: Shows category, badge, formatted canvas label, and constructor code.

### Orthogonal Wire Routing & Fold Waypoints

Connections between neural blocks use a specialized electronic circuit wire renderer (`circuit.js`):

- **90° Sharp Bends**: Replaces curved bezier splines with clean right-angle orthogonal traces.
- **Interactive Diamond Fold Waypoints**: Every wire displays an interactive diamond handle at its orthogonal bend:
  - Drag the diamond handle to dynamically shift the wire's fold position along the grid.
  - Right-click any wire and choose **Invert Edge Fold (H ⇄ V)** or double-click to flip between Horizontal-first and Vertical-first routing.
- **Dynamic Wire Drawing**: Click and hold a block, then drag across the grid to route traces. Backtracking automatically shrinks or erases drawn segments.

### Scoped 0-Indexed Block Naming System

To maintain clarity across complex architectures:
- **0-Indexed Unique IDs**: Nodes receive an ID formatted as `<prefix>_<index>` starting at `0` for each layer type (e.g. `linear_0`, `linear_1`, `conv_0`, `conv_1`, `relu_0`).
- **Workspace Scoped**: Indexing is scoped independently to each model workspace. When a node is deleted, the backend reuses the lowest available index upon adding the next node of that type.
- **Clean Canvas Labels**: Canvas blocks render human-readable labels (`linear 0`, `conv 0`, `relu 0`) rather than cluttered raw parameter text.
- **Parameter Inspection**: Double-clicking any block opens the hyperparameter editor, displaying the layer class and human-readable identifier (e.g., `nn.Linear (linear 0)`).

### Saving Models & Generating Executable PyTorch Code

Ein Theater enables seamless translation from visual schematics into deployable PyTorch code:

1. **Triggering Save**:
   - Keyboard shortcut: `Ctrl + S` or `Cmd + S`.
   - Toolbar button: **💾 Save**.
   - Menu bar: **File** ▾ → **Save Model**.
2. **Model Name Validation & Auto-Fixing**:
   - Model names are validated and automatically sanitized if invalid:
     - If the model name has spaces, all spaces are replaced with underscores (`_`).
     - If the model name has a number before the text (starts with a digit), the prefix `model_` is added in front.
     - Folder names strictly use valid Latin alphanumeric characters and underscores with a letter first.
3. **Generated Package Structure**:
   Models are saved inside a dedicated subfolder within the active working directory:
   ```
   <workingDir>/
   └── <model_name>/
       ├── <model_name>.json     # Complete graph schema and canvas coordinates
       └── <model_name>.py       # Standalone, runnable PyTorch nn.Module script
   ```
4. **Standalone Python Script**:
   The generated `.py` file includes:
   - Necessary imports (`torch`, `torch.nn`, `operator`).
   - The compiled `<model_name>(nn.Module)` class with initialized submodules and complete `forward()` flow.
   - Dynamic device targeting (`device='cuda' if torch.cuda.is_available() else 'cpu'`).
   - A runnable `if __name__ == '__main__':` block that initializes the model and prints its architecture summary.
5. **Toast Notifications**:
   Save progress and results are communicated via unobtrusive floating toast notifications (`.app-toast`) appearing at the bottom-right of the screen.

### Loading Verified Models onto Canvas

Ein Theater recognizes existing models on disk:

1. **Model Detection**:
   - Folders in the workspace containing both `<model_name>.json` and `<model_name>.py` are identified as verified models.
   - They appear with a brain icon (`🧠`), distinctive blue styling, and a `Model` badge in the sidebar tree and file browser modal.
2. **1-Click Loading**:
   - In the sidebar tree: Click the model folder directly.
   - In the folder browser modal: Click the row or the **⚡ Load Model** button.
3. **Graph Restoration**:
   - The backend parses the model's canvas specification, restores all blocks and parameters, reconstructs orthogonal edge wires, and sets the model as active.
   - The camera automatically centers on the loaded network (`fitView()`).

### Workspace Folder Management

Organize multi-model projects directly within the interface:
- **Sidebar Creation**: Click the **➕** button inside the "Working Directory" sidebar header to create a new subfolder in the active working directory.
- **Modal Creation**: Click the **➕ New Folder** button in the folder browser dialog to create subdirectories anywhere in the filesystem.

### Keyboard Shortcuts & Gestures

| Shortcut / Gesture | Action |
| :--- | :--- |
| `Ctrl + S` / `Cmd + S` | **Save Model**: Serializes canvas and generates PyTorch `.json` & `.py` files. |
| `Ctrl + C` / `Cmd + C` | **Copy**: Copies selected block(s) and internal connecting wires. |
| `Ctrl + V` / `Cmd + V` | **Paste**: Pastes copied block(s) and wires with 50px staggered offset. |
| `Ctrl + X` / `Cmd + X` | **Cut**: Copies selected block(s) and removes them from canvas. |
| `Ctrl + A` | **Select All**: Selects all blocks in the active model. |
| `Del` / `Backspace` | Delete currently selected block(s) or wire. |
| `Escape` | Close active modals, dismiss context menu, or cancel wire creation. |
| `Right Click` (on block / wire) | Open contextual action menu (Edit, Copy, Paste, Delete, Invert Fold). |
| `Right Click` (on empty canvas) | Open context menu: Paste Here, Add Node Here, Switch Modes, or Fit View. |
| `Double Click` (on block) | Open layer hyperparameter configuration dialog. |
| `Double Click` (on wire) | Toggle wire fold orientation (Horizontal ⇄ Vertical). |
| `Space` (during wire draw) | Flip current orthogonal bend orientation (H-first ⇄ V-first). |

---

## PyTorch FX Symbolic Tracing & Code Generation CLI

Located in [`src/utils/generate code/gen_code.py`](./src/utils/generate%20code/gen_code.py), the Python engine provides bidirectional translation between PyTorch computational graphs and Ein Theater JSON schematics:

1. **Symbolic Tracing**: Uses PyTorch FX (`torch.fx.symbolic_trace`) to capture high-level execution graphs without executing tensor math.
2. **Semantics Classification**: Inspects intermediate graph nodes and automatically tags connection types:
   - **Normal Connections**: Direct sequential data flow.
   - **Skip Connections**: Long-range feature concatenation (`torch.cat`, `torch.stack`).
   - **Residual Connections**: Additive skip pathways (`+`, `torch.add`).
   - **Gated Skips**: Multiplicative attention / feature modulation (`*`, `torch.mul`).
3. **Command Line Interface (CLI)**:
   ```bash
   # Save and compile canvas JSON into <out-dir>/<model_name>/ (<model_name>.json + .py)
   python "src/utils/generate code/gen_code.py" --save-canvas path/to/canvas.json --out-dir path/to/output

   # Compile directly from stdin pipe
   cat canvas.json | python "src/utils/generate code/gen_code.py" --save-canvas - --out-dir path/to/output

   # Run test suite on complex / weird model architectures
   python "src/utils/generate code/gen_code.py" --test
   ```
4. **Automated Code Synthesis (`generate_code_from_json`)**: Compiles graph JSON back into standalone, formatted PyTorch `nn.Module` classes:
   ```python
   import torch
   import torch.nn as nn
   import operator

   class cnn_model(nn.Module):
       def __init__(self, device='cpu'):
           super().__init__()
           self.device = device
           self.c1 = nn.Conv2d(in_channels=1, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
           self.c2 = nn.Conv2d(in_channels=16, out_channels=16, kernel_size=3, stride=1, padding=1, bias=True)
           self.pool = nn.MaxPool2d(kernel_size=2, stride=2, padding=0)
           self.to(self.device)

       def forward(self, x):
           c1 = self.c1(x)
           relu = torch.relu(c1)
           c2 = self.c2(relu)
           relu_1 = torch.relu(c2)
           pool = self.pool(relu_1)
           return pool

   if __name__ == '__main__':
       device = 'cuda' if torch.cuda.is_available() else 'cpu'
       model = cnn_model(device=device)
       print(f"Model 'cnn_model' initialized successfully on {device}:")
       print(model)
   ```

---

## Backend REST API Reference

The Go HTTP backend exposes RESTful endpoints for graph state, project management, and workspace filesystem interaction:

| Endpoint | Method | Request Payload | Description |
| :--- | :---: | :--- | :--- |
| `/api/data` | `GET` | None | Returns all nodes and edges for the currently active project canvas (`GraphData`). |
| `/api/addNode` | `POST` | Query: `label`, `layerType`, `x`, `y` | Creates a new block with 0-indexed ID (`<prefix>_<index>`) and snaps coordinates. |
| `/api/updateNode` | `POST` | JSON: `{ id, label, layerType, params }` | Updates block hyperparameters (`params`), label, or layer type. |
| `/api/deleteNode` | `POST` | Query: `id` | Deletes a single node by ID and removes attached edges. |
| `/api/deleteNodes` | `POST` | JSON: `["id1", "id2"]` or Query: `ids` | Batch deletes multiple nodes and connected edges. |
| `/api/moveNode` | `POST` | Query: `id`, `x`, `y` | Updates block canvas coordinates and adjusts edge endpoints while preserving custom waypoints. |
| `/api/addEdge` | `POST` | JSON: `{ from, to, lines? }` or Query | Creates or updates a directed connection with orthogonal straight line segments. |
| `/api/updateEdge` | `POST` | JSON: `{ id, lines }` | Updates edge line segments and custom fold waypoint coordinates. |
| `/api/deleteEdge` | `POST` | Query: `id` | Deletes a wire connection by ID. |
| `/api/clear` | `POST` | None | Clears all nodes and edges from the active canvas and resets ID counters to 0. |
| `/api/projects` | `GET` | None | Lists all model projects and the active project ID. |
| `/api/projects/create` | `POST` | Query: `name` | Creates a new model tab initialized with an empty canvas. |
| `/api/projects/switch` | `POST` | Query: `id` | Switches the active model canvas by ID. |
| `/api/projects/delete` | `POST` | Query: `id` | Deletes a model project by ID. |
| `/api/rename` | `POST` | Query: `name` | Renames the currently active model. |
| `/api/workspace` | `GET` | None | Returns current working directory path and folder name (`WorkspaceResponse`). |
| `/api/workspace/set` | `POST` | JSON: `{ path }` or Query: `path` | Sets active working directory. |
| `/api/workspace/browse` | `GET` | Query: `dir` | Browses subfolders, files, and system drives. Detects verified model packages (`isModel: true`). |
| `/api/workspace/select-native` | `POST` | None | Launches Windows native folder picker dialog via PowerShell (`FolderBrowserDialog`). |
| `/api/workspace/create-folder` | `POST` | JSON: `{ dir, name }` | Creates a new subdirectory in the target parent folder. |
| `/api/workspace/save-model`<br>`/api/saveModel` | `POST` | JSON: `{ projectId?, dir? }` | Serializes model canvas, runs `src/Canvas/utils/generate code/gen_code.py` generator, and saves `<model_name>/<model_name>.json` and `.py`. |
| `/api/workspace/load-model`<br>`/api/loadModel` | `POST` | JSON: `{ path?, dir? }` | Validates model naming, reads `<model_name>.json`, restores nodes and edges, and switches active canvas. |

---

## Sub-Module Documentation

For in-depth developer documentation of internal subsystems, refer to:

- [`src/Canvas/handler/document.md`](./src/Canvas/handler/document.md) — Detailed Go backend architecture, concurrency model, data structs, and handler implementations.
- [`src/Canvas/static/js/document.md`](./src/Canvas/static/js/document.md) — Comprehensive frontend client architecture, Vis.js custom rendering pipeline, PCB circuit line algorithms, and reactive state management.
- [`src/Canvas/utils/generate code/document.md`](./src/Canvas/utils/generate%20code/document.md) — PyTorch FX symbolic tracing, connection classification, AST code generation engine, and CLI compiler reference.
