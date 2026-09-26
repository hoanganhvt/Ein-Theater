# Desktop build and verification scripts

These Node scripts are called by `desktop/package.json` and operate on the
adjacent Electron package and `../src` Go source. See the [desktop guide](../document.md)
for the app boundary and release checklist.

| Script | Input | Output / side effect |
| --- | --- | --- |
| `prepare-runtime.mjs` | Installed `vis-network` and Inter packages | Local offline vendor assets under `runtime-static/`. |
| `build-go.mjs` | Go source and build environment | Windows sidecar at `build/ein-theater-server.exe`. |
| `dev.mjs` | Prepared assets and sidecar | Launches development Electron with `ELECTRON_RUN_AS_NODE` removed. |
| `test.mjs` | Go and frontend source | Runs Go tests, Studio/Canvas JavaScript regressions, chooser tests, Electron security checks, and Code mode desktop resource checks. Uses `build/go-cache` for Go's cache. |
| `checksum.mjs` | Built NSIS installer | SHA-256 sidecar file for the installer. |
| `smoke-packaged.mjs` | `dist/win-unpacked/Ein Theater.exe` | Starts the packaged app with isolated temporary user data and a stubbed directory picker, asserts startup/UI/security and Code file operations, clicks Close, verifies Electron and Go exit plus saved session/window bounds, and writes a screenshot to `build/`. |

Run `npm.cmd test` from `desktop/` for source checks. After `npm.cmd run dist:win`,
run `npm.cmd run smoke:packaged`. Run `npm.cmd run smoke:packaged -- --dirty`
to check that cancelling an unsaved Code close keeps the app running and confirming it closes.
Run `npm.cmd run smoke:packaged -- --canvas` to exercise the native Canvas window-close path.
The packaged smoke uses a stubbed folder result: it verifies selection wiring but does not exercise the real Windows dialog or
an installed NSIS copy. Verify those manually on a clean Windows VM. Build and
smoke artifacts are ignored by Git; the smoke removes only its own validated
temporary directory.
