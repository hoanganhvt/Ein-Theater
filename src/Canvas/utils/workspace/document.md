# Workspace filesystem tasks

These Go utilities browse directories, identify model folders, create folders,
and invoke the Windows native folder picker. They do not read or modify the
application's active workspace; the HTTP adapter owns that state transition.

| Component | Input | Output / side effects |
| --- | --- | --- |
| `WorkspaceResponse` (`types.go`) | Working directory and display name | JSON fields `workingDir`, `name`. |
| `DirectoryItem` | Name/path, directory flag, size, model status/name | One browser entry; optional file size and model name. |
| `BrowseResponse` | Current/parent paths, drives, folder/file slices | JSON directory listing. Root parent is an empty string. |
| `GetSystemDrives` (`drives.go`) | None | Accessible Windows drive roots A–Z. May return nil when none are found. |
| `Browse` (`operations.go`) | Directory string; may be empty | `BrowseResponse, error`. Empty input tries user home, current directory, then an accessible drive. Skips dot-prefixed entries. A model folder contains corresponding JSON and Python files under the original or normalized name. Invalid directory yields `fault.Invalid`; read failure yields `fault.Internal`. |
| `PickFolder` | Initial directory | Selected path and nil; empty string and nil on cancel; `fault.Internal` on PowerShell failure. Opens an interactive Windows Forms dialog and blocks until it closes. |
| `CreateFolder` | Parent directory and name | Result map with `status`, `path`, `name`, `parent`, or a task error. Trims the name and uses `os.MkdirAll`; existing directories are accepted. Invalid parent/name is an input error; creation failure is internal. |

The package preserves existing path semantics and does not implement a filesystem
sandbox. Callers must supply paths appropriate to their application's access model.

## Test browsing and model-folder recognition

From `src`:

```powershell
go test ./Canvas/handler -run TestWorkspaceModelRoundTrip -v
```

Expected: PASS. The test creates a temporary folder and fixture JSON/Python pair,
checks model recognition and hidden-file filtering, loads the model through both
API aliases, and checks invalid path and method responses. Fixtures are removed
automatically. Python is not executed.

## Test the native picker manually (Windows)

Run `go run .` from `src`. In the UI, select the working-directory picker. Choose
a temporary folder: the response must contain `cancelled: false`, its path and
name, and `/api/workspace` must report the selected folder. Open the picker again
and cancel: expect `cancelled: true` and no workspace change. This interactive
dialog is deliberately excluded from automated tests.
