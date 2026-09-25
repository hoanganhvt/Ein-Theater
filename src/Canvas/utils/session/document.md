# Desktop session recovery

`session.go` persists the Go graph store when the application supplies a data
directory (Electron passes its `userData` path). Ordinary `go run .` development
without `EIN_THEATER_DATA_DIR` does not enable session persistence. Session data
is recovery state, not an exported model; Save Model still writes JSON and Python
artifacts into the selected workspace.

| Component | Input | Output / side effect |
| --- | --- | --- |
| `New(dataDir, store)` | Writable data directory and graph store | Manager for `session-v1.json`. |
| `Load()` | Existing session file, or `.bak` if the primary file is absent | Restores project order, active project, graphs, Code drafts and file associations, base directories, counters, and workspace. |
| `Schedule()` | Completed mutating request | Debounces a snapshot write by 300 ms. |
| `Flush()` | Current store | Writes indented JSON to `.tmp`, rotates the previous file through `.bak`, and renames the new file into place. Called at shutdown. |

The versioned file records `workingDir`, `currentProjectId`, `nextProjectId`,
`projectOrder`, and each project's ID, name, base directory, Code path, compiled
source path, draft source, saved source baseline, file hash, draft-present flag,
nodes, edges, their order, and next node/edge counters. Undo/redo stacks are not restored. A removed
workspace is cleared on load while the projects and graphs remain available;
the user must select another workspace before saving. An invalid/version-mismatched
session is renamed with a `.corrupt-<timestamp>` suffix and the initial empty
store is retained. If the primary is missing, `Load()` tries `.bak`.

The handler persistence middleware schedules writes after mutating HTTP requests.
Go closes the Python worker and flushes the session on shutdown. Electron stores
window bounds separately in `window-state.json`; frontend viewport state is
separate from this Go session file.

Code mode synchronizes its buffer to the active project before a mode switch,
file switch, and after Save or Compile. The middleware schedules that updated
project state for persistence. Typing alone does not schedule a session write.
See the [Code mode flow](../../../Code/document.md) for the distinct draft,
workspace file, and compiled graph operations.

From `src`, run `go test ./Canvas/utils/session -v`. The focused tests cover
round-trip restoration and failure cases; `go test ./...` checks integration with
the server and handlers. Manually create multiple projects, select a workspace,
close and reopen the packaged app, and verify active project, graphs, workspace,
and viewport. Repeat with the workspace removed and with a corrupted session copy
in a disposable user-data directory.
