# Frontend JavaScript Modules Documentation (`src/static/js`)

This directory contains the client-side ES6 JavaScript modules that power the interactive neural network diagram editor, project tabs, canvas interactions, and workspace file browser.

---

## Overview of Modules

| File | Primary Responsibility |
| :--- | :--- |
| [`api.js`](./api.js) | Backend REST API communication wrapper |
| [`circuit.js`](./circuit.js) | PCB-style dot-grid background and orthogonal right-angle edge trace rendering |
| [`contextMenu.js`](./contextMenu.js) | Right-click context menu and global canvas shortcuts |
| [`graph.js`](./graph.js) | Vis.js network initialization, node/edge sync, grid snapping, and view management |
| [`modals.js`](./modals.js) | Modal dialogs for adding blocks and editing layer hyperparameters |
| [`modes.js`](./modes.js) | Toolbar mode switching (`move`, `select`, `add`, `connect`) |
| [`palette.js`](./palette.js) | Dynamic rendering, drag-and-drop, and click-to-add from sidebar layer palette |
| [`projects.js`](./projects.js) | Multi-model management, project switching, and inline renaming |
| [`schemas.js`](./schemas.js) | Dynamic JSON schema loading (`modules.json`), parameter defaults, and template label formatting |
| [`selection.js`](./selection.js) | Rubber-band marquee box selection on canvas |
| [`state.js`](./state.js) | Central reactive state container across modules |
| [`utils.js`](./utils.js) | String and HTML escaping utility |
| [`workspace.js`](./workspace.js) | Working directory explorer, file modal browser, and native picker |

---

## Core Data Structures: Node & Edge Specification

The editor visualizes neural network graphs as electrical circuit schematics on an infinite 50px dot grid canvas. Both Nodes and Edges have specialized data models and rendering lifecycles coordinated between Vis.js, HTML5 Canvas hooks (`circuit.js`), and the Go backend.

### 1. Node Data Structure

Nodes represent PyTorch neural network layer blocks (e.g., `nn.Linear`, `nn.Conv2d`) rendered as clean rectangular IC chips.

#### Node Object Schema (`state.nodesDataSet`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier (e.g. `"1"`, `"2"`). Maintained as a string for consistent Vis.js `DataSet` lookups. |
| `label` | `string` | Multi-line text rendered inside the block on the canvas (e.g. `nn.Linear\n(128 → 64)`). Dynamically computed by `formatNodeLabel(baseType, params)`. |
| `layerType` | `string` | The base PyTorch layer class name (e.g., `"nn.Linear"`, `"nn.Conv2d"`, `"nn.ReLU"`) or a custom layer name. Maps to `LAYER_SCHEMAS`. |
| `shape` | `string` | Vis.js node shape. Always `'box'`. |
| `x` | `number` | Horizontal canvas coordinate in network units. Snapped to the 50px grid (`GRID_SIZE = 50`). |
| `y` | `number` | Vertical canvas coordinate in network units. Snapped to the 50px grid (`GRID_SIZE = 50`). |
| `params` | `object` | Key-value dictionary containing the layer's hyperparameters defined by `modules.json` (or `{ customArgs: string }` for custom blocks). |

#### Hyperparameter Sub-Schema (`params`) & `modules.json`
Each `layerType` corresponds to a schema definition loaded dynamically from [`modules.json`](../data/modules.json) (covering 152 PyTorch `nn.Module` classes):
- **Typed Fields**:
  - `number`: Rendered as numeric inputs with optional `min`, `max`, and `step` constraints (e.g. `kernel_size`, `in_features`, `dropout`).
  - `boolean`: Rendered as styled checkbox toggles (e.g. `bias`, `inplace`, `batch_first`).
  - Custom / unlisted layers: Rendered with a text input for freeform parameter strings (`customArgs`).
- **Label Formatting & Mustache Templating**:
  The displayed block label is generated dynamically via `formatNodeLabel()` and `renderLabelTemplate()` using mustache-style templates defined per layer:
  - `{key}`: Variable substitution (e.g. `{in_features} → {out_features}`).
  - `{#key}...{/key}`: Conditional truthy block (e.g. `{#inplace}\n(inplace){/inplace}`).
  - `{^key}...{/key}`: Inverted / falsy conditional block.
- **Code Template (`code`)**:
  Python constructor invocation string (e.g. `nn.Conv2d(in_channels={in_channels}, out_channels={out_channels}, kernel_size={kernel_size}, stride={stride}, padding={padding}, bias={bias})`) used by the live preview card and Python code synthesis generator.

#### Canvas Box Dimensions & Vis.js Configuration
- **Visual Styling**: White background (`#ffffff`), dark slate border (`#4a5568`, width `1.5px`), soft drop shadow (`rgba(0,0,0,0.08)`), Inter font (`14px`, `#1a202c`), with inner padding `margin: 12`.
- **Bounding Box Hit Testing**: Approximately `144 × 54px` around the node's `(x, y)` center. Used for rubber-band box multi-selection (`selection.js`) and wire attachment targeting.

#### Node JSON Example
```json
{
  "id": "1",
  "label": "nn.Linear\n(128 → 64)",
  "layerType": "nn.Linear",
  "shape": "box",
  "x": 200,
  "y": 100,
  "params": {
    "in_features": 128,
    "out_features": 64,
    "bias": true
  }
}
```

---

### 2. Edge Data Structure

Edges represent directed data-flow connections between layers. Rather than simple straight or curved lines, **each edge is a compound object containing an array of orthogonal straight line segments with sharp 90° right angles**, conforming to a PCB circuit trace aesthetic.

#### Edge Object Schema (`state.edgesDataSet`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique edge identifier (e.g. `"e1"`, `"e2"`). |
| `from` | `string` | Source node ID string. Self-connections (`from === to`) and duplicate directed edges (`from → to`) are rejected. |
| `to` | `string` | Destination node ID string. |
| `lines` | `Line[]` | Array of straight orthogonal line segment objects forming the wire path across the canvas. |
| `foldMode` | `string` *(optional)* | Current orthogonal bend orientation: `'horizontal'` (H-first) or `'vertical'` (V-first). Defaults to `'horizontal'`. |
| `customFold` | `number \| null` *(optional)* | Custom grid coordinate (X for horizontal fold mode, Y for vertical fold mode) set when the user drags the diamond fold handle. |
| `color` | `object` | Native Vis.js edge color override set to completely transparent (`rgba(0,0,0,0)`, `opacity: 0`, `inherit: false`). |
| `width` | `number` | Set to `10` to provide an invisible, wide hit-test zone for mouse selection, hovering, and double-clicking in Vis.js. |

#### Line Segment Specification (`Line`)

Every element inside `edge.lines` is a straight segment between two points on the 50px grid:

| Property | Type | Description |
| :--- | :--- | :--- |
| `first` | `{ x: number, y: number }` | Segment start coordinate on the canvas. |
| `last` | `{ x: number, y: number }` | Segment end coordinate on the canvas. |
| `from` | `{ x: number, y: number }` | Start coordinate alias (maintained for backend/frontend compatibility). |
| `to` | `{ x: number, y: number }` | End coordinate alias (maintained for backend/frontend compatibility). |

#### Orthogonal Routing Modes
1. **Collinear Line (1 Segment)**: If start and end share the same X or Y coordinate, a single straight horizontal or vertical line is produced.
2. **L-Bend (2 Segments)**: If nodes differ in both X and Y and midpoint aligns with an endpoint:
   - `'horizontal'`: `(x1, y1) → (x2, y1) → (x2, y2)` (Horizontal then Vertical).
   - `'vertical'`: `(x1, y1) → (x1, y2) → (x2, y2)` (Vertical then Horizontal).
3. **Z-Bend (3 Segments)**: Default multi-bend route with a middle fold segment:
   - `'horizontal'`: `(x1, y1) → (foldX, y1) → (foldX, y2) → (x2, y2)`.
   - `'vertical'`: `(x1, y1) → (x1, foldY) → (x2, foldY) → (x2, y2)`.
   - The fold line coordinate defaults to the rounded grid midpoint `Math.round(((c1 + c2) / 2) / 50) * 50`, or the user's `customFold`.
4. **Click-and-Drag / Waypoint Wire Drawing (Arbitrary Paths)**: In `connect` mode, users can click, hold, and drag directly across the grid to draw sharp 90° lines. Backtracking along an already drawn line automatically shrinks or removes segments in real time. Alternatively, clicking empty canvas drops intermediate corner waypoints $[W_1, W_2, \dots, W_k]$. Both methods produce an exact array of sharp straight orthogonal line segments obeying the user's input.
5. **Segment Simplification (`simplifyLines`)**: Merges consecutive collinear segments (e.g. two horizontal lines in a row) and strips zero-length segments.

#### Decoupling from Vis.js Native Rendering
Vis.js cannot render multi-segment right-angle orthogonal traces. To solve this:
- All native Vis.js edges are rendered **100% invisible** (`opacity: 0`, `inherit: false`).
- Vis.js is used strictly for its spatial index, hit-testing (using the `width: 10` invisible stroke), selection management, and keyboard event routing.
- All visual rendering is drawn via custom 2D Canvas hooks in `circuit.js`.

#### Canvas Rendering Pipeline (`circuit.js`)
- **`beforeDrawing` (Background & Traces)**:
  - Draws the PCB schematic dot-grid (`#f8fafc` background, `#47556959` dots at 50px intervals).
  - Draws all wire segments in `edge.lines` using standard circuit green (`#16a34a`, width `2.5px`), or neon green (`#00e07a`, width `3.5px`) when selected.
- **`afterDrawing` (Decorations & Previews)**:
  - **Junction Terminal Dots**: 3.5px solid dots drawn at all 90° corners/bends where line segments meet.
  - **Directional Arrowheads**: Rendered along the final segment entering the destination block boundary (offset 70px in X, 25px in Y from block center).
  - **Diamond Fold Handles**: On selected edges, a draggable diamond handle (amber `#f59e0b` when dragging, sky blue `#38bdf8` when idle) is drawn at the midpoint of the bend.
  - **Live Connect Preview**: In `connect` mode, renders dashed bright-green traces (`rgba(0, 224, 122, 0.90)`), waypoints, and a glowing highlight around hovered target blocks.

#### Waypoint & Endpoint Preservation (`updateEdgeEndpoints`)
When a node is dragged across the canvas:
- User-drawn line geometries (1-line collinear paths, 2-line L-bends) and intermediate corner waypoints are preserved without converting them into 3-segment Z-bends.
- If an edge has intermediate corner waypoints, they remain fixed at their grid coordinates; only the first segment (connected to `fromNode`) and last segment (connected to `toNode`) are re-routed to the new block coordinates.
- User-created custom bends, fold modes, and waypoint positions are never discarded or reset during block repositioning.

#### Edge Fold Controls
- **Invert Fold (H ⇄ V)**: Double-clicking an edge, selecting "Invert Edge Fold" in the context menu, or pressing **Spacebar** while drawing toggles `foldMode` between `'horizontal'` and `'vertical'`.
- **Drag Fold Handle**: Clicking and dragging the diamond handle moves the fold along the 50px grid, immediately updating lines and saving via `/api/updateEdge`.

#### Edge JSON Example
```json
{
  "id": "e1",
  "from": "1",
  "to": "2",
  "foldMode": "horizontal",
  "customFold": 350,
  "lines": [
    {
      "first": { "x": 200, "y": 100 },
      "last":  { "x": 350, "y": 100 },
      "from":  { "x": 200, "y": 100 },
      "to":    { "x": 350, "y": 100 }
    },
    {
      "first": { "x": 350, "y": 100 },
      "last":  { "x": 350, "y": 250 },
      "from":  { "x": 350, "y": 100 },
      "to":    { "x": 350, "y": 250 }
    },
    {
      "first": { "x": 350, "y": 250 },
      "last":  { "x": 500, "y": 250 },
      "from":  { "x": 350, "y": 250 },
      "to":    { "x": 500, "y": 250 }
    }
  ],
  "color": {
    "color":     "rgba(0,0,0,0)",
    "highlight": "rgba(0,0,0,0)",
    "hover":     "rgba(0,0,0,0)",
    "inherit":   false,
    "opacity":   0
  },
  "width": 10
}
```

---

## Module Details & Functions

### 1. `api.js`
Exports the `api` object containing asynchronous methods for HTTP requests to the Go backend.


- **Project Endpoints:**
  - `fetchProjects()`: `GET /api/projects` — Fetches list of models and active project ID.
  - `createProject(name)`: `POST /api/projects/create` — Creates a new project model.
  - `switchProject(id)`: `POST /api/projects/switch` — Switches active project by ID.
  - `deleteProject(id)`: `POST /api/projects/delete` — Deletes specified project.
  - `renameModel(name)`: `POST /api/rename` — Renames current project.
- **Workspace Endpoints:**
  - `fetchWorkspace()`: `GET /api/workspace` — Retrieves active working directory info.
  - `setWorkspace(path)`: `POST /api/workspace/set` — Sets new working directory.
  - `browseDirectory(dir)`: `GET /api/workspace/browse` — Lists files/folders in target path.
  - `selectNativeFolder()`: `POST /api/workspace/select-native` — Opens native Windows folder picker.
- **Graph Endpoints:**
  - `fetchGraphData()`: `GET /api/data` — Loads all nodes and edges for active project.
  - `addNode(label, layerType, x, y)`: `POST /api/addNode` — Adds node at given coordinates.
  - `updateNode(nodeData)`: `POST /api/updateNode` — Updates node label, type, and parameters.
  - `deleteNode(id)`: `POST /api/deleteNode` — Deletes single node by ID.
  - `deleteNodes(ids)`: `POST /api/deleteNodes` — Batch deletes array of node IDs.
  - `moveNode(id, x, y)`: `POST /api/moveNode` — Updates node position.
  - `addEdge(from, to, lines = null)`: `POST /api/addEdge` — Connects two nodes with a directed edge (accepts optional custom `lines` array for waypoints).
  - `updateEdge(id, lines)`: `POST /api/updateEdge` — Updates custom straight line segments and fold waypoints for an edge.
  - `deleteEdge(id)`: `POST /api/deleteEdge` — Deletes edge by ID.
  - `clearGraph()`: `POST /api/clear` — Clears all nodes/edges in current project.

---

### 2. `contextMenu.js`
Manages the right-click context menu on the canvas, selection deletion, and global keyboard shortcuts.

- `setupContextMenu()`: Binds right-click (`contextmenu`) on the canvas container, accurately detects clicked nodes or orthogonal edge traces (via `getEdgeAtCanvasPos`), dynamically enables/disables options (Edit, Delete Wire / Delete Blocks), sets active mode checkmarks, positions the menu safely within viewport boundaries, and listens for outside clicks and keyboard shortcuts (`Escape` to reset mode/close menus, `Delete`/`Backspace` to delete selection). Uses `setSelection({ nodes: [], edges: [clickedEdge] })` and stores `state.contextClickedEdge` to ensure edges stay selected when context menu is opened.
- `hideContextMenu()`: Hides the context menu DOM element.
- `deleteSelectionFromContextMenu()`: Removes all currently selected nodes and edges from both the Vis.js canvas DataSet and the backend (`/api/deleteEdge` and `/api/deleteNodes`). When deleting nodes, automatically prunes all connected edges from `state.edgesDataSet`. When deleting edges, immediately unselects all items and calls `state.network.redraw()`.

---

### 3. `circuit.js`
Renders the electrical schematic / circuit-simulator visual layer on the Vis.js canvas via `beforeDrawing` and `afterDrawing` hooks. Edges are treated as compound objects with a `lines` attribute containing multiple straight line segments with sharp 90° right angles. The user has full control over how each edge folds:

- `GRID_SIZE` *(exported constant)*: Grid spacing in network-coordinate units (50 units). Used for grid rendering and snapping.
- `snapToGrid(x, y)`: Pure helper — rounds a network-coordinate pair to the nearest 50-unit grid point. Returns `{ x, y }`.
- `pointToSegmentDistance(px, py, x1, y1, x2, y2)`: Calculates perpendicular distance from canvas coordinates to a straight line segment.
- `getEdgeAtCanvasPos(canvasPos, tolerance = 14)`: Precise spatial index hit-tester that determines which edge's orthogonal straight lines pass within tolerance of a canvas coordinate point. Automatically scales tolerance with current camera zoom (`tolerance / scale`) and computes lines on the fly if needed. Used for wire clicking, selection, hovering, double-clicking, and context menus.
- `computeOrthogonalLines(p1, p2, bendMode)`: Computes pure right-angle straight line segments between two points. If p1 and p2 differ in both X and Y, creates an orthogonal 2-segment L-bend oriented according to `bendMode` (`'horizontal'` for H→V, `'vertical'` for V→H).
- `simplifyLines(lines)`: Cleans up line segment arrays by filtering out zero-length lines and merging consecutive collinear segments.
- `computeEdgeLines(fromPos, toPos, foldMode, customFold)`: Calculates orthogonal straight line segments connecting two points with sharp 90° corners on the electrical circuit grid. Supports `foldMode` (`'horizontal'` for H→V→H, `'vertical'` for V→H→V) and `customFold` coordinate (user-dragged fold position). Returns an array of line objects, each containing `{ first: {x, y}, last: {x, y}, from: {x, y}, to: {x, y} }`.
- `updateEdgeEndpoints(edge, fromPos, toPos)`: Updates edge lines when connected blocks are dragged while preserving 1-line collinear paths, 2-line L-bends (via `computeOrthogonalLines`), and all intermediate user-created corner waypoints without forcing them into 3-segment Z-bends.
- `getEdgeFoldHandlePos(edge)`: Returns the canvas coordinates and orientation of the interactive fold handle for an edge.
- `invertEdgeFold(edgeId)`: Toggles an edge's fold orientation between Horizontal-first and Vertical-first, recalculates lines, persists via `/api/updateEdge`, and triggers a canvas redraw.
- `cancelWireCreation()`: Clears active in-progress wire drawing state, drawn path points (`_wirePath`), waypoints, mouse tracking, and resets the toolbar mode banner.
- `extendWirePath(targetGrid)`: Extends the in-progress `_wirePath` along the 50px grid with sharp orthogonal 90° segments while dragging. Automatically detects reverse movement / backtracking along previously drawn lines and erases/shrinks backtracked segments in real time.
- `finishWireCreation(targetNodeId)`: Converts `_wirePath` into an array of sharp straight `Line` objects and connects to the target node. If an edge already exists between the two nodes, gracefully updates the existing edge's line array to the newly drawn path (allowing wire redraws without false duplicate connection alerts); otherwise adds a new edge.
- `setupCircuitCanvas()`: Registers canvas hooks on the active `state.network`:
  - **`beforeDrawing`**: Fills the canvas background (`#f8fafc`), draws the electrical schematic dot grid, and renders all straight line segments (`edge.lines`). Automatically prunes any orphan edges whose connected nodes no longer exist.
  - **`afterDrawing`**: Renders junction terminal dots at 90° corners, directional arrows entering destination node boxes, interactive diamond fold handles on selected edges, and the live connection preview when in `'connect'` mode.
  - **Wire Selection & Removal**:
    - Hovering over a wire trace in `'move'` mode shows a pointer cursor.
    - Left-clicking directly on any orthogonal wire segment selects that connection (via `setSelection({ nodes: [], edges: [edgeId] })`), highlighting it neon green and showing its diamond fold handle.
    - Once selected, connections can be removed by pressing **`Delete`** or **`Backspace`** on the keyboard, or clicking the **`🗑️ Delete`** toolbar button.
    - Right-clicking directly on a wire opens the context menu with **Delete Wire** (and **Invert Edge Fold**).
  - **Interactive Wire Drawing (Click->Hold->Drag & Waypoints)**:
    - Click and hold on any block, then drag across the grid to draw sharp right-angle circuit lines that strictly follow the cursor.
    - Backtracking removal: dragging backwards along a drawn line automatically erases and removes segments in real time.
    - Alternatively, click on empty canvas to drop intermediate corner waypoints.
    - Release or click over a target block (which glows green) to complete the connection with the exact array of lines drawn.
    - Redrawing connections: drawing between two already connected blocks smoothly updates the existing wire geometry with the newly drawn lines without showing intrusive alert popups.
    - Press **`Space`** to flip bend orientation, **`Escape`** or right-click to cancel.
  - **Fold Drag Interactions**: Binds mousedown/mousemove/mouseup to let users click and drag the diamond fold handle on any selected edge across the 50px grid, immediately updating line segments and saving to the backend.

---

### 4. `graph.js`
Initializes and coordinates the Vis.js network canvas.

- `loadGraph()`: Loads the active project's graph from `/api/data`, instantiates `vis.DataSet` for nodes and edges (ensuring each edge contains the `lines` attribute, transparent Vis.js native edge styling, and fold state), disables built-in Vis.js manipulation, enables grid snapping, binds `'click'` listener to accurately select orthogonal wire segments, and binds event listeners for live edge line recomputation during node dragging via `updateEdgeEndpoints(edge, fn, tn)`.
- `createBlock(label, posX, posY)`: Instantiates a new layer node with default parameters, snaps placement coordinates to the nearest grid point, updates the Vis.js DataSet, and calls `/api/addNode`.
- Double-clicking an edge toggles its fold orientation between Horizontal-first and Vertical-first.
- `fitView()`: Centers and scales the canvas camera to fit all nodes smoothly.
- `clearGraph()`: Cancels active wire drawing (`cancelWireCreation()`), asks for user confirmation, clears backend via `/api/clear`, wipes `nodesDataSet` and `edgesDataSet`, unselects all items, and triggers an immediate redraw.

---

### 5. `modals.js`
Handles UI dialog modals for creating new blocks and modifying existing layer hyperparameters.

- **Add Node Modal:**
  - `CATEGORY_DEFINITIONS`: Catalog of functional layer categories (Dense, Convolutional, Activation, Pooling, Normalization, Padding, Regularization, Recurrent, Transformer, Embedding, Vision, Loss, Distance, Utility, Custom) with distinctive icons.
  - `populateCategoryDropdown()`: Populates the category filter `<select id="nodeCategory">` with real-time layer counts per category.
  - `populateNodeTypeDropdown(category, searchQuery)`: Dynamically filters the block dropdown by selected category and live text search query across layer class names, badges, and categories. When "All Categories" is selected, organizes options into categorized `<optgroup>` sections.
  - `updateNodePreview()`: Live preview card inside the modal showing the selected layer's category, badge, formatted canvas display label, and Python constructor code template.
  - `openAddNodeModal(nodeData, callback)`: Displays the add block dialog, initializes category and search filters, and focuses the search field for quick keyboard navigation.
  - `toggleCustom()`: Toggles the custom layer name input when "Custom Layer..." is selected.
  - `saveNode()`: Reads chosen layer type/name, calculates placement position, and triggers creation.
  - `cancelNode()`: Dismisses the modal and cancels Vis.js manipulation callback.
  - `closeModal()`: Closes add block modal and overlay.
  - `openAddNodeAtContext()`: Opens add node modal using the right-click context menu coordinates.
- **Edit Node Parameters Modal:**
  - `openEditNodeModal(nodeId)`: Opens the parameter editor dynamically populated based on the layer's schema fields (numeric inputs, min/max hints, checkboxes for booleans).
  - `closeEditModal()`: Dismisses the parameter editor modal.
  - `saveEditNode()`: Reads updated parameter form inputs, formats the display label, updates the local Vis.js DataSet, and calls `api.updateNode`.
  - `openEditNodeFromContext()`: Context menu action to open edit modal for the currently selected node.
  - `closeAllModals()`: Closes all modals and resets transient states.

---

### 6. `modes.js`
Controls interaction modes on the canvas toolbar.

- `setMode(mode)`: Sets the current tool mode (`'move'`, `'select'`, `'connect'`, `'add'`). Updates toolbar button active classes, context menu checkmarks, floating mode banner instructions, and cursor styles. Ensures Vis.js native edges remain completely transparent across all modes (`opacity: 0`). When switching away from `'connect'`, automatically calls `cancelWireCreation()` to reset drawing state.
- `setupCanvasClickAdd()`: Binds canvas click listener while in `'add'` mode, opening the categorized block creation modal pre-populated with the click location.

---

### 7. `palette.js`
Handles dynamic rendering and user interactions from the left sidebar layer palette.

- `renderPalette()`: Dynamically renders the 10 most fundamental PyTorch layers inside `#paletteList` under the "Fundemental Blocks" section (`nn.Linear`, `nn.Conv2d`, `nn.ReLU`, `nn.MaxPool2d`, `nn.BatchNorm2d`, `nn.LayerNorm`, `nn.Dropout`, `nn.LSTM`, `nn.MultiheadAttention`, `nn.Embedding`), followed by a "+ More / Custom..." block that launches the full categorized 152-module selection modal. Automatically calls `setupPaletteDragAndDrop()`.
- `setupPaletteDragAndDrop()`:
  - Binds HTML5 drag events (`dragstart`, `dragend`) on draggable layer palette items.
  - Listens for canvas `dragover`, `dragleave`, and `drop`, converting DOM client coordinates to Vis.js canvas coordinates to place dropped blocks.
  - Enables single-click on palette items as a quick shortcut to spawn layers near the center of the current view.

---

### 8. `projects.js`
Manages model tabs in the sidebar and header model renaming.

- `loadProjects()`: Queries backend for model list and triggers sidebar rendering.
- `renderProjectList(list, currentId)`: Generates project list items in the sidebar with active highlights, click-to-switch handlers, and delete buttons.
- `createProject()`: Prompts user for a model name and creates a new project tab.
- `switchProject(id)`: Changes the active model and reloads the canvas.
- `deleteProject(event, id)`: Prompts confirmation and deletes the chosen model.
- `startRename()`: Replaces the static header title with an inline text input field for editing.
- `commitRename()`: Saves the updated title to the backend and synchronizes sidebar and page title.
- `cancelRename()`: Discards inline title edits without saving.

---

### 9. `schemas.js`
Manages PyTorch neural network layer schemas, defaults, and label generators loaded dynamically from `/static/data/modules.json`.

- `initSchemas()`: Asynchronous initializer that fetches `/static/data/modules.json`, populates `MODULES_LIST`, and builds the `LAYER_SCHEMAS` map (falls back gracefully to embedded layer definitions if the network request fails).
- `MODULES_LIST`: Array of all available layer module definitions in order (used by palette and dropdowns).
- `LAYER_SCHEMAS`: Configuration object keyed by layer type (`nn.Linear`, `nn.Conv2d`, `nn.ReLU`, etc.) containing:
  - `fields`: Array of parameter definitions (`key`, `label`, `type`, `default`, `min`, `max`, `step`).
  - `labelTemplate`: String template for rendering canvas labels with variable substitution (`{type}`, `{in_features}`) and conditional blocks (`{#inplace}...{/inplace}`, `{^inplace}...{/inplace}`).
- `renderLabelTemplate(template, data)`: Evaluates mustache-style templating and conditionals for dynamic block text.
- `getDefaultParams(layerType)`: Returns key-value object of default values for the specified layer schema.
- `getLayerBaseType(node)`: Extracts base layer name string from a node.
- `formatNodeLabel(layerType, params)`: Computes the multi-line node label string shown inside the canvas block (e.g. `nn.Linear\n(128 → 64)`).

---

### 10. `selection.js`
Implements marquee / rubber-band box multi-selection.

- `setupBoxSelection()`: Enables dragging a rectangle over the canvas (either when in `'select'` mode or by holding `Shift` in `'move'` mode). Computes intersection against all node bounding boxes and updates Vis.js selected nodes in real time.

---

### 11. `state.js`
Shared state store module.

- `state`: Exported object holding reactive application references:
  - `network`: Active `vis.Network` instance.
  - `nodesDataSet`, `edgesDataSet`: Vis.js data collections.
  - `addNodeCallback`: Transient Vis.js manipulation callback during node creation.
  - `tempNodeData`: Temporary coordinates `{x, y}` for newly placed nodes before saving.
  - `currentMode`: Active interaction mode (`'move'`, `'select'`, `'add'`, `'connect'`).
  - `contextClickPos`: Coordinates of last right-click on canvas.
  - `editingNodeId`, `editingLayerType`: Active node being edited in parameter modal.
  - `workingDir`, `workingDirName`, `browsingDir`, `workspaceFiles`: Workspace directory path state.

---

### 12. `utils.js`
General utility functions.

- `esc(str)`: Sanitizes HTML special characters (`&`, `<`, `>`, `"`) to prevent injection vulnerabilities when inserting text into DOM templates.

---

### 13. `workspace.js`
Manages workspace directory selection and file listing.

- `initWorkspace()`: Loads initial workspace info on startup and configures outside-click listener for header File menu.
- `loadWorkspace()`: Queries backend for current active directory.
- `updateWorkspaceUI(workingDir, name)`: Updates workspace indicators in header pill and sidebar.
- `loadWorkspaceFiles(dirPath)`: Renders subfolders and files inside the sidebar workspace tree view with custom icons.
- `toggleFileMenu(event)` / `closeFileMenu()`: Toggles and closes the header File dropdown.
- `openSelectFolderModal(targetDir)` / `closeSelectFolderModal()`: Opens and closes the folder browser modal.
- `browseTo(dirPath)`: Navigates inside the modal file browser, rendering drive shortcuts, parent folder navigation, and folder selection buttons.
- `browseParentFolder()`: Navigates to parent directory.
- `applyTypedPath()`: Navigates to custom path typed into modal path input.
- `confirmSelectFolder()`: Sets selected folder as the active working directory.
- `browseSystemFolder()`: Triggers the Windows native folder picker dialog via backend.

---

## Related Documentation

- [Root Documentation](../../readme.md) — Main overview of Ein Theater.
- [Backend Handler Documentation](../../handler/README.md) — Detailed Go backend architecture, concurrency model, and REST handlers.
