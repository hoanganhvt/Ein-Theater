# Ein Theater

Design PyTorch models visually. Build and connect blocks on the Canvas, then save editable model data and generated Python code. Code mode is still in development: its current Python editor can edit workspace files and compile supported `nn.Module` classes into Canvas projects. Data and Debug currently have development shells.

Code and Canvas share the active project. A Canvas model saved or loaded from a folder opens its generated Python file in Code; the same file does not appear again in the Python files list. Switching modes keeps the current Code draft in the Go session without saving a Python file or compiling a graph. The [Code mode guide](src/Code/document.md) documents the implemented behavior and limits.

![Ein Theater Canvas](./assets/Demo_image.png)

## Windows desktop app

Build the x64 installer at `desktop/dist/Ein-Theater-Setup-0.1.0.exe` using the commands below. The installer is per-user and does not require administrator rights. This release is unsigned, so Windows SmartScreen may show a warning.

Choose **File → Open Folder** to select a workspace with the Windows folder dialog. The Canvas, workspace, and project tabs are restored when the app reopens. Model files are saved in your selected workspace; session recovery data is stored separately in the app's user data folder.

The desktop window uses an app-designed titlebar with Minimize, Maximize/Restore, and Close controls; there is no default Windows/Electron menu bar.

The installer includes the app and Go server, but **not Python or PyTorch**. Canvas editing works without them. For shape inference and generated Python models, install Python 3 with PyTorch. Ein Theater checks the available interpreters and offers **Configure Python** if needed.

## Build from source on Windows

Install Go 1.18 or newer and Node.js, then run:

```powershell
cd desktop
npm.cmd ci
npm.cmd run dev
```

Create the installer and checksum with `npm.cmd run dist:win`. Run `npm.cmd test` for Go, frontend, and desktop checks; run `npm.cmd run smoke:packaged` after building to verify the unpacked app closes cleanly. Build artifacts are under `desktop/dist/`.

The original browser development mode is still available with `cd src; go run .` at `http://localhost:8080`.
