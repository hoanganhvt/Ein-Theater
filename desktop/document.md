# Windows desktop shell

The `desktop/` package owns Electron startup and distribution for Windows 10/11
x64. The Go application remains the HTTP/graph owner; Electron supplies a native
window, OS dialogs, a local-only authenticated transport, and packaging. See the
[project runtime guide](../document.md) for the full UI-to-Go-to-Python flow.

## Components and boundaries

| Component | Input | Output / responsibility |
| --- | --- | --- |
| `main.cjs` | Electron lifecycle, `userData`, packaged/development paths | Starts the Go sidecar, waits for its JSON `ready` message, opens the window, handles native dialogs/window controls, and ends sidecar stdin on quit. |
| `preload.cjs` | Renderer requests | Exposes only `window.einDesktop.selectDirectory`, `selectPythonExecutable`, and `windowControls` methods. It does not expose Node APIs. |
| `scripts/prepare-runtime.mjs` | Installed local dependencies | Copies `vis-network` and Inter font assets to `runtime-static/` for offline development and packaging. |
| `scripts/build-go.mjs` | Go sources | Builds `build/ein-theater-server.exe`. |
| `package.json` | Build scripts and electron-builder configuration | NSIS per-user x64 installer, with Go executable and resources outside ASAR. |
| `scripts/test.mjs`, `scripts/smoke-packaged.mjs` | Source tree and unpacked build | Unit/integration checks and packaged-app smoke assertions. |

The [script contracts](scripts/document.md) and [security test](test/document.md)
describe each build/check boundary in more detail.

The main process launches the sidecar with `EIN_THEATER_DESKTOP=1`, an explicit
`EIN_THEATER_RESOURCE_DIR`, `EIN_THEATER_DATA_DIR` equal to Electron `userData`, and
a random per-run `EIN_THEATER_AUTH_TOKEN`. Go listens on `127.0.0.1:0`; its `ready`
JSON supplies the actual URL. Electron injects `X-Ein-Theater-Token` into requests
to that origin; Go rejects missing or wrong tokens. The window appears only after
the server is ready. Closing Electron closes sidecar stdin, which triggers Go's
graceful shutdown and session flush. In browser development, `go run .` continues
to use the configured `PORT` (8080 by default) without desktop token auth.
Shutdown stages are recorded in `userData/shutdown.log`. If saving window bounds fails,
the error is logged and the app still closes. A Go server that does not stop within
5.5 seconds is terminated so Electron can exit.

`BrowserWindow` uses `contextIsolation`, `sandbox`, and disabled Node integration.
The app denies popups, navigation away from its loopback origin, and permission
requests. It serves bundled JavaScript and fonts locally, so the UI needs no
network connection.

## Native desktop UI

The window is frameless (`frame: false`) and has no Electron/Windows application
menu. The shared Studio menubar mounts a draggable region plus app-styled Minimize,
Maximize/Restore, and Close buttons on every mode page. The preload forwards only
these actions to the main process, which checks that the request came from the
trusted main frame. Maximize changes update the button label and icon. Browser
development has neither the bridge nor these custom controls and keeps the
browser's native chrome. The related renderer code is documented in the
[Studio UI guide](../src/static/studio/document.md).
If Code has unsaved changes, closing the window presents a discard confirmation;
Cancel leaves the window and server running. Close IPC failures are shown in the UI.

`workspace:select-directory` opens the Windows directory picker with
`openDirectory` and `createDirectory`; an existing initial path becomes its
default location. Cancellation returns `null` and does not change the workspace.
The renderer's `chooseWorkspace()` then validates a selection with
`/api/workspace/set` and refreshes the sidebar. The separate
`runtime:select-python` picker selects a `python.exe`. Neither picker grants the
renderer general filesystem access.

## User data and Python

The sidecar stores session recovery in `userData/session-v1.json`; Electron stores
window bounds in `userData/window-state.json`. A configured Python executable is
stored in `userData/python-v1.json`. These are distinct from saved model artifacts
in the chosen workspace. Session recovery includes projects and graphs, but not
undo/redo history. Recovery also includes each project's synchronized Code draft
and Python file association. A mode switch synchronizes the draft to Go without
saving the `.py` file or compiling Canvas. See the
[Code mode flow](../src/Code/document.md) and
[session contract](../src/Canvas/utils/session/document.md).

Python and PyTorch are **not** bundled. Detection validates the saved executable
or, on Windows, `py -3`, `python`, and `python3`. Without an importable PyTorch,
canvas editing still works, but inference and Save Model cannot run. The UI
offers Configure Python on Canvas and Code mode, using the Windows executable picker. Code mode's bundled converter can list classes and compile a model once Python/PyTorch is configured. See the
[Python bridge guide](../src/Canvas/utils/python/document.md).

## Build and verify

From `desktop/`, with Node.js and the Go toolchain installed:

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd test
npm.cmd run dist:win
npm.cmd run smoke:packaged
```

`dist:win` produces `dist/Ein-Theater-Setup-0.1.0.exe` and a SHA-256 checksum
file. The installer is per-user, does not require elevation, and is currently
unsigned; Windows SmartScreen may warn. Build output is ignored by Git. The
packaged smoke checks loading, bundled assets, workspace selection through a
test dialog stub, absence of the HTML folder modal/native menu, custom controls,
maximize/restore, `/api/health`, Code mode assets, and Code file create/read/delete.
It clicks Close, verifies Electron and Go exit, and checks saved window bounds and
session state. The `--dirty` variant checks Cancel and Discard for unsaved Code;
`--canvas` checks the native Canvas close path. These checks do **not** replace a
clean Windows VM install or manual real-dialog/minimize/close testing. In a clean
VM, also verify offline launch, Unicode/space-containing paths, no-Python behavior,
Python plus PyTorch inference and save, and recovery after reopening the app.

Version 0.1.0 does not include code signing, auto-update, ARM64, file
associations, telemetry, or crash reporting.
