# Backend Handlers Documentation (`src/handler`)

This directory contains the Go backend HTTP handler functions, data structures, and state management for **Ein Theater**.

---

## Architecture Overview

All handlers interact with an in-memory state protected by a package-level mutex (`sync.Mutex` `mu`). The server manages:
- **Projects / Models**: Multi-project tabs containing graph nodes and edges.
- **Graph Elements**: PyTorch neural network layer blocks (nodes) and directed orthogonal circuit connections (edges).
- **Workspace & Working Directory**: Local filesystem browsing, directory selection, and Windows native folder dialog integration via PowerShell.
- **Dynamic Module Seed Palette**: Automatically loads seed layers from `modules.json` to initialize new projects.

```
                  ┌──────────────────────────────────────────────┐
                  │            Incoming HTTP Request             │
                  └──────────────────────┬───────────────────────┘
                                         │
                   ┌─────────────────────▼─────────────────────┐
                   │               mu.Lock()                   │
                   ├───────────────────────────────────────────┤
                   │  Project Map: projects[id]                │
                   │  Current Project: cur()                   │
                   │  Working Directory: workingDir            │
                   ├───────────────────────────────────────────┤
                   │              mu.Unlock()                  │
                   └─────────────────────┬─────────────────────┘
                                         │
                  ┌──────────────────────▼─────────────────────┐
                  │         JSON / HTML HTTP Response          │
                  └────────────────────────────────────────────┘
```

---

## Files and Functions

### 1. [`graph_handlers.go`](./graph_handlers.go)
Handles CRUD operations for neural network nodes and directed circuit edges within the active model canvas.

| Function / Type | HTTP Method & Route | Request Body / Query Params | Description |
| :--- | :--- | :--- | :--- |
| `DataHandler(w, r)` | `GET /api/data` | None | Serializes and returns all nodes and edges belonging to the currently active project as JSON (`GraphData`). |
| `AddNodeHandler(w, r)` | `POST /api/addNode` | Query: `label`, `layerType`, `x`, `y` | Creates and adds a new node to the active project. Snaps coordinates to grid if needed. Returns the created `Node` JSON. |
| `UpdateNodeReq` | *(Struct)* | JSON: `{ "id", "label", "layerType", "params" }` | Request payload struct for updating node attributes and hyperparameters. |
| `UpdateNodeHandler(w, r)` | `POST /api/updateNode` | JSON: `UpdateNodeReq` | Parses JSON body and updates a node's label, layer type, and hyperparameter configuration map (`params`) in the active project. |
| `DeleteNodeHandler(w, r)` | `POST /api/deleteNode` | Query: `id` | Deletes a single node by ID and automatically removes all connected edges. |
| `DeleteNodesHandler(w, r)` | `POST /api/deleteNodes` | JSON array `["1", "2"]` or Query: `ids=1,2` | Batch deletes multiple nodes and all attached edges in a single atomic transaction. |
| `MoveNodeHandler(w, r)` | `POST /api/moveNode` | Query: `id`, `x`, `y` | Updates a node's canvas coordinates after dragging, and automatically adjusts the endpoints of all connected edges while preserving existing intermediate fold waypoints. |
| `AddEdgeReq` | *(Struct)* | JSON: `{ "from", "to", "lines"? }` | Request payload struct for adding an edge, supporting custom straight line segments. |
| `AddEdgeHandler(w, r)` | `POST /api/addEdge` | JSON `AddEdgeReq` or Query: `from`, `to` | Creates or updates a directed connection between two nodes. If custom `lines` are provided (from client-side waypoint routing), saves them directly; otherwise computes orthogonal segments via `ComputeEdgeLines`. Rejects self-loops (`from == to`) and missing node references. If an edge already exists between `from` and `to`, updates its path gracefully. Returns created or updated `Edge` JSON. |
| `UpdateEdgeReq` | *(Struct)* | JSON: `{ "id", "lines" }` | Request payload struct for updating edge lines and waypoint coordinates. |
| `UpdateEdgeHandler(w, r)` | `POST /api/updateEdge` | JSON: `UpdateEdgeReq` | Updates an edge's custom straight line segments when the user drags a diamond fold handle or inverts fold orientation. |
| `DeleteEdgeHandler(w, r)` | `POST /api/deleteEdge` | Query: `id` | Deletes a directed edge identified by query parameter `id`. |
| `ClearGraphHandler(w, r)` | `POST /api/clear` | None | Wipes all nodes and edges from the currently active project canvas. |

---

### 2. [`index_handler.go`](./index_handler.go)
Serves the HTML single-page application entry point.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `IndexHandler(w, r)` | `GET /` | Serves the main application template (`templates/index.html`). Rejects unmatched non-root routes with HTTP 404 Not Found. |

---

### 3. [`models.go`](./models.go)
Defines core domain models, shared thread-safe state, seed palette loading, and orthogonal circuit routing logic.

#### Data Structures (Types)

- **`Point`**: 2D coordinate `{ X float64, Y float64 }` on the circuit grid.
- **`Line`**: Straight line segment object forming an orthogonal trace. Fields:
  - `First Point`: Starting point of the segment.
  - `Last Point`: Ending point of the segment.
  - `From Point`: Same as `First` (for compatibility with various serialization formats).
  - `To Point`: Same as `Last` (for compatibility with various serialization formats).
- **`Node`**: PyTorch neural layer block. Fields:
  - `ID string`: Unique node identifier.
  - `Label string`: Formatted multi-line text rendered on the canvas (e.g. `nn.Linear\n(128 → 64)`).
  - `Shape string`: Always `"box"`.
  - `Color string`: Hex background color (default `"#ffffff"`).
  - `LayerType string`: Base PyTorch layer type (e.g. `"nn.Conv2d"`).
  - `Params map[string]interface{}`: Hyperparameter dictionary.
  - `X float64`, `Y float64`: Canvas grid coordinates.
- **`Edge`**: Directed orthogonal connection between blocks. Fields:
  - `ID string`: Unique edge identifier.
  - `From string`: Source node ID.
  - `To string`: Destination node ID.
  - `Lines []Line`: Slice of straight orthogonal line segments with 90° bends.
- **`Project`**: Independent neural network canvas instance. Fields:
  - `ID string`: Unique project ID.
  - `Name string`: Project title (e.g. `"Untitled Model"`).
  - `Nodes map[string]Node`: Node collection.
  - `Edges map[string]Edge`: Edge collection.
  - `NextNodeID int`, `NextEdgeID int`: Monotonic ID counters.
- **`ProjectMeta`**: Lightweight summary struct (`ID`, `Name`) for project tabs.
- **`GraphData`**: Graph payload containing `ProjectID`, `Name`, `Nodes []Node`, and `Edges []Edge`.
- **`WorkspaceResponse`**: Response containing `WorkingDir` path and base folder `Name`.
- **`DirectoryItem`**: Filesystem entry with `Name`, `Path`, `IsDir`, and `Size`.
- **`BrowseResponse`**: Filesystem browser payload with `Current`, `Parent`, `Drives []string`, `Folders []DirectoryItem`, and `Files []DirectoryItem`.

#### Functions & State Management

| Function / Variable | Description |
| :--- | :--- |
| `mu sync.Mutex` | Protects concurrent read/write operations across projects, canvas graphs, and workspace settings. |
| `GridSize = 50.0` | Constant defining the electrical circuit grid dot spacing for alignment. |
| `ComputeEdgeLines(from, to)` | Calculates sharp 90° right-angle orthogonal line segments between source node `from` and target node `to` using midpoint routing (`midX = (from.X + to.X) / 2`). |
| `loadDefaultSeedPalette()` | Searches multiple candidate paths (`static/data/modules.json`, `src/static/data/modules.json`, `data/modules.json`, `src/data/modules.json`) to dynamically find layer schemas where `defaultInSeed: true`. Falls back gracefully to default seed layers if files are unreachable. |
| `makeProject(name)` | Allocates a new `Project` struct, populates it with default palette seed layers spaced evenly along the canvas, and initializes ID counters. |
| `cur() *Project` | Returns a pointer to the active `Project`. *Must be called while holding `mu`.* |

---

### 4. [`project_handlers.go`](./project_handlers.go)
Manages multi-model tabs, switching between active models, model creation, deletion, and renaming.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `ListProjectsHandler(w, r)` | `GET /api/projects` | Returns list of all model tabs in creation order alongside the active `currentProjectId`. |
| `CreateProjectHandler(w, r)` | `POST /api/projects/create` | Instantiates a new project with optional `name` query parameter, populates seed palette blocks, sets it as active, and returns its `ProjectMeta`. |
| `SwitchProjectHandler(w, r)` | `POST /api/projects/switch` | Sets the active project to the one specified by query parameter `id`. |
| `DeleteProjectHandler(w, r)` | `POST /api/projects/delete` | Deletes a project by query parameter `id`. Rejects deletion if it is the only existing project. If the active model is deleted, automatically switches to the first remaining model. |
| `RenameModelHandler(w, r)` | `POST /api/rename` | Updates the title of the active project using query parameter `name`. |

---

### 5. [`workspace_handlers.go`](./workspace_handlers.go)
Provides filesystem access, directory navigation, and native operating system dialog integration.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `getSystemDrives()` | *(Helper)* | Probes drive letters A through Z on Windows using `os.Stat` and returns accessible root drives (e.g. `["C:\\", "D:\\"]`). |
| `WorkspaceHandler(w, r)` | `GET /api/workspace` | Returns the current working directory path and base folder name (`WorkspaceResponse`). |
| `SetWorkspaceHandler(w, r)` | `POST /api/workspace/set` | Validates that a path exists and is a directory (via `path` query param or JSON body), then updates `workingDir`. |
| `BrowseWorkspaceHandler(w, r)` | `GET /api/workspace/browse` | Reads subfolders and non-hidden files in the directory specified by `dir` query param (falls back to `workingDir`, user home directory, or root drive). Returns `BrowseResponse`. |
| `SelectNativeFolderHandler(w, r)` | `POST /api/workspace/select-native` | Launches a Windows native folder browser modal via PowerShell (`System.Windows.Forms.FolderBrowserDialog`). If the user confirms a directory, updates `workingDir` and returns the path. |

---

## Related Documentation

- [Root Documentation](../../readme.md) — Comprehensive overview of Ein Theater.
- [Frontend JavaScript Documentation](../static/js/README.md) — Client-side ES6 architecture and Vis.js/Canvas rendering pipeline.
