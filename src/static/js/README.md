# Frontend JavaScript Modules Documentation (`src/static/js`)

This directory contains the client-side ES6 JavaScript modules that power the interactive neural network diagram editor, project tabs, canvas interactions, and workspace file browser.

---

## Overview of Modules

| File | Primary Responsibility |
| :--- | :--- |
| [`api.js`](./api.js) | Backend REST API communication wrapper |
| [`contextMenu.js`](./contextMenu.js) | Right-click context menu and global canvas shortcuts |
| [`graph.js`](./graph.js) | Vis.js network initialization, node/edge sync, and view management |
| [`modals.js`](./modals.js) | Modal dialogs for adding blocks and editing layer hyperparameters |
| [`modes.js`](./modes.js) | Toolbar mode switching (`move`, `select`, `add`, `connect`) |
| [`palette.js`](./palette.js) | Drag-and-drop and click-to-add from sidebar layer palette |
| [`projects.js`](./projects.js) | Multi-model management, project switching, and inline renaming |
| [`schemas.js`](./schemas.js) | PyTorch layer schemas, parameter defaults, and node label formatting |
| [`selection.js`](./selection.js) | Rubber-band marquee box selection on canvas |
| [`state.js`](./state.js) | Central reactive state container across modules |
| [`utils.js`](./utils.js) | String and HTML escaping utility |
| [`workspace.js`](./workspace.js) | Working directory explorer, file modal browser, and native picker |

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
  - `addEdge(from, to)`: `POST /api/addEdge` — Connects two nodes with a directed edge.
  - `deleteEdge(id)`: `POST /api/deleteEdge` — Deletes edge by ID.
  - `clearGraph()`: `POST /api/clear` — Clears all nodes/edges in current project.

---

### 2. `contextMenu.js`
Manages the right-click context menu on the canvas and global keyboard shortcuts.

- `setupContextMenu()`: Binds right-click (`contextmenu`) on the canvas container, checks whether a node is clicked, dynamically enables/disables options (Edit, Delete count), sets active mode checkmarks, positions the menu safely within viewport boundaries, and listens for outside clicks and keyboard shortcuts (`Escape` to reset mode/close menus, `Delete`/`Backspace` to delete selection).
- `hideContextMenu()`: Hides the context menu DOM element.
- `deleteSelectionFromContextMenu()`: Removes all currently selected nodes and edges from both the Vis.js canvas DataSet and the backend via batch API.

---

### 3. `graph.js`
Initializes and coordinates the Vis.js network canvas.

- `loadGraph()`: Loads active project's graph from `/api/data`, instantiates `vis.DataSet` for nodes and edges, formats labels based on parameter schemas, sets up network event hooks (`dragEnd` to persist node positions, `doubleClick` to open parameter editor), and configures Vis.js manipulation callbacks.
- `createBlock(label, posX, posY)`: Instantiates a new layer node with default parameters at specific coordinates, updates the Vis.js DataSet, and calls `/api/addNode`.
- `fitView()`: Centers and scales the canvas camera to fit all nodes smoothly.
- `clearGraph()`: Asks for user confirmation, then clears the canvas and backend state.

---

### 4. `modals.js`
Handles UI dialog modals for creating new blocks and modifying existing layer hyperparameters.

- **Add Node Modal:**
  - `openAddNodeModal(nodeData, callback)`: Displays the add block dialog.
  - `toggleCustom()`: Toggles the custom layer name input when "Custom..." is selected in dropdown.
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

### 5. `modes.js`
Controls interaction modes on the canvas toolbar.

- `setMode(mode)`: Sets the current tool mode (`'move'`, `'select'`, `'connect'`, `'add'`). Updates toolbar button active classes, context menu checkmarks, floating mode banner instructions, and cursor styles. Enables/disables Vis.js drag and edge creation behaviors accordingly.
- `setupCanvasClickAdd()`: Binds canvas click listener while in `'add'` mode, opening the block creation modal pre-populated with the click location.

---

### 6. `palette.js`
Handles interactions from the left sidebar layer palette.

- `setupPaletteDragAndDrop()`:
  - Binds HTML5 drag events (`dragstart`, `dragend`) on draggable layer palette items.
  - Listens for canvas `dragover`, `dragleave`, and `drop`, converting DOM client coordinates to Vis.js canvas coordinates to place dropped blocks.
  - Enables single-click on palette items as a quick shortcut to spawn layers near the center of the current view.

---

### 7. `projects.js`
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

### 8. `schemas.js`
Defines hyperparameter schemas, defaults, and label generators for supported PyTorch neural network layers.

- `LAYER_SCHEMAS`: Configuration object containing metadata and field specifications for:
  - `nn.Linear` (`in_features`, `out_features`, `bias`)
  - `nn.Conv2d` (`in_channels`, `out_channels`, `kernel_size`, `stride`, `padding`, `bias`)
  - `nn.ReLU` (`inplace`)
  - `nn.MaxPool2d` (`kernel_size`, `stride`, `padding`)
  - `nn.Dropout` (`p`)
  - `nn.BatchNorm2d` (`num_features`, `eps`)
  - `nn.LayerNorm` (`normalized_shape`, `eps`)
  - `nn.LSTM` (`input_size`, `hidden_size`, `num_layers`, `batch_first`)
  - `nn.Embedding` (`num_embeddings`, `embedding_dim`)
  - `nn.MultiheadAttention` (`embed_dim`, `num_heads`, `dropout`)
- `getDefaultParams(layerType)`: Returns key-value object of default values for the specified layer schema.
- `getLayerBaseType(node)`: Extracts base layer name string from a node.
- `formatNodeLabel(layerType, params)`: Computes the multi-line node label string shown inside the canvas block (e.g. `nn.Linear\n(128 → 64)`).

---

### 9. `selection.js`
Implements marquee / rubber-band box multi-selection.

- `setupBoxSelection()`: Enables dragging a rectangle over the canvas (either when in `'select'` mode or by holding `Shift` in `'move'` mode). Computes intersection against all node bounding boxes and updates Vis.js selected nodes in real time.

---

### 10. `state.js`
Shared state store module.

- `state`: Exported object holding reactive application references:
  - `network`: Active `vis.Network` instance.
  - `nodesDataSet`, `edgesDataSet`: Vis.js data collections.
  - `currentMode`: Active interaction mode (`'move'`, `'select'`, `'add'`, `'connect'`).
  - `contextClickPos`: Coordinates of last right-click on canvas.
  - `editingNodeId`, `editingLayerType`: Active node being edited in parameter modal.
  - `workingDir`, `workingDirName`, `browsingDir`, `workspaceFiles`: Workspace directory path state.

---

### 11. `utils.js`
General utility functions.

- `esc(str)`: Sanitizes HTML special characters (`&`, `<`, `>`, `"`) to prevent injection vulnerabilities when inserting text into DOM templates.

---

### 12. `workspace.js`
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
