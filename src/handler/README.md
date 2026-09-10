# Backend Handlers Documentation (`src/handler`)

This directory contains the Go backend HTTP handler functions, data structures, and state management for **Ein Theater**.

---

## Architecture Overview

All handlers interact with an in-memory state protected by a `sync.Mutex` (`mu`). The server manages:
- **Projects/Models**: Multi-project tabs containing graph nodes and edges.
- **Graph Elements**: PyTorch neural network layer blocks (nodes) and directed links (edges).
- **Workspace/Working Directory**: Local filesystem browsing, directory selection, and Windows native folder dialog integration.

---

## Files and Functions

### 1. [`graph_handlers.go`](./graph_handlers.go)
Handles CRUD operations for nodes and edges within the currently active model canvas.

| Function / Type | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `DataHandler(w, r)` | `GET /api/data` | Serializes and returns all nodes and edges belonging to the currently active project as JSON (`GraphData`). |
| `AddNodeHandler(w, r)` | `POST /api/addNode` | Creates and adds a new node to the active project. Reads query parameters: `label`, `layerType`, `x`, and `y`. Returns the created `Node` JSON. |
| `UpdateNodeReq` | *(Struct)* | Request payload struct for updating nodes: contains `id`, `label`, `layerType`, and `params`. |
| `UpdateNodeHandler(w, r)` | `POST /api/updateNode` | Parses JSON body (`UpdateNodeReq`) and updates a node's label, layer type, and hyperparameter configuration in the active project. |
| `DeleteNodeHandler(w, r)` | `POST /api/deleteNode` | Deletes a single node by query parameter `id`, and removes any connected edges. |
| `DeleteNodesHandler(w, r)` | `POST /api/deleteNodes` | Batch deletes multiple nodes and their attached edges. Accepts either a JSON array of IDs in request body or a comma-separated `ids` query parameter. |
| `MoveNodeHandler(w, r)` | `POST /api/moveNode` | Updates a node's canvas coordinates (`x` and `y` query parameters) after drag operations, and synchronizes the endpoints of all connected edges while preserving existing fold waypoints. |
| `AddEdgeReq` | *(Struct)* | Request payload struct for adding an edge: contains `from`, `to`, and optional custom `lines` slice. |
| `AddEdgeHandler(w, r)` | `POST /api/addEdge` | Creates or updates a directed connection between two nodes using JSON body (`AddEdgeReq`) or query parameters `from` and `to`. If custom `lines` are provided (from user waypoint/drag routing), they are saved directly; otherwise falls back to `ComputeEdgeLines`. Rejects self-loops and missing node references. If an edge already exists between `from` and `to`, gracefully updates its lines with the new path and returns HTTP 200 rather than failing. Returns the created or updated `Edge` JSON. |
| `UpdateEdgeReq` | *(Struct)* | Request payload struct for updating edge lines: contains `id` and `lines` slice. |
| `UpdateEdgeHandler(w, r)` | `POST /api/updateEdge` | Updates an edge's custom straight lines / user-decided fold coordinates. |
| `DeleteEdgeHandler(w, r)` | `POST /api/deleteEdge` | Deletes an edge identified by query parameter `id`. |
| `ClearGraphHandler(w, r)` | `POST /api/clear` | Clears all nodes and edges from the currently active project canvas. |

---

### 2. [`index_handler.go`](./index_handler.go)
Handles serving the frontend entry point.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `IndexHandler(w, r)` | `GET /` | Serves the main HTML single-page application (`templates/index.html`). Rejects unmatched non-root routes with HTTP 404 Not Found. |

---

### 3. [`models.go`](./models.go)
Defines core data structures, shared global state, and initialization logic.

#### Data Structures (Types)
- **`Point`**: Represents a 2D coordinate (`x`, `y`) on the electrical circuit grid.
- **`Line`**: Represents a straight line segment forming part of an orthogonal edge trace. Fields: `first`, `last`, `from`, `to` (each a `Point` coordinate).
- **`Node`**: Represents a neural network layer block. Fields: `id`, `label`, `shape`, `color`, `layerType`, `params` (arbitrary hyperparameter key-value pairs), `x`, and `y`.
- **`Edge`**: Represents a directed connection between two nodes, viewed as a compound object of multiple straight lines (`lines` slice of `Line`). Fields: `id`, `from`, `to`, and `lines`.
- **`Project`**: Represents an individual neural network model canvas containing its own `nodes` map, `edges` map, and ID increment counters.
- **`ProjectMeta`**: Lightweight summary struct (`id`, `name`) returned in project lists.
- **`GraphData`**: Graph payload containing `projectId`, `name`, `nodes` slice, and `edges` slice.
- **`WorkspaceResponse`**: Response payload containing `workingDir` path and base folder `name`.
- **`DirectoryItem`**: Represents a file or folder with `name`, `path`, `isDir`, and `size`.
- **`BrowseResponse`**: Directory browsing payload containing `current`, `parent`, `drives`, `folders`, and `files`.

#### Functions & State
| Function / Variable | Description |
| :--- | :--- |
| `mu sync.Mutex` | Global mutex synchronizing concurrent access to all project, graph, and workspace state. |
| `GridSize` | Constant (50.0) defining the grid dot spacing for orthogonal trace alignment. |
| `ComputeEdgeLines(from, to)` | Computes orthogonal straight line segments with sharp 90° right angles connecting `fromNode` to `toNode` on the electrical circuit grid. Populates `first`, `last`, `from`, and `to` coordinates for each line. |
| `moduleSeedDef` | Internal struct used when parsing `modules.json` to identify seed layers (`type` and `defaultInSeed` fields). |
| `loadDefaultSeedPalette()` | Reads `static/data/modules.json` and returns the ordered list of layer type strings where `defaultInSeed` is `true`. Falls back to a hardcoded list if the file is missing or malformed. |
| `makeProject(name)` | Helper that allocates a new `Project` and seeds it with default PyTorch layer palette blocks dynamically loaded from `static/data/modules.json` (with built-in fallback). |
| `init()` | Package initializer that sets up the first project ("Untitled Model") and defaults. |
| `cur() *Project` | Helper returning pointer to the currently active `Project`. Must be called while holding `mu`. |

---

### 4. [`project_handlers.go`](./project_handlers.go)
Handles project (model) lifecycle, switching, and renaming.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `ListProjectsHandler(w, r)` | `GET /api/projects` | Returns the list of all projects in creation order and indicates the currently active project ID. |
| `CreateProjectHandler(w, r)` | `POST /api/projects/create` | Instantiates a new project with optional `name` query parameter, adds default palette layers, switches to it as active, and returns its `ProjectMeta`. |
| `SwitchProjectHandler(w, r)` | `POST /api/projects/switch` | Sets the active project to the one specified by query parameter `id`. |
| `DeleteProjectHandler(w, r)` | `POST /api/projects/delete` | Deletes a project by query parameter `id`. Rejects deletion if it is the only remaining project. If active project is deleted, automatically switches to the first available project. |
| `RenameModelHandler(w, r)` | `POST /api/rename` | Updates the `Name` of the currently active project using query parameter `name`. |

---

### 5. [`workspace_handlers.go`](./workspace_handlers.go)
Handles filesystem interaction, directory browsing, and native folder picker integration.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `getSystemDrives()` | *(Helper)* | Probes drive letters A through Z on Windows using `os.Stat` and returns active drive root paths (e.g., `["C:\\", "D:\\"]`). |
| `WorkspaceHandler(w, r)` | `GET /api/workspace` | Returns the current working directory path and base folder name (`WorkspaceResponse`). |
| `SetWorkspaceHandler(w, r)` | `POST /api/workspace/set` | Validates that a path exists and is a directory (from `path` query param or JSON body), then saves it as the active working directory. |
| `BrowseWorkspaceHandler(w, r)` | `GET /api/workspace/browse` | Reads subfolders and non-hidden files in the directory specified by `dir` query param (falls back to working directory, user home, or system drive). Returns `BrowseResponse`. |
| `SelectNativeFolderHandler(w, r)` | `POST /api/workspace/select-native` | Launches a Windows native folder picker dialog using PowerShell and `System.Windows.Forms.FolderBrowserDialog`. If accepted, updates the active working directory and returns the path. |
