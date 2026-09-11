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
  - [Running Model Tracing & Code Generation Tests](#running-model-tracing--code-generation-tests)
- [Canvas & Workflow Guide](#canvas--workflow-guide)
  - [Interactive Modes](#interactive-modes)
  - [Fundemental Blocks Sidebar](#fundemental-blocks-sidebar)
  - [Categorized 152-Module Catalog & Search](#categorized-152-module-catalog--search)
  - [Orthogonal Wire Routing & Fold Waypoints](#orthogonal-wire-routing--fold-waypoints)
  - [Keyboard Shortcuts & Gestures](#keyboard-shortcuts--gestures)
- [PyTorch FX Symbolic Tracing & Code Generation](#pytorch-fx-symbolic-tracing--code-generation)
- [Backend REST API Reference](#backend-rest-api-reference)
- [Sub-Module Documentation](#sub-module-documentation)

---

## Key Features

- **Electronic Circuit Schematic Canvas**:
  - Infinite 50px dot-grid PCB background.
  - Snap-to-grid coordinate alignment for neat architectural layouts.
  - Orthogonal 90° right-angle wiring with custom diamond fold waypoints that can be interactively dragged or flipped (Horizontal ⇄ Vertical).
  - Rubber-band marquee box selection (`Select` mode), multi-node dragging, and batch deletion.
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
- **Multi-Model Project Management**:
  - Sidebar project tabs supporting concurrent model architectures within a single session.
  - Fast model creation, deletion, and inline model title renaming.
- **Integrated Workspace & Local File Explorer**:
  - Built-in working directory explorer with breadcrumb navigation and drive chip selectors.
  - Native Windows folder picker integration via PowerShell dialogs (`System.Windows.Forms.FolderBrowserDialog`).
- **Python FX Graph Tracing & Code Synthesis (`idea/`)**:
  - Symbolic execution via `torch.fx.symbolic_trace`.
  - Automatic classification of edge semantics: normal sequential flows, residual connections, U-Net / DenseNet skip concatenations, gated multiplicative modulations, and multi-input / multi-output branching.
  - Graph JSON serialization and automated compilation into clean, executable PyTorch `nn.Module` Python source code.

---

## Architecture & Tech Stack

```
   ┌────────────────────────────────────────────────────────┐
   │                   Browser Frontend                     │
   │  Vis.js Network • HTML5 Canvas Overlays • Circuit Grid  │
   │   Vanilla ES6 Modules (State, Modes, Circuit, Modals)  │
   └───────────────────────────▲────────────────────────────┘
                               │ REST API (/api/*) & Static Assets
   ┌───────────────────────────▼────────────────────────────┐
   │                    Go HTTP Backend                     │
   │    In-Memory State (sync.Mutex) • Orthogonal Router    │
   │       Workspace / File Browsers • Project Manager      │
   └───────────────────────────▲────────────────────────────┘
                               │ Model JSON & Architecture Specs
   ┌───────────────────────────▼────────────────────────────┐
   │             Python FX Engine & Generator               │
   │  torch.fx Tracing • Connection Classifier • AST Gen    │
   │     Automated nn.Module Code Generator & Test Suite    │
   └────────────────────────────────────────────────────────┘
```

- **Backend**: Go (`net/http`) — fast, lightweight, zero external Go dependencies.
- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5 Canvas 2D context overlays, [Vis.js Network](https://github.com/visjs/vis-network), CSS3 custom properties.
- **Deep Learning & Graph Engine**: Python 3, PyTorch (`torch`, `torch.fx`, `torch.nn`), `operator`.

---

## Project Layout

```
Ein Theater/
├── readme.md                   # Root documentation (this file)
├── idea/                       # Python FX graph tracing, code generator & validation tests
│   ├── test.py                 # Core FX tracer, connection classifier, JSON exporter & code generator
│   ├── test_models.py          # Validation test suite (UNet, CNN, Linear, ViT, Transformer, etc.)
│   └── outputs/                # Generated model code artifacts & test outputs
└── src/                        # Go web server & web assets
    ├── go.mod                  # Go module definition (web-app)
    ├── main.go                 # HTTP server entry point & route registrations
    ├── data/
    │   └── modules.json        # PyTorch 152-module schema definitions, templates & parameter bounds
    ├── handler/                # Go backend HTTP handlers
    │   ├── README.md           # Detailed Go handler documentation
    │   ├── graph_handlers.go   # CRUD for nodes, edges, batch deletion & canvas clear
    │   ├── index_handler.go    # Root template rendering
    │   ├── models.go           # Core structs (Node, Edge, Line, Project), mutex & seed palette
    │   ├── project_handlers.go # Multi-model lifecycle & renaming
    │   └── workspace_handlers.go # Local file browsing & native folder selection
    ├── static/                 # Frontend client assets
    │   ├── data/
    │   │   └── modules.json    # Static asset copy of 152 PyTorch module schemas
    │   ├── style.css           # Modern dark/light circuit schematic theme & modal styling
    │   ├── app.js              # Application entry point & orchestration
    │   └── js/                 # ES6 modular client architecture
    │       ├── README.md       # Detailed frontend architecture & module reference
    │       ├── api.js          # REST API client wrapper
    │       ├── circuit.js      # PCB dot-grid renderer & orthogonal edge drawing
    │       ├── contextMenu.js  # Right-click context menu & shortcuts
    │       ├── graph.js        # Vis.js network lifecycle, node placement & grid snap
    │       ├── modals.js       # Add/Edit layer modals, live search & code preview
    │       ├── modes.js        # Mode switcher (Move, Select, Add, Connect)
    │       ├── palette.js      # Fundamental blocks sidebar rendering & drag-and-drop
    │       ├── projects.js     # Project tabs, switching & renaming
    │       ├── schemas.js      # Schema loading from modules.json & label templating
    │       ├── selection.js    # Rubber-band marquee box selection
    │       ├── state.js        # Central shared reactive state container
    │       ├── utils.js        # Utility helpers & string escaping
    │       └── workspace.js    # Working directory explorer & modal picker
    └── templates/
        └── index.html          # Main single-page application markup
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

### Running Model Tracing & Code Generation Tests

The `idea/` directory contains automated test suites verifying symbolic graph extraction and bidirectional PyTorch code synthesis across CNNs, UNets, Vision Transformers, and Multi-Input/Multi-Output architectures:

```bash
# Run model synthesis validation (UNet, CNN, Linear, ViT, Transformer)
python idea/test_models.py

# Run symbolic connection classification and FX graph analysis
python idea/test.py
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

### Keyboard Shortcuts & Gestures

| Shortcut / Gesture | Action |
| :--- | :--- |
| `Del` / `Backspace` | Delete currently selected block(s) or wire. |
| `Ctrl + A` | Select all blocks in the active model. |
| `Escape` | Close active modals, dismiss context menu, or cancel wire creation. |
| `Right Click` (on block / wire) | Open contextual action menu (Edit, Delete, Invert Fold). |
| `Right Click` (on empty canvas) | Switch modes, Add Node Here, or Fit View. |
| `Double Click` (on block) | Open layer hyperparameter configuration dialog. |
| `Double Click` (on wire) | Toggle wire fold orientation (Horizontal ⇄ Vertical). |

---

## PyTorch FX Symbolic Tracing & Code Generation

Located in [`idea/test.py`](./idea/test.py), the Python engine provides bidirectional translation between PyTorch computational graphs and Ein Theater JSON schematics:

1. **Symbolic Tracing**: Uses PyTorch FX (`torch.fx.symbolic_trace`) to capture high-level execution graphs without executing tensor math.
2. **Semantics Classification**: Inspects intermediate graph nodes and automatically tags connection types:
   - **Normal Connections**: Direct sequential data flow.
   - **Skip Connections**: Long-range feature concatenation (`torch.cat`, `torch.stack`).
   - **Residual Connections**: Additive skip pathways (`+`, `torch.add`).
   - **Gated Skips**: Multiplicative attention / feature modulation (`*`, `torch.mul`).
3. **Automated Code Synthesis (`generate_code_from_json`)**: Compiles graph JSON back into standalone, formatted PyTorch `nn.Module` classes:
   ```python
   import torch
   import torch.nn as nn
   import operator

   class GeneratedModel(nn.Module):
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
   ```

---

## Backend REST API Reference

The Go HTTP backend exposes RESTful endpoints for graph state, project management, and workspace filesystem interaction:

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/data` | `GET` | Returns all nodes and edges for the currently active project canvas. |
| `/api/addNode` | `POST` | Creates a new block (`label`, `layerType`, `x`, `y`). |
| `/api/updateNode` | `POST` | Updates block hyperparameters (`params`), label, or layer type. |
| `/api/deleteNode` | `POST` | Deletes a single node by `id` and removes attached edges. |
| `/api/deleteNodes` | `POST` | Batch deletes multiple nodes and connected edges. |
| `/api/moveNode` | `POST` | Updates block canvas coordinates (`x`, `y`) and snaps attached edges. |
| `/api/addEdge` | `POST` | Creates or updates a directed connection (`from`, `to`, optional `lines`). |
| `/api/updateEdge` | `POST` | Updates edge line segments and custom fold waypoint coordinates. |
| `/api/deleteEdge` | `POST` | Deletes a wire connection by `id`. |
| `/api/clear` | `POST` | Clears all nodes and edges from the active canvas. |
| `/api/projects` | `GET` | Lists all model projects and the active project ID. |
| `/api/projects/create` | `POST` | Creates a new model tab and seeds it with default palette blocks. |
| `/api/projects/switch` | `POST` | Switches the active model canvas (`id`). |
| `/api/projects/delete` | `POST` | Deletes a model project (`id`). |
| `/api/rename` | `POST` | Renames the currently active model. |
| `/api/workspace` | `GET` | Returns current working directory and folder name. |
| `/api/workspace/set` | `POST` | Sets active working directory (`path`). |
| `/api/workspace/browse` | `GET` | Browses subfolders, files, and drives for the file picker. |
| `/api/workspace/select-native` | `POST` | Launches Windows native folder picker dialog. |

---

## Sub-Module Documentation

For in-depth developer documentation of internal subsystems, refer to:

- [`src/handler/README.md`](./src/handler/README.md) — Detailed Go backend architecture, concurrency model, data structs, and handler implementations.
- [`src/static/js/README.md`](./src/static/js/README.md) — Comprehensive frontend client architecture, Vis.js custom rendering pipeline, PCB circuit line algorithms, and reactive state management.
