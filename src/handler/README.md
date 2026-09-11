# Backend Handlers Documentation (`src/handler`)

This directory contains the Go backend HTTP handler functions, domain data structures, and thread-safe state management for **Ein Theater**.

---

## Architecture Overview

All handlers interact with an in-memory state protected by a package-level mutex (`sync.Mutex` `mu`). The server manages:
- **Projects / Models**: Multi-project tabs containing graph nodes, orthogonal edges, and scoped ID counters.
- **Graph Elements**: PyTorch neural network layer blocks (nodes) and directed orthogonal circuit connections (edges).
- **Workspace & Filesystem**: Working directory selection, subfolder creation, directory browsing, verified model detection, and native Windows folder dialog integration via PowerShell.
- **Python Code Generation Subprocess**: Seamless invocation of `src/utils/generate code/gen_code.py` via standard input/output pipes to compile canvas graphs into executable PyTorch `nn.Module` scripts and JSON specifications.

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
        ┌────────────────────────────────┴────────────────────────────────┐
        │                                                                 │
┌───────▼──────────────────────────┐           ┌──────────────────────────▼───────┐
│ Direct Handler Logic (CRUD/Path) │           │ Subprocess: gen_code.py          │
│ Nodes, Edges, Workspace, Drives  │           │   --save-canvas - --out-dir <dir>│
└───────┬──────────────────────────┘           └──────────────────────────┬───────┘
        │                                                                 │
        └────────────────────────────────┬────────────────────────────────┘
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
| `AddNodeHandler(w, r)` | `POST /api/addNode` | Query: `label`, `layerType`, `x`, `y` | Allocates a 0-indexed ID (`<prefix>_<index>`) via `p.getNextNodeID(layerType)`, assigns a clean display label (e.g., `linear 0`, `conv 0`), snaps coordinates to the 50px grid, and adds the node to the active project. Returns created `Node` JSON. |
| `UpdateNodeReq` | *(Struct)* | JSON: `{ "id", "label", "layerType", "params" }` | Request payload struct for updating node attributes and hyperparameters. |
| `UpdateNodeHandler(w, r)` | `POST /api/updateNode` | JSON: `UpdateNodeReq` | Parses JSON body and updates a node's label, layer type, and hyperparameter configuration map (`params`) in the active project. |
| `DeleteNodeHandler(w, r)` | `POST /api/deleteNode` | Query: `id` | Deletes a single node by ID and automatically removes all connected edges. |
| `DeleteNodesHandler(w, r)` | `POST /api/deleteNodes` | JSON array `["linear_0", "conv_0"]` or Query: `ids=linear_0,conv_0` | Batch deletes multiple nodes and all attached edges in a single atomic transaction. |
| `MoveNodeHandler(w, r)` | `POST /api/moveNode` | Query: `id`, `x`, `y` | Updates a node's canvas coordinates after dragging, and automatically adjusts the endpoints of all connected edges while preserving existing intermediate fold waypoints. |
| `AddEdgeReq` | *(Struct)* | JSON: `{ "from", "to", "lines"? }` | Request payload struct for adding an edge, supporting custom straight line segments. |
| `AddEdgeHandler(w, r)` | `POST /api/addEdge` | JSON `AddEdgeReq` or Query: `from`, `to` | Creates or updates a directed connection between two nodes. If custom `lines` are provided (from client-side waypoint routing), saves them directly; otherwise computes orthogonal segments via `ComputeEdgeLines`. Rejects self-loops (`from == to`) and missing node references. If an edge already exists between `from` and `to`, updates its path gracefully. Returns created or updated `Edge` JSON. |
| `UpdateEdgeReq` | *(Struct)* | JSON: `{ "id", "lines" }` | Request payload struct for updating edge lines and waypoint coordinates. |
| `UpdateEdgeHandler(w, r)` | `POST /api/updateEdge` | JSON: `UpdateEdgeReq` | Updates an edge's custom straight line segments when the user drags a diamond fold handle or inverts fold orientation. |
| `DeleteEdgeHandler(w, r)` | `POST /api/deleteEdge` | Query: `id` | Deletes a directed edge identified by query parameter `id`. |
| `ClearGraphHandler(w, r)` | `POST /api/clear` | None | Wipes all nodes and edges from the currently active project canvas and resets `nextNodeID = 0` and `nextEdgeID = 0`. |

---

### 2. [`index_handler.go`](./index_handler.go)
Serves the HTML single-page application entry point.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `IndexHandler(w, r)` | `GET /` | Serves the main application template (`templates/index.html`). Rejects unmatched non-root routes with HTTP 404 Not Found. |

---

### 3. [`models.go`](./models.go)
Defines core domain models, shared thread-safe state, seed palette loading, layer prefix normalization, and 0-indexed ID generation.

#### Data Structures (Types)

- **`Point`**: 2D coordinate `{ X float64, Y float64 }` on the circuit grid.
- **`Line`**: Straight line segment object forming an orthogonal trace. Fields:
  - `First Point`: Starting point of the segment.
  - `Last Point`: Ending point of the segment.
  - `From Point`: Alias for `First` (for serialization compatibility).
  - `To Point`: Alias for `Last` (for serialization compatibility).
- **`Node`**: PyTorch neural layer block. Fields:
  - `ID string`: Unique 0-indexed identifier scoped per layer type (e.g. `"linear_0"`).
  - `Label string`: Formatted multi-line text rendered on the canvas (e.g. `"linear 0"`).
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
  - `ID string`: Unique project ID (e.g. `"proj_0"`).
  - `Name string`: Project title (e.g. `"Untitled Model"`).
  - `Nodes map[string]Node`: Node collection.
  - `Edges map[string]Edge`: Edge collection.
  - `NextNodeID int`, `NextEdgeID int`: Monotonic ID counters.
- **`ProjectMeta`**: Lightweight summary struct (`ID`, `Name`) for project tabs.
- **`GraphData`**: Graph payload containing `ProjectID`, `Name`, `Nodes []Node`, and `Edges []Edge`.
- **`WorkspaceResponse`**: Response containing `WorkingDir` path and base folder `Name`.
- **`DirectoryItem`**: Filesystem entry with `Name`, `Path`, `IsDir`, `Size`, `IsModel bool`, and `ModelName string`.
- **`BrowseResponse`**: Filesystem browser payload with `Current`, `Parent`, `Drives []string`, `Folders []DirectoryItem`, and `Files []DirectoryItem`.

#### Functions & State Management

| Function / Variable | Description |
| :--- | :--- |
| `mu sync.Mutex` | Protects concurrent read/write operations across projects, canvas graphs, and workspace settings. |
| `GridSize = 50.0` | Constant defining the electrical circuit grid dot spacing for alignment. |
| `ComputeEdgeLines(from, to)` | Calculates sharp 90° right-angle orthogonal line segments between source node `from` and target node `to` using midpoint routing (`midX = (from.X + to.X) / 2`). |
| `IsValidModelFolderName(name)` | Validates model naming rules: Latin alphanumeric characters (`a-z`, `A-Z`, `0-9`) and underscores (`_`), no white space, with the first character strictly being a Latin letter. |
| `FixModelName(name)` | Automatically fixes invalid model names: replaces spaces with `_`, and prepends `model_` if a number precedes the text (starts with a digit), guaranteeing a valid identifier. |
| `layerTypeToPrefix(layerType)` | Normalizes layer type to lowercase prefix (e.g. `nn.Linear` → `linear`, `nn.Conv2d` → `conv`, `nn.BatchNorm2d` → `batchnorm`, `nn.MaxPool2d` → `maxpool`, `nn.ReLU` → `relu`). |
| `(p *Project) getNextNodeID(layerType)` | Computes the lowest available 0-indexed ID (`<prefix>_<index>`) for the layer type within the project workspace (e.g. `linear_0`, `linear_1`, `conv_0`, `conv_1`). |
| `makeProject(name)` | Allocates a new empty `Project` struct with 0 nodes, initialized with 0-indexed ID counters scoped to its workspace. |
| `cur() *Project` | Returns a pointer to the active `Project`. *Must be called while holding `mu`.* |

---

### 4. [`project_handlers.go`](./project_handlers.go)
Manages multi-model tabs, switching between active models, model creation, deletion, and renaming.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `ListProjectsHandler(w, r)` | `GET /api/projects` | Returns list of all model tabs in creation order alongside the active `currentProjectId`. |
| `CreateProjectHandler(w, r)` | `POST /api/projects/create` | Instantiates a new project with optional `name` query parameter, initializes with 0 nodes, sets it as active, and returns its `ProjectMeta`. |
| `SwitchProjectHandler(w, r)` | `POST /api/projects/switch` | Sets the active project to the one specified by query parameter `id`. |
| `DeleteProjectHandler(w, r)` | `POST /api/projects/delete` | Deletes a project by query parameter `id`. Rejects deletion if it is the only existing project. If the active model is deleted, automatically switches to the first remaining model. |
| `RenameModelHandler(w, r)` | `POST /api/rename` | Updates the title of the active project using query parameter `name`. |

---

### 5. [`workspace_handlers.go`](./workspace_handlers.go)
Provides filesystem access, directory navigation, folder creation, model serialization via Python code synthesis, and model loading.

| Function | HTTP Method & Route | Description |
| :--- | :--- | :--- |
| `getSystemDrives()` | *(Helper)* | Probes drive letters A through Z on Windows using `os.Stat` and returns accessible root drives (e.g. `["C:\\", "D:\\"]`). |
| `findGenCodePyPath()` | *(Helper)* | Resolves the location of `src/utils/generate code/gen_code.py` by probing candidate paths (`utils/generate code/gen_code.py`, `src/utils/generate code/gen_code.py`, etc.). |
| `WorkspaceHandler(w, r)` | `GET /api/workspace` | Returns the current working directory path and base folder name (`WorkspaceResponse`). |
| `SetWorkspaceHandler(w, r)` | `POST /api/workspace/set` | Validates that a path exists and is a directory (via `path` query param or JSON body), then updates `workingDir`. |
| `BrowseWorkspaceHandler(w, r)` | `GET /api/workspace/browse` | Reads subfolders and non-hidden files in the directory specified by `dir` query param (falls back to `workingDir`, user home directory, or root drive). Checks whether each subfolder contains both `<name>.json` and `<name>.py` and satisfies `IsValidModelFolderName`, setting `IsModel: true` and `ModelName: name`. |
| `SelectNativeFolderHandler(w, r)` | `POST /api/workspace/select-native` | Launches a Windows native folder browser modal via PowerShell (`System.Windows.Forms.FolderBrowserDialog`). If confirmed, updates `workingDir` and returns the path. |
| `CreateFolderHandler(w, r)` | `POST /api/workspace/create-folder` | Creates a new subdirectory inside the target directory specified by `dir` and `name`. |
| `SaveModelHandler(w, r)` | `POST /api/workspace/save-model`<br>`POST /api/saveModel` | Serializes the active project canvas, invokes `python "src/utils/generate code/gen_code.py" --save-canvas - --out-dir <targetDir>` via standard input pipe, and generates `<model_name>/<model_name>.json` and `<model_name>/<model_name>.py`. Returns save status JSON. |
| `LoadModelHandler(w, r)` | `POST /api/workspace/load-model`<br>`POST /api/loadModel` | Reads `<model_name>/<model_name>.json`, validates naming rules, loads all nodes with clean labels, restores orthogonal connections, updates project tabs, and makes the model active. |

---

### 6. [`main.go`](../main.go) Server Entry Point & Routing

The server entry point initializes route handlers and configures the listener:

- **Configurable Port**: Reads `PORT` environment variable (`os.Getenv("PORT")`), falling back to `:8080`.
- **Registered Route Table**:
  ```go
  // Static assets & index
  http.HandleFunc("/", handler.IndexHandler)
  http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
  http.HandleFunc("/data", handler.DataHandler)
  http.HandleFunc("/api/data", handler.DataHandler)

  // Project management
  http.HandleFunc("/api/projects", handler.ListProjectsHandler)
  http.HandleFunc("/api/projects/create", handler.CreateProjectHandler)
  http.HandleFunc("/api/projects/switch", handler.SwitchProjectHandler)
  http.HandleFunc("/api/projects/delete", handler.DeleteProjectHandler)

  // Workspace & model save/load
  http.HandleFunc("/api/workspace", handler.WorkspaceHandler)
  http.HandleFunc("/api/workspace/set", handler.SetWorkspaceHandler)
  http.HandleFunc("/api/workspace/browse", handler.BrowseWorkspaceHandler)
  http.HandleFunc("/api/workspace/select-native", handler.SelectNativeFolderHandler)
  http.HandleFunc("/api/workspace/create-folder", handler.CreateFolderHandler)
  http.HandleFunc("/api/workspace/save-model", handler.SaveModelHandler)
  http.HandleFunc("/api/saveModel", handler.SaveModelHandler)
  http.HandleFunc("/api/workspace/load-model", handler.LoadModelHandler)
  http.HandleFunc("/api/loadModel", handler.LoadModelHandler)

  // Canvas operations
  http.HandleFunc("/api/rename", handler.RenameModelHandler)
  http.HandleFunc("/api/addNode", handler.AddNodeHandler)
  http.HandleFunc("/api/updateNode", handler.UpdateNodeHandler)
  http.HandleFunc("/api/deleteNode", handler.DeleteNodeHandler)
  http.HandleFunc("/api/deleteNodes", handler.DeleteNodesHandler)
  http.HandleFunc("/api/moveNode", handler.MoveNodeHandler)
  http.HandleFunc("/api/addEdge", handler.AddEdgeHandler)
  http.HandleFunc("/api/updateEdge", handler.UpdateEdgeHandler)
  http.HandleFunc("/api/deleteEdge", handler.DeleteEdgeHandler)
  http.HandleFunc("/api/clear", handler.ClearGraphHandler)
  ```

---

## Related Documentation

- [Root Documentation](../../readme.md) — Comprehensive overview of Ein Theater.
- [Frontend JavaScript Documentation](../static/js/README.md) — Client-side ES6 architecture and Vis.js/Canvas rendering pipeline.
