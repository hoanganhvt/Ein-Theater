# Workspace selection, explorer, and model persistence

## Responsibility

`chooser.js` is the single workspace-selection flow. In Electron it asks the
preload bridge to open the Windows directory picker; in browser development on
Windows it calls the Go native-picker endpoint. The old HTML folder browser and
its navigation controls have been removed. `sidebar.js` still lists workspace
files and model folders through `/api/workspace/browse`; the native dialog selects
only a workspace, not a model to load.

| File | Input | Output / responsibility |
| --- | --- | --- |
| [chooser.js](chooser.js) | Optional initial path; Electron bridge or native-picker API | `chooseWorkspace()` returns a cancellation result or sets the selected path through `/api/workspace/set`, updates local state, and refreshes the sidebar. |
| [sidebar.js](sidebar.js) | Current workspace and browse/create-folder responses | Workspace name/path, file list, model-folder actions, and sidebar folder creation. Clicking a regular subfolder reopens the picker with that path as its initial location. |
| [models.js](models.js) | Active project and workspace or model-folder path | Save/load API calls, project and graph refresh, and status messages. Save with no workspace calls `chooseWorkspace()` first; a subsequent save starts generation. |
| [menu.js](menu.js) | File-menu events | Dropdown toggling and dismissal. |
| [notifications.js](notifications.js) | Message text | Transient toast. |

The [public workspace entry](../workspace.js) provides existing global handlers
for template and shell actions. The shared Studio menubar also dispatches
Open Folder to `window.chooseWorkspace`. Feature modules should import the public
entry or the narrow sibling export they need; avoid work during module evaluation
because workspace, sidebar, and model actions reference one another.

## Selection contract

1. Electron `selectDirectory(initialPath)` returns a selected path or `null` on
   cancellation. Electron uses `openDirectory` and `createDirectory`, and uses an
   existing initial directory as the default location.
2. Without the Electron bridge, `POST /api/workspace/select-native` invokes the
   Windows PowerShell picker. This is the supported `go run .` fallback on Windows.
3. A selected path is validated by `POST /api/workspace/set`. Only after it
   succeeds does the UI replace `workingDir`, update the name, and reload files.
   Cancellation leaves the current workspace unchanged. A missing folder or API
   failure rejects the operation without committing the selected path to UI state.
4. `/api/workspace/browse` remains the sidebar's directory/model listing endpoint.
   `/api/workspace/create-folder` remains the sidebar's folder-creation endpoint.
   Load Model operates on model folders shown in the sidebar.

## Verification

From the repository root, run `node src/Canvas/static/js/api.test.mjs` and
`node src/Canvas/static/js/ui.test.mjs`. The UI suite covers successful selection,
cancellation, invalid folders, API errors, and the browser fallback. On Windows,
manually check File > Open Folder, the sidebar change action, empty state, and
Save with no workspace. Cancel the dialog and verify the workspace is unchanged;
select a folder and verify the sidebar refreshes. See the [desktop guide](../../../../../desktop/document.md)
for packaged-app checks.
