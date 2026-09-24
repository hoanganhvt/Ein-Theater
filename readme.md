# Ein Theater

Design PyTorch models visually. Build and connect blocks on the Canvas, then save editable model data and generated Python code. Data, Debug, and Code modes are under development.

![Ein Theater Canvas](./assets/Demo_image.png)

## Windows desktop app

Download and run the x64 installer at `desktop/dist/Ein-Theater-Setup-0.1.0.exe` after building. The installer is per-user and does not require administrator rights. This first release is unsigned, so Windows SmartScreen may show a warning.

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

Create the installer and checksum with `npm.cmd run dist:win`. Run `npm.cmd test` for Go, frontend, and desktop checks; run `npm.cmd run smoke:packaged` after building to verify the unpacked app. Build artifacts are under `desktop/dist/`.

The original browser development mode is still available with `cd src; go run .` at `http://localhost:8080`.
